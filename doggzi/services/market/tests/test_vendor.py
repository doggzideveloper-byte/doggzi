"""Vendor panel: a store only ever sees and changes its own orders, listings, payouts and profile."""
import io
import uuid

from sqlalchemy import select

from app.api.v1 import vendor as vendor_api
from app.main import app
from app.models import Listing, ProductRequest, SubOrder, Vendor, VendorMember

from .conftest import API, auth, console_token, token

V = f"{API}/vendor"
ADDR = {"line1": "Flat 12B", "line2": "Sector 56", "city": "Gurgaon", "pincode": "122011"}


def _member(S, vendor_id, role="owner"):
    uid = uuid.uuid4()
    with S() as s:
        s.add(VendorMember(vendor_id=vendor_id, user_id=uid, phone="+919000000002", name="Meera", role=role))
        s.commit()
    return auth(console_token(uid))


def _stores(ctx):
    c, S = ctx
    with S() as s:
        doggzi = s.scalar(select(Vendor).where(Vendor.is_doggzi.is_(True)))
        other = Vendor(name="Paws Corner", slug="paws-corner", serviceable_pincodes=["122011"], delivery_fee_paise=3900, commission_bps=1000)
        s.add(other)
        s.flush()
        lid = s.scalars(select(Listing).where(Listing.vendor_id == doggzi.id)).first()
        s.add(Listing(vendor_id=other.id, product_id=lid.product_id, sku="PAWS-001", price_paise=25000, stock_qty=5))
        s.commit()
        return doggzi.id, other.id


def _order(c, S, vendor_id, qty=1):
    """A paid customer order containing one listing from `vendor_id`; returns the sub-order id."""
    with S() as s:
        lid = s.scalars(select(Listing).where(Listing.vendor_id == vendor_id, Listing.stock_qty > 2)).first().id
    h = auth(token())
    r = c.post(f"{API}/orders", json={"address": ADDR, "lines": [{"listing_id": str(lid), "qty": qty}], "pet": {"name": "Bruno", "type": "dog", "breed": "Labrador Retriever"}}, headers=h)
    assert r.status_code == 201, r.text
    oid = r.json()["order"]["id"]
    assert c.post(f"{API}/orders/{oid}/pay/mock", headers=h).status_code == 200
    with S() as s:
        return str(s.scalar(select(SubOrder.id).where(SubOrder.vendor_id == vendor_id, SubOrder.order_id == uuid.UUID(oid))))


def test_vendor_sees_only_its_own_orders_and_listings(ctx):
    c, S = ctx
    mine, theirs = _stores(ctx)
    me, other = _member(S, mine), _member(S, theirs)
    so = _order(c, S, mine)
    _order(c, S, theirs)
    rows = c.get(f"{V}/sub-orders", headers=me).json()
    assert [r["id"] for r in rows] == [so] and rows[0]["pet"]["name"] == "Bruno"
    assert rows[0]["customer_phone"] == "98xxxxxx10" and rows[0]["address"] is None  # masked until accepted
    assert all(r["id"] != so for r in c.get(f"{V}/sub-orders", headers=other).json())
    for path, body in [("accept", None), ("reject", {"reason": "Too far"}), ("checks", {"checks": [True]}), ("packed", None), ("out", None), ("delivered", {})]:
        assert c.post(f"{V}/sub-orders/{so}/{path}", json=body, headers=other).status_code == 404, path
    their_listing = c.get(f"{V}/listings", headers=other).json()[0]["id"]
    assert len(c.get(f"{V}/listings", headers=other).json()) == 1
    assert c.patch(f"{V}/listings/{their_listing}", json={"stock_qty": 0}, headers=me).status_code == 404
    assert c.post(f"{V}/listings/{their_listing}/photos", files={"file": ("a.jpg", b"x", "image/jpeg")}, headers=me).status_code == 404
    assert all(r["ref"] != "SO-" + so[:4].upper() for r in c.get(f"{V}/payouts", headers=other).json()["rows"])


def test_panel_needs_a_vendor_console_session_and_a_store(ctx):
    c, S = ctx
    assert c.get(f"{V}/store").status_code == 401
    assert c.get(f"{V}/store", headers=auth(token())).status_code == 401  # website token
    assert c.get(f"{V}/store", headers=auth(console_token(uuid.uuid4(), roles=("PROVIDER",)))).status_code == 403
    assert c.get(f"{V}/store", headers=auth(console_token(uuid.uuid4()))).status_code == 403  # VENDOR role but no store


def test_order_flow_accept_pack_out_deliver_releases_payout(ctx):
    c, S = ctx
    mine, _ = _stores(ctx)
    h = _member(S, mine)
    so = _order(c, S, mine, qty=2)
    u = f"{V}/sub-orders/{so}"
    assert c.post(f"{u}/packed", headers=h).status_code == 409
    a = c.post(f"{u}/accept", headers=h).json()
    assert a["status"] == "accepted" and a["phone_visible"] and a["customer_phone"] == "+919876543210" and a["address"]["line1"] == "Flat 12B"
    assert c.post(f"{u}/packed", headers=h).status_code == 409  # checklist first
    assert c.post(f"{u}/checks", json={"checks": [True, True]}, headers=h).status_code == 422
    assert c.post(f"{u}/checks", json={"checks": [True]}, headers=h).json()["pack_checks"] == [True]
    assert c.post(f"{u}/packed", headers=h).json()["status"] == "packed"
    assert c.post(f"{u}/delivered", json={}, headers=h).status_code == 409  # must go out first
    assert c.post(f"{u}/out", headers=h).json()["status"] == "out_for_delivery"
    p = c.get(f"{V}/payouts", headers=h).json()
    assert p["on_hold_paise"] > 0 and p["released_paise"] == 0
    right = vendor_api.delivery_code(uuid.UUID(so))
    wrong = "0000" if right != "0000" else "1111"
    r = c.post(f"{u}/delivered", json={"code": wrong}, headers=h)
    assert r.status_code == 422 and "4 tries left" in r.json()["detail"]
    d = c.post(f"{u}/delivered", json={"code": right}, headers=h).json()
    assert d["status"] == "delivered" and not d["phone_visible"]
    p = c.get(f"{V}/payouts", headers=h).json()
    row = p["rows"][0]
    assert p["on_hold_paise"] == 0 and row["status"] == "released" and row["net_paise"] == row["order_value_paise"] - row["commission_paise"] + row["delivery_fee_paise"]
    csv = c.get(f"{V}/payouts/statement.csv", params={"month": __import__("datetime").date.today().strftime("%Y-%m")}, headers=h)
    assert csv.status_code == 200 and csv.text.splitlines()[0].startswith("sub_order,") and "TOTAL" in csv.text


def test_reject_returns_stock_and_missed_orders_go_to_ops(ctx):
    c, S = ctx
    mine, _ = _stores(ctx)
    h = _member(S, mine)
    so = _order(c, S, mine)
    with S() as s:
        it = s.get(SubOrder, uuid.UUID(so)).items[0]
        before = s.get(Listing, it.listing_id).stock_qty
        lid = it.listing_id
    assert c.post(f"{V}/sub-orders/{so}/reject", json={"reason": "Free text"}, headers=h).status_code == 422
    r = c.post(f"{V}/sub-orders/{so}/reject", json={"reason": "Out of stock"}, headers=h).json()
    assert r["status"] == "rejected" and r["reject_reason"] == "Out of stock"
    with S() as s:
        assert s.get(Listing, lid).stock_qty == before + 1
    late = _order(c, S, mine)
    with S() as s:
        x = s.get(SubOrder, uuid.UUID(late))
        x.sla_due_at = x.created_at
        s.commit()
    assert all(r["id"] != late for r in c.get(f"{V}/sub-orders", headers=h).json())
    assert c.post(f"{V}/sub-orders/{late}/accept", headers=h).status_code == 409
    with S() as s:
        assert s.get(SubOrder, uuid.UUID(late)).status == "missed"


def test_listings_price_mrp_stock_and_holiday_mode_hide_from_shop(ctx):
    c, S = ctx
    mine, _ = _stores(ctx)
    h = _member(S, mine)
    lst = c.get(f"{V}/listings", headers=h).json()
    x = lst[0]
    assert c.patch(f"{V}/listings/{x['id']}", json={"mrp_paise": x["price_paise"] - 1}, headers=h).status_code == 422
    r = c.patch(f"{V}/listings/{x['id']}", json={"mrp_paise": x["price_paise"] + 5000, "stock_qty": 3}, headers=h).json()
    assert r["mrp_paise"] == x["price_paise"] + 5000 and r["stock_qty"] == 3
    shop = lambda: {i["sku"] for i in c.get(f"{API}/catalog", params={"pet_type": "dog"}).json()["items"]}  # noqa: E731
    assert x["sku"] in shop()
    assert c.patch(f"{V}/store", json={"holiday_mode": True}, headers=h).json()["holiday_mode"] is True
    assert shop() == {"PAWS-001"} and c.get(f"{API}/browse").json()["total"] == 1  # only the other store is left
    c.patch(f"{V}/store", json={"holiday_mode": False}, headers=h)
    c.patch(f"{V}/listings/{x['id']}", json={"is_active": False}, headers=h)
    assert x["sku"] not in shop()
    hits = c.get(f"{V}/catalog", params={"q": x["name"][:8]}, headers=h).json()
    assert any(hh["already_listed"] for hh in hits)
    pid = hits[0]["product_id"]
    assert c.post(f"{V}/listings", json={"product_id": pid, "price_paise": 1000}, headers=h).status_code == 409
    assert c.post(f"{V}/product-requests", json={"name": "Brand new chew", "category": "treats"}, headers=h).status_code == 201


def test_csv_export_import_only_touches_my_listings(ctx):
    c, S = ctx
    mine, theirs = _stores(ctx)
    h = _member(S, mine)
    exp = c.get(f"{V}/listings/export.csv", headers=h)
    lines = exp.text.splitlines()
    assert lines[0] == ",".join(vendor_api.CSV_COLS) and len(lines) == 51
    first = lines[1].split(",")
    sku = first[1]
    csv = "sku,name,price_inr,mrp_inr,stock,active\n" + f"{sku},x,199.00,249.00,7,yes\nPAWS-001,steal,1.00,,0,no\nNEW-1,Fresh new treat,99,,,\nBAD,,abc,,,\n"
    r = c.post(f"{V}/listings/import", files={"file": ("l.csv", io.BytesIO(csv.encode()), "text/csv")}, headers=h).json()
    assert r["updated"] == 1 and r["requested"] == 2 and len(r["errors"]) == 1  # another store's SKU is only a request for MY store; BAD is invalid
    with S() as s:
        mine_row = s.scalar(select(Listing).where(Listing.vendor_id == mine, Listing.sku == sku))
        theirs_row = s.scalar(select(Listing).where(Listing.vendor_id == theirs))
        assert (mine_row.price_paise, mine_row.mrp_paise, mine_row.stock_qty) == (19900, 24900, 7)
        assert theirs_row.price_paise == 25000 and theirs_row.stock_qty == 5 and theirs_row.is_active
        assert s.scalar(select(ProductRequest).where(ProductRequest.name == "Fresh new treat")).vendor_id == mine
    assert c.post(f"{V}/listings/import", files={"file": ("l.csv", io.BytesIO(b"name\nx"), "text/csv")}, headers=h).status_code == 422


def test_store_profile_staff_invite_owner_only(ctx):
    c, S = ctx
    mine, _ = _stores(ctx)
    owner = _member(S, mine, "owner")
    staff_uid = uuid.uuid4()
    app.dependency_overrides[vendor_api.get_granter] = lambda: (lambda phone, name: staff_uid)
    try:
        r = c.post(f"{V}/store/staff", json={"phone": "98111 00011", "name": "Rohit"}, headers=owner)
        assert r.status_code == 201 and any(m["name"] == "Rohit" and m["role"] == "Staff" for m in r.json()["staff"])
        staff = auth(console_token(staff_uid))
        assert c.get(f"{V}/store", headers=staff).json()["my_role"] == "staff"
        assert c.post(f"{V}/store/staff", json={"phone": "9811100012"}, headers=staff).status_code == 403
        assert c.patch(f"{V}/store", json={"delivery_fee_paise": 0}, headers=staff).status_code == 403
        assert c.patch(f"{V}/store", json={"story": "Fresh treats daily", "low_stock_threshold": 8}, headers=staff).json()["low_stock_threshold"] == 8
        assert c.patch(f"{V}/store", json={"serviceable_pincodes": ["12345"]}, headers=owner).status_code == 422
        assert c.post(f"{V}/store/staff", json={"phone": "12345"}, headers=owner).status_code == 422
    finally:
        app.dependency_overrides.pop(vendor_api.get_granter, None)


def test_demo_seed_twice_without_duplicates(ctx):
    c, S = ctx
    from app import seed_demo

    with S() as s:
        seed_demo.seed(s)
        n = len(s.scalars(select(SubOrder.id)).all())
        seed_demo.seed(s)
        assert len(s.scalars(select(SubOrder.id)).all()) == n == 11
    h = auth(console_token(seed_demo.user_id("+919000000002")))
    cols = [r["status"] for r in c.get(f"{V}/sub-orders", headers=h).json()]
    assert sorted(cols) == ["accepted", "out_for_delivery", "packed", "placed"]
    arjun = auth(console_token(seed_demo.user_id("+919000000005")))
    assert c.get(f"{V}/store", headers=arjun).json()["name"] == "Paws Corner" and c.get(f"{V}/sub-orders", headers=arjun).json() == []
