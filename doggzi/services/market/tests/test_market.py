import uuid
from datetime import timedelta

from app.core.time import utcnow
from app.models import Listing, StockReservation, Vendor

from .conftest import API, auth, token

ADDR = {"line1": "Flat 12B", "line2": "Sector 56", "city": "Gurgaon", "pincode": "122011"}


def _items(c, **params):
    return c.get(f"{API}/catalog", params={"pet_type": "dog", **params}).json()["items"]


def _by_sku(c, sku, pet="dog"):
    return next(i for i in c.get(f"{API}/catalog", params={"pet_type": pet}).json()["items"] if i["sku"] == sku)


def test_seed_skips_medicine_and_keeps_flags():
    from app.seed import product_rows

    rows = product_rows()
    assert len(rows) == 50 and not any("GRIPTOL" in r["name"].upper() for r in rows)
    flagged = [r for r in rows if "brand_mismatch" in r["source_flags"]]
    assert len(flagged) == 12 and all(r["brand_as_listed"] for r in flagged)


def test_catalog_filters_by_pet_and_category(ctx):
    c, _ = ctx
    dog = _items(c)
    cat = c.get(f"{API}/catalog", params={"pet_type": "cat"}).json()["items"]
    assert len(dog) == 48 and len(cat) == 4
    assert {i["category"] for i in _items(c, category="treats")} == {"treats"}
    assert all(i["vendor"]["name"] == "Doggzi Store" and i["in_stock"] for i in dog)


def test_catalog_search_sort_and_price(ctx):
    c, _ = ctx
    assert all("jerhigh" in (i["name"] + i["brand"]).lower() for i in _items(c, q="jerhigh"))
    prices = [i["price_paise"] for i in _items(c, sort="price_asc")]
    assert prices == sorted(prices)
    assert all(25000 <= i["price_paise"] <= 50000 for i in _items(c, price_min=25000, price_max=50000))
    assert c.get(f"{API}/catalog", params={"pet_type": "parrot"}).status_code == 422


def test_listing_and_vendor(ctx):
    c, _ = ctx
    item = _items(c)[0]
    assert c.get(f"{API}/listings/{item['id']}").json()["sku"] == item["sku"]
    assert c.get(f"{API}/vendors/doggzi-store").json()["is_doggzi"] is True
    assert c.get(f"{API}/vendors/nope").status_code == 404


def test_cart_groups_by_store_and_prices_server_side(ctx):
    c, _ = ctx
    h = {"X-Cart-Id": str(uuid.uuid4())}
    a, b = _items(c)[:2]
    c.post(f"{API}/cart/items", json={"listing_id": a["id"], "qty": 2}, headers=h)
    cart = c.post(f"{API}/cart/items", json={"listing_id": b["id"], "qty": 1}, headers=h).json()
    assert cart["item_count"] == 3 and len(cart["groups"]) == 1
    g = cart["groups"][0]
    assert g["subtotal_paise"] == a["price_paise"] * 2 + b["price_paise"] and g["delivery_fee_paise"] == 4900
    assert cart["total_paise"] == g["subtotal_paise"] + 4900
    line = g["lines"][0]
    cart = c.patch(f"{API}/cart/items/{line['id']}", json={"listing_id": a["id"], "qty": 0}, headers=h).json()
    assert cart["item_count"] == 1
    # another cart id can't see or touch it
    other = {"X-Cart-Id": str(uuid.uuid4())}
    assert c.get(f"{API}/cart", headers=other).json()["item_count"] == 0
    assert c.patch(f"{API}/cart/items/{line['id']}", json={"listing_id": a["id"], "qty": 3}, headers=other).status_code == 404
    assert c.post(f"{API}/cart/items", json={"listing_id": a["id"], "qty": 11}, headers=h).status_code == 422


def test_order_requires_login(ctx):
    c, _ = ctx
    a = _items(c)[0]
    assert c.post(f"{API}/orders", json={"address": ADDR, "lines": [{"listing_id": a["id"], "qty": 1}]}).status_code == 401


def test_order_mock_payment_creates_sub_orders_and_takes_stock(ctx):
    c, S = ctx
    uid = uuid.uuid4()
    h = {**auth(token(uid)), "X-Cart-Id": str(uuid.uuid4())}
    a, b = _items(c)[:2]
    c.post(f"{API}/cart/items", json={"listing_id": a["id"], "qty": 2}, headers=h)
    r = c.post(f"{API}/orders", json={"address": ADDR, "lines": [{"listing_id": a["id"], "qty": 2}, {"listing_id": b["id"], "qty": 1}], "client_total_paise": 1}, headers=h)
    assert r.status_code == 201, r.text
    o = r.json()
    total = a["price_paise"] * 2 + b["price_paise"] + 4900
    assert o["order"]["status"] == "pending_payment" and o["order"]["total_paise"] == total and o["payment"] == {"mode": "mock", "amount_paise": total, "currency": "INR", "razorpay_order_id": None}
    # reserved stock is held back from the catalog
    assert _by_sku(c, a["sku"])["available_qty"] in (18, 20)  # catalog may be cached for a moment
    paid = c.post(f"{API}/orders/{o['order']['id']}/pay/mock", headers=h).json()
    assert paid["status"] == "paid" and len(paid["sub_orders"]) == 1
    so = paid["sub_orders"][0]
    assert so["status"] == "placed" and so["subtotal_paise"] == total - 4900 and so["sla_due_at"]
    with S() as s:
        assert s.get(Listing, uuid.UUID(a["id"])).stock_qty == 18
        assert s.query(StockReservation).count() == 0
    assert c.get(f"{API}/cart", headers=h).json()["item_count"] == 0
    # paying twice is a no-op
    assert c.post(f"{API}/orders/{o['order']['id']}/pay/mock", headers=h).json()["status"] == "paid"
    assert [x["id"] for x in c.get(f"{API}/orders/me", headers=h).json()] == [o["order"]["id"]]


def test_orders_are_owner_only(ctx):
    c, _ = ctx
    a = _items(c)[0]
    o = c.post(f"{API}/orders", json={"address": ADDR, "lines": [{"listing_id": a["id"], "qty": 1}]}, headers=auth(token())).json()["order"]
    stranger = auth(token())
    assert c.get(f"{API}/orders/{o['id']}", headers=stranger).status_code == 404
    assert c.post(f"{API}/orders/{o['id']}/pay/mock", headers=stranger).status_code == 404


def test_unserviceable_pincode_names_the_store(ctx):
    c, _ = ctx
    a = _items(c)[0]
    r = c.post(f"{API}/orders", json={"address": {**ADDR, "pincode": "400001"}, "lines": [{"listing_id": a["id"], "qty": 1}]}, headers=auth(token()))
    assert r.status_code == 422 and r.json()["detail"]["vendors"] == ["Doggzi Store"]


def test_reservations_prevent_overselling(ctx):
    c, S = ctx
    a = _items(c)[0]
    with S() as s:
        s.get(Listing, uuid.UUID(a["id"])).stock_qty = 3
        s.commit()
    first = c.post(f"{API}/orders", json={"address": ADDR, "lines": [{"listing_id": a["id"], "qty": 2}]}, headers=auth(token()))
    assert first.status_code == 201
    second = c.post(f"{API}/orders", json={"address": ADDR, "lines": [{"listing_id": a["id"], "qty": 2}]}, headers=auth(token()))
    assert second.status_code == 409 and second.json()["detail"]["code"] == "out_of_stock"


def test_expired_reservation_cannot_be_paid(ctx):
    c, S = ctx
    a = _items(c)[0]
    h = auth(token())
    o = c.post(f"{API}/orders", json={"address": ADDR, "lines": [{"listing_id": a["id"], "qty": 1}]}, headers=h).json()["order"]
    with S() as s:
        for r in s.query(StockReservation).all():
            r.expires_at = utcnow() - timedelta(minutes=1)
        s.commit()
    r = c.post(f"{API}/orders/{o['id']}/pay/mock", headers=h)
    assert r.status_code == 409
    assert c.get(f"{API}/orders/{o['id']}", headers=h).json()["status"] == "expired"


def test_inactive_vendor_hidden(ctx):
    c, S = ctx
    with S() as s:
        s.query(Vendor).update({"is_active": False})
        s.commit()
    from app.core import cache

    cache.clear()
    assert _items(c) == []


# ---- PAGE_05 section 4b: browse filters, brand grouping, facet counts ----
def _browse(c, **params):
    r = c.get(f"{API}/browse", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _facet(b, name, key):
    return next(o["count"] for o in b["facets"][name] if o["key"] == key)


def test_brand_names_are_grouped_for_display():
    from app.core.facets import brand_display, brand_key

    assert {brand_key(x) for x in ("Super Fun", "Super fun toy", "Superfun Twistee", "super  FUN")} == {"superfun"}
    assert brand_display("Super fun twistee") == "Super Fun"
    assert brand_key("Zippy paws") == brand_key("ZippyPaws") == "zippypaws"
    assert brand_key("Super Chewers") != brand_key("Super breath") != "superfun"


def test_browse_brand_facet_merges_variants(ctx):
    c, _ = ctx
    b = _browse(c)
    labels = {o["label"]: o for o in b["facets"]["brand"]}
    assert "Super Fun" in labels and not {"Super fun toy", "Superfun Twistee"} & set(labels)
    sf = labels["Super Fun"]
    got = _browse(c, brand=sf["key"])
    assert got["total"] == sf["count"] == 5 and {i["brand"] for i in got["items"]} == {"Super Fun"}
    assert b["facets"]["brand"] == sorted(b["facets"]["brand"], key=lambda o: (-o["count"], o["label"].lower()))


def test_browse_facet_counts_ignore_their_own_filter(ctx):
    c, _ = ctx
    allc = _browse(c)
    b = _browse(c, cat="treats", price="under-250,250-500")
    # category counts are computed with the price filter only, so "All" = sum of categories
    cats = b["facets"]["category"]
    assert cats[0]["count"] == sum(o["count"] for o in cats[1:])
    assert b["total"] == _facet(b, "category", "treats")
    # price counts use the category filter only
    assert sum(o["count"] for o in b["facets"]["price"]) == _facet(allc, "category", "treats")
    assert all(i["category"] == "treats" and i["price_paise"] < 50_000 for i in b["items"])
    # every count matches the result of clicking it
    for o in b["facets"]["brand"][:4]:
        assert _browse(c, cat="treats", price="under-250,250-500", brand=o["key"])["total"] == o["count"]


def test_browse_pet_stock_sort_and_bad_params(ctx):
    c, S = ctx
    b = _browse(c)
    assert _facet(b, "pet", "both") == b["total"] == 50
    assert _facet(b, "pet", "dog") == _browse(c, pet="dog")["total"] == 48
    assert _facet(b, "pet", "cat") == _browse(c, pet="cat")["total"] == 4
    with S() as s:
        li = s.query(Listing).filter_by(sku="DZ-MKT-001").one()
        li.stock_qty = 0
        s.commit()
    from app.core import cache
    cache.clear()
    b2 = _browse(c, in_stock="true", q="twistee")
    assert all(i["in_stock"] for i in b2["items"]) and "DZ-MKT-001" not in {i["sku"] for i in b2["items"]}
    p = [i["price_paise"] for i in _browse(c, sort="price_asc")["items"]]
    assert p == sorted(p)
    assert _browse(c, price="bogus,1000-plus")["total"] == _facet(b, "price", "1000-plus")
    assert c.get(f"{API}/browse", params={"pet": "hamster"}).status_code == 422
