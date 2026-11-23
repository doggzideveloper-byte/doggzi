"""Admin back office (internal API used by services/admin): orders (cancel / undo / refund / reassign / OPS order),
catalog (block hides from the shop, brand fixes, new products, approvals), vendor pipeline (only Live sells)."""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import Listing, Product, ProductRequest, SubOrder, Vendor

from .conftest import API
from .test_vendor import ADDR, _order, _stores

A = f"{API}/internal/admin"
H = {"X-Internal-Token": "test-internal"}


def _so(S, sid):
    with S() as s:
        return s.get(SubOrder, uuid.UUID(sid))


def _stock(S, sid):
    with S() as s:
        so = s.get(SubOrder, uuid.UUID(sid))
        return s.get(Listing, so.items[0].listing_id).stock_qty


def test_internal_api_needs_the_token(ctx):
    c, _ = ctx
    assert c.get(f"{A}/sub-orders").status_code == 403
    assert c.get(f"{A}/sub-orders", headers={"X-Internal-Token": "nope"}).status_code == 403
    assert c.get(f"{A}/sub-orders", headers=H).status_code == 200


def test_cancel_returns_stock_and_undo_takes_it_again(ctx):
    c, S = ctx
    doggzi, _ = _stores(ctx)
    sid = _order(c, S, doggzi, qty=2)
    st = _stock(S, sid)
    r = c.post(f"{A}/sub-orders/{sid}/cancel", headers=H).json()
    assert r["status"] == "cancelled" and r["before"] == "placed" and _stock(S, sid) == st + 2
    assert c.post(f"{A}/sub-orders/{sid}/cancel", headers=H).status_code == 409
    assert c.post(f"{A}/sub-orders/{sid}/uncancel", params={"to": "placed"}, headers=H).json()["status"] == "placed"
    assert _stock(S, sid) == st


def test_refund_is_recorded_once_and_cancels_an_open_order(ctx):
    c, S = ctx
    doggzi, _ = _stores(ctx)
    sid = _order(c, S, doggzi)
    r = c.post(f"{A}/sub-orders/{sid}/refund", headers=H).json()
    assert r["refund_status"] == "refunded" and r["status"] == "cancelled" and r["refunded_paise"] == r["total_paise"]
    assert c.post(f"{A}/sub-orders/{sid}/refund", headers=H).status_code == 409
    assert c.post(f"{A}/sub-orders/{sid}/uncancel", params={"to": "placed"}, headers=H).status_code == 409  # refunded: no undo
    pay = c.get(f"{A}/payments", headers=H).json()
    assert pay["refunds"][0]["ref"] == r["ref"] and pay["route"][0]["status"] == "Reversed"


def test_rejected_order_goes_to_another_store_with_the_same_prices(ctx):
    c, S = ctx
    doggzi, paws = _stores(ctx)
    with S() as s:
        prod = s.scalar(select(Listing).where(Listing.vendor_id == paws)).product_id
        lid = s.scalar(select(Listing).where(Listing.vendor_id == doggzi, Listing.product_id == prod)).id
        s.get(Listing, lid).stock_qty = 10
        s.commit()
    from tests.conftest import auth, token

    h = auth(token())
    oid = c.post(f"{API}/orders", json={"address": ADDR, "lines": [{"listing_id": str(lid), "qty": 1}]}, headers=h).json()["order"]["id"]
    c.post(f"{API}/orders/{oid}/pay/mock", headers=h)
    with S() as s:
        so = s.scalar(select(SubOrder).where(SubOrder.order_id == uuid.UUID(oid)))
        sid, paid = str(so.id), so.subtotal_paise
    assert c.post(f"{A}/sub-orders/{sid}/reassign", json={"vendor_id": str(paws)}, headers=H).status_code == 409  # not rejected yet
    with S() as s:
        s.get(SubOrder, uuid.UUID(sid)).status = "rejected"
        s.commit()
    r = c.post(f"{A}/sub-orders/{sid}/reassign", json={"vendor_id": str(paws)}, headers=H)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["vendor"] == "Paws Corner" and j["status"] == "placed" and j["subtotal_paise"] == paid and j["before"] == "Doggzi Store"
    with S() as s:
        assert s.scalar(select(Listing).where(Listing.vendor_id == paws)).stock_qty == 4


def test_ops_order_is_paid_on_delivery_and_reaches_the_store(ctx):
    c, S = ctx
    doggzi, _ = _stores(ctx)
    lid = c.get(f"{A}/listings", params={"vendor_id": str(doggzi)}, headers=H).json()[0]["id"]
    body = {"user_id": str(uuid.uuid4()), "customer_phone": "+919876543210", "address": ADDR, "listing_id": lid, "qty": 2}
    r = c.post(f"{A}/orders", json=body, headers=H)
    assert r.status_code == 200 or r.status_code == 201, r.text
    assert r.json()["status"] == "placed" and r.json()["payment_mode"] == "ops"
    assert c.post(f"{A}/orders", json={**body, "address": {**ADDR, "pincode": "560001"}}, headers=H).status_code == 422
    assert c.post(f"{A}/orders", json={**body, "qty": 999}, headers=H).status_code == 422


def test_blocked_product_leaves_the_shop(ctx):
    c, S = ctx
    p = c.get(f"{A}/products", headers=H).json()[0]
    before = {x["id"] for x in c.get(f"{API}/catalog", params={"pet_type": "dog"}).json()["items"]}
    r = c.patch(f"{A}/products/{p['id']}", json={"is_blocked": True, "brand": "Fixed Brand", "brand_confirmed": True}, headers=H).json()
    assert r["is_blocked"] and r["brand"] == "Fixed Brand" and r["before"]["is_blocked"] is False
    after = c.get(f"{API}/catalog", params={"pet_type": "dog"}).json()["items"]
    assert len(after) == len(before) - 1 and all(i["name"] != p["name"] for i in after)
    with S() as s:
        lid = s.scalar(select(Listing).join(Listing.product).where(Product.id == uuid.UUID(p["id"]))).id
    assert c.get(f"{API}/listings/{lid}").status_code == 404
    assert c.post(f"{API}/cart/items", json={"listing_id": str(lid), "qty": 1}, headers={"X-Cart-Id": str(uuid.uuid4())}).status_code == 404


def test_new_product_is_listed_in_doggzi_store(ctx):
    c, S = ctx
    body = {"name": "Chicken Jerky Strips", "brand": "Doggzi", "category": "treats", "pet_type": "dog", "price_paise": 34900, "mrp_paise": 39900}
    r = c.post(f"{A}/products", json=body, headers=H)
    assert r.status_code == 201 and r.json()["sku"].startswith("DZ-MKT-") and r.json()["stores"] == ["Doggzi Store"]
    assert c.post(f"{A}/products", json={**body, "mrp_paise": 100}, headers=H).status_code == 422
    names = [i["name"] for i in c.get(f"{API}/catalog", params={"pet_type": "dog"}).json()["items"]]
    assert "Chicken Jerky Strips" in names


def test_vendor_pipeline_only_live_unpaused_stores_sell(ctx):
    c, S = ctx
    v = c.post(f"{A}/vendors", json={"name": "Happy Tails", "area": "DLF Phase 4", "phone": "98100 11122", "commission_pct": 12, "pincodes": ["122011"]}, headers=H).json()
    assert v["stage"] == "applied" and v["commission_pct"] == 12 and v["phone"] == "+919810011122"
    assert c.post(f"{A}/vendors", json={"name": "X", "area": "Y", "phone": "123", "commission_pct": 99, "pincodes": ["12"]}, headers=H).status_code == 422
    with S() as s:
        prod = s.scalars(select(Product)).first()
        s.add(Listing(vendor_id=uuid.UUID(v["id"]), product_id=prod.id, sku="HT-001", price_paise=1000, stock_qty=5))
        s.commit()
    shop = lambda: {i["vendor"]["name"] for i in c.get(f"{API}/catalog", params={"pet_type": "dog"}).json()["items"]}  # noqa: E731
    assert "Happy Tails" not in shop()
    uid = uuid.uuid4()
    r = c.patch(f"{A}/vendors/{v['id']}", json={"stage": "live", "owner_user_id": str(uid)}, headers=H).json()
    assert r["stage"] == "live" and r["owner_user_id"] == str(uid) and r["before"]["stage"] == "applied"
    assert "Happy Tails" in shop()
    c.patch(f"{A}/vendors/{v['id']}", json={"paused": True}, headers=H)
    assert "Happy Tails" not in shop()


def test_approvals_photo_and_product_request(ctx):
    c, S = ctx
    doggzi, _ = _stores(ctx)
    with S() as s:
        x = s.scalars(select(Listing).where(Listing.vendor_id == doggzi)).first()
        x.photo_status, x.photo_meta = "pending", {"name": "a.jpg"}
        s.add(ProductRequest(vendor_id=doggzi, name="Tick shampoo", brand="Himalaya", category="grooming", price_paise=29900))
        s.commit()
        lid = x.id
    ap = c.get(f"{A}/approvals", headers=H).json()
    assert len(ap["photos"]) == 1 and len(ap["requests"]) == 1
    assert c.post(f"{A}/listings/{lid}/photo", json={"approve": True}, headers=H).json()["photo_status"] == "approved"
    r = c.post(f"{A}/product-requests/{ap['requests'][0]['id']}", json={"approve": True}, headers=H).json()
    assert r["status"] == "approved" and r["product_id"]
    assert c.get(f"{A}/approvals", headers=H).json() == {"photos": [], "requests": []}


def test_stats_and_needs_ops(ctx):
    c, S = ctx
    doggzi, _ = _stores(ctx)
    sid = _order(c, S, doggzi)
    with S() as s:
        s.get(SubOrder, uuid.UUID(sid)).sla_due_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        s.commit()
    now = datetime.now(timezone.utc)
    st = c.get(f"{A}/stats", params={"from": (now - timedelta(days=1)).isoformat(), "to": (now + timedelta(days=1)).isoformat()}, headers=H).json()
    assert st["orders"] == 1 and st["by_status"]["rejected"] == 1  # missed counts with rejected
    assert st["needs_ops"][0]["reason"] == "Not accepted in time"
    vs = {v["name"]: v for v in c.get(f"{A}/vendors", headers=H).json()}
    assert vs["Doggzi Store"]["stage"] == "live"
