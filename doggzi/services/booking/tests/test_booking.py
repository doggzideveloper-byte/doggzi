import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .conftest import API, PETS, auth, token

IST = ZoneInfo("Asia/Kolkata")
ADDR = {"line1": "Flat 12B", "line2": "Sector 56", "city": "Gurgaon", "pincode": "122011"}


def _tomorrow():
    return (datetime.now(IST).date() + timedelta(days=1)).isoformat()


def _me():
    """A user and a pet they own (as pet-profile would report)."""
    uid = uuid.uuid4()
    return auth(token(user_id=uid)), str(PETS.own(uid))


def _slot(client, date=None, i=0):
    return client.get(f"{API}/slots", params={"date": date or _tomorrow()}).json()[i]


def test_catalog_for_dog_and_cat(client):
    dog = client.get(f"{API}/catalog", params={"pet_type": "dog"}).json()["items"]
    cat = client.get(f"{API}/catalog", params={"pet_type": "cat"}).json()["items"]
    assert len(dog) == 17
    assert {i["slug"] for i in cat} == {"bath-blow-dry", "medicated-bath", "light-dematting", "body-massage", "dental-cleaning", "boarding", "pickup"}
    full = next(i for i in dog if i["slug"] == "full-package")
    assert full["price_paise"] == 172400 and set(full["includes"]) == {"bath-blow-dry", "full-trim", "face-styling"}
    boarding = next(i for i in dog if i["slug"] == "boarding")
    assert boarding["price_paise"] is None and boarding["price_mode"] == "on_request"


def test_slots_are_created_in_ist_for_the_date(client):
    slots = client.get(f"{API}/slots", params={"date": _tomorrow()}).json()
    assert len(slots) == 7
    first = datetime.fromisoformat(slots[0]["starts_at"]).astimezone(IST)
    assert (first.hour, first.minute) == (9, 0) and all(s["available"] for s in slots)
    # Same date again returns the same slots (created once)
    assert [s["id"] for s in client.get(f"{API}/slots", params={"date": _tomorrow()}).json()] == [s["id"] for s in slots]


def test_slots_window(client):
    past = (datetime.now(IST).date() - timedelta(days=1)).isoformat()
    far = (datetime.now(IST).date() + timedelta(days=30)).isoformat()
    assert client.get(f"{API}/slots", params={"date": past}).status_code == 422
    assert client.get(f"{API}/slots", params={"date": far}).status_code == 422


def test_booking_recomputes_total_on_server(client):
    s = _slot(client)
    h, pet = _me()
    body = {"pet_id": pet, "slot_id": s["id"], "item_slugs": ["bath-blow-dry", "dental-cleaning"], "address": ADDR, "client_total_paise": 1}
    r = client.post(f"{API}/bookings", json=body, headers=h)
    assert r.status_code == 201, r.text
    b = r.json()
    assert b["total_paise"] == 103400 + 22900 and b["status"] == "requested"
    assert [i["slug"] for i in b["items"]] == ["bath-blow-dry", "dental-cleaning"]


def test_booking_requires_login(client):
    s = _slot(client)
    r = client.post(f"{API}/bookings", json={"pet_id": str(uuid.uuid4()), "slot_id": s["id"], "item_slugs": ["bath-blow-dry"], "address": ADDR})
    assert r.status_code == 401


def test_booking_validation(client):
    s = _slot(client)
    h, pet = _me()
    base = {"pet_id": pet, "slot_id": s["id"], "item_slugs": ["bath-blow-dry"], "address": ADDR}
    assert client.post(f"{API}/bookings", json={**base, "item_slugs": ["caviar"]}, headers=h).status_code == 422
    assert client.post(f"{API}/bookings", json={**base, "item_slugs": ["boarding"]}, headers=h).status_code == 422
    assert client.post(f"{API}/bookings", json={**base, "address": {**ADDR, "pincode": "400001"}}, headers=h).status_code == 422
    assert client.post(f"{API}/bookings", json={**base, "slot_id": str(uuid.uuid4())}, headers=h).status_code == 404


def test_slot_capacity_is_enforced(client):
    s = _slot(client, i=3)
    h, pet = _me()
    body = {"pet_id": pet, "slot_id": s["id"], "item_slugs": ["dental-cleaning"], "address": ADDR}
    assert [client.post(f"{API}/bookings", json=body, headers=h).status_code for _ in range(3)] == [201, 201, 409]
    assert next(x for x in client.get(f"{API}/slots", params={"date": _tomorrow()}).json() if x["id"] == s["id"])["available"] is False


def test_my_bookings_only_shows_mine(client):
    me, other = uuid.uuid4(), uuid.uuid4()
    s = _slot(client, i=1)
    body = {"pet_id": str(PETS.own(me)), "slot_id": s["id"], "item_slugs": ["dental-cleaning"], "address": ADDR}
    client.post(f"{API}/bookings", json=body, headers=auth(token(user_id=me)))
    assert len(client.get(f"{API}/bookings/me", headers=auth(token(user_id=me))).json()) == 1
    assert client.get(f"{API}/bookings/me", headers=auth(token(user_id=other))).json() == []


def test_admin_endpoints_require_admin(client):
    h = auth(token())
    assert client.post(f"{API}/admin/items", json={"group": "spa", "name": "Nail trim", "slug": "nail-trim", "price_paise": 19900, "scene_key": "trim"}, headers=h).status_code == 403


def test_admin_item_and_status_flow(client):
    a = auth(token("ADMIN"))
    r = client.post(f"{API}/admin/items", json={"group": "spa", "name": "Nail trim", "slug": "nail-trim", "price_paise": 19900, "scene_key": "trim", "pet_types": ["dog", "cat"]}, headers=a)
    assert r.status_code == 201
    assert any(i["slug"] == "nail-trim" for i in client.get(f"{API}/catalog", params={"pet_type": "cat"}).json()["items"])
    client.patch(f"{API}/admin/items/{r.json()['id']}", json={"is_active": False}, headers=a)
    assert not any(i["slug"] == "nail-trim" for i in client.get(f"{API}/catalog", params={"pet_type": "cat"}).json()["items"])

    s = _slot(client, i=2)
    h, pet = _me()
    b = client.post(f"{API}/bookings", json={"pet_id": pet, "slot_id": s["id"], "item_slugs": ["dental-cleaning"], "address": ADDR}, headers=h).json()
    assert client.patch(f"{API}/admin/bookings/{b['id']}/status", json={"status": "completed"}, headers=a).status_code == 409
    assert client.patch(f"{API}/admin/bookings/{b['id']}/status", json={"status": "confirmed"}, headers=a).json()["status"] == "confirmed"
    assert client.patch(f"{API}/admin/bookings/{b['id']}/status", json={"status": "cancelled"}, headers=a).json()["status"] == "cancelled"


def test_admin_create_slot(client):
    start = (datetime.now(IST) + timedelta(days=2)).replace(hour=20, minute=0, second=0, microsecond=0)
    r = client.post(f"{API}/admin/slots", json={"starts_at": start.isoformat(), "capacity": 1}, headers=auth(token("ADMIN")))
    assert r.status_code == 201 and r.json()["available"] is True


def test_booking_only_for_your_own_pet(client):
    s = _slot(client, i=4)
    owner, stranger = uuid.uuid4(), uuid.uuid4()
    pet = str(PETS.own(owner))
    body = {"pet_id": pet, "slot_id": s["id"], "item_slugs": ["dental-cleaning"], "address": ADDR}
    r = client.post(f"{API}/bookings", json=body, headers=auth(token(user_id=stranger)))
    assert r.status_code == 403
    # an unclaimed guest pet can't be booked until it's claimed
    guest_pet = str(PETS.own(None))
    assert client.post(f"{API}/bookings", json={**body, "pet_id": guest_pet}, headers=auth(token(user_id=owner))).status_code == 403
    assert client.post(f"{API}/bookings", json={**body, "pet_id": str(uuid.uuid4())}, headers=auth(token(user_id=owner))).status_code == 422
    assert client.post(f"{API}/bookings", json=body, headers=auth(token(user_id=owner))).status_code == 201
