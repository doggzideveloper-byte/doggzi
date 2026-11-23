"""Admin back office (internal API used by services/admin): board moves both ways (undo), reassign, cancel +
reopen, OPS bookings, provider pipeline (dispatch only offers to Live), services catalog."""
import uuid
from datetime import datetime, timedelta

from app.models import Offer, Provider

from .conftest import API, SESSION
from .test_provider import IST, _accept, _book, _offers, _provider, _row

A = f"{API}/internal/admin"
H = {"X-Internal-Token": "test-internal"}


def test_internal_api_needs_the_token(client):
    assert client.get(f"{A}/bookings").status_code == 403
    assert client.get(f"{A}/bookings", headers={"X-Internal-Token": "wrong"}).status_code == 403
    assert client.get(f"{A}/bookings", headers=H).status_code == 200


def _card(client, bid):
    return next(c for c in client.get(f"{A}/bookings", headers=H).json() if c["id"] == bid)


def _move(client, bid, to, code=200):
    r = client.post(f"{A}/bookings/{bid}/move", json={"to": to}, headers=H)
    assert r.status_code == code, r.text
    return r.json()


def test_board_moves_forward_and_back(client):
    pid, ph = _provider()
    bid, _ = _book(client)
    assert _card(client, bid)["column"] == "offered"
    assert _move(client, bid, "accepted")["column"] == "accepted"  # OPS accepts on the provider's behalf
    assert _row(bid).provider_id == pid and _row(bid).status == "confirmed"
    assert _move(client, bid, "enroute")["job_step"] == "travel"
    assert _move(client, bid, "inprogress")["job_step"] == "in_service"
    done = _move(client, bid, "completed")
    assert done["status"] == "completed" and done["before"] == "inprogress"
    with SESSION["S"]() as s:
        assert s.get(Provider, pid).jobs_done == 1
    back = _move(client, bid, "inprogress")  # undo
    assert back["status"] == "confirmed"
    with SESSION["S"]() as s:
        assert s.get(Provider, pid).jobs_done == 0
    _move(client, bid, "requested", 409)  # the service started
    _move(client, bid, "accepted")
    assert _move(client, bid, "requested")["column"] == "requested"
    assert _row(bid).provider_id is None and _offers(client, ph) == []


def test_cancel_frees_the_slot_and_undo_restores_the_provider(client):
    pid, ph = _provider()
    bid, _ = _book(client)
    _accept(client, ph)
    slot_before = _row(bid).slot.booked_count
    c = _move(client, bid, "cancelled")
    assert c["column"] == "cancelled" and c["pay"] == "Not charged"
    assert _row(bid).slot.booked_count == slot_before - 1 and _row(bid).provider_id is None
    r = _move(client, bid, "accepted")  # undo within 5 s
    assert r["column"] == "accepted" and r["provider"]["id"] == str(pid)
    assert _row(bid).slot.booked_count == slot_before


def test_moving_to_accepted_needs_someone(client):
    bid, _ = _book(client)  # nobody eligible → OPS queue
    assert _card(client, bid)["column"] == "requested"
    _move(client, bid, "accepted", 409)
    _move(client, bid, "offered", 409)


def test_reassign_offers_to_the_chosen_provider_with_the_normal_timer(client):
    ravi, rh = _provider("Ravi", rating=4.9)
    sana, sh = _provider("Sana", rating=4.1)
    bid, _ = _book(client)
    _accept(client, rh)
    r = client.post(f"{A}/bookings/{bid}/reassign", json={"provider_id": str(sana)}, headers=H)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["column"] == "offered" and j["provider"]["name"] == "Sana" and j["before_provider"]["name"] == "Ravi" and j["offer_expires_at"]
    assert len(_offers(client, sh)) == 1
    with SESSION["S"]() as s:
        assert s.query(Offer).filter_by(booking_id=uuid.UUID(bid), provider_id=ravi).one().status == "released"


def test_dispatch_only_offers_live_unpaused_providers(client):
    pid, ph = _provider()
    with SESSION["S"]() as s:
        s.get(Provider, pid).stage = "training"
        s.commit()
    bid, _ = _book(client)
    assert _card(client, bid)["column"] == "requested"
    r = client.patch(f"{A}/providers/{pid}", json={"stage": "live"}, headers=H)
    assert r.json()["before"]["stage"] == "training" and r.json()["stage"] == "live"
    assert client.post(f"{A}/bookings/{bid}/move", json={"to": "offered"}, headers=H).json()["column"] == "offered"
    r = client.patch(f"{A}/providers/{pid}", json={"paused": True}, headers=H)  # open offers move on
    assert r.json()["paused"] is True
    with SESSION["S"]() as s:
        assert s.query(Offer).filter_by(provider_id=pid, status="offered").count() == 0
    assert client.post(f"{A}/bookings/{bid}/reassign", json={"provider_id": str(pid)}, headers=H).status_code == 422


def test_ops_books_for_a_customer(client):
    pid, ph = _provider()
    uid = uuid.uuid4()
    d = (datetime.now(IST).date() + timedelta(days=2)).isoformat()
    body = {"user_id": str(uid), "customer_phone": "+919876543210", "pet": {"name": "Bruno", "type": "dog", "breed": "Labrador Retriever"}, "item_slug": "bath-blow-dry",
            "date": d, "time": "10:30", "address": {"line1": "", "line2": "Sector 56", "city": "Gurgaon", "pincode": "122011"}, "provider_id": str(pid)}
    r = client.post(f"{A}/bookings", json=body, headers=H)
    assert r.status_code == 201, r.text
    assert r.json()["column"] == "offered" and r.json()["provider"]["id"] == str(pid)
    assert client.post(f"{A}/bookings", json={**body, "time": "10:31"}, headers=H).status_code == 422
    assert client.post(f"{A}/bookings", json={**body, "item_slug": "boarding"}, headers=H).status_code == 422
    assert client.post(f"{A}/bookings", json={**body, "date": "2020-01-01"}, headers=H).status_code == 422
    mine = client.get(f"{A}/bookings", params={"user_id": str(uid)}, headers=H).json()
    assert len(mine) == 1 and mine[0]["customer_phone"] == "+919876543210"


def test_new_provider_starts_applied(client):
    r = client.post(f"{A}/providers", json={"user_id": str(uuid.uuid4()), "name": "Megha Joshi", "phone": "+919100000015", "skills": ["Bath", "Blow dry"], "areas": ["122011"]}, headers=H)
    assert r.status_code == 201, r.text
    assert r.json()["stage"] == "applied" and r.json()["skills"] == ["bath", "dry"]
    bad = client.post(f"{A}/providers", json={"user_id": str(uuid.uuid4()), "name": "X Y", "phone": "+919100000016", "skills": ["Juggling"], "areas": ["122011"]}, headers=H)
    assert bad.status_code == 422 and "Juggling" in bad.json()["detail"]


def test_services_catalog_price_cats_and_packages(client):
    items = client.get(f"{A}/items", headers=H).json()
    bath = next(i for i in items if i["slug"] == "bath-blow-dry")
    r = client.patch(f"{A}/items/{bath['id']}", json={"price_paise": 110000, "cats": False}, headers=H).json()
    assert r["before"]["price_paise"] == 103400 and r["price_paise"] == 110000 and r["cats"] is False
    assert client.get(f"{API}/catalog", params={"pet_type": "cat"}).json()["items"] and \
        "bath-blow-dry" not in [i["slug"] for i in client.get(f"{API}/catalog", params={"pet_type": "cat"}).json()["items"]]
    p = client.post(f"{A}/items", json={"name": "Puppy Starter", "group": "package", "price_paise": 99900, "includes": ["Bath & blow dry", "dental-cleaning"]}, headers=H)
    assert p.status_code == 201 and sorted(p.json()["includes"]) == ["Bath & blow dry", "Dental cleaning"]
    assert client.post(f"{A}/items", json={"name": "Solo", "group": "package", "price_paise": 99900, "includes": ["Bath & blow dry"]}, headers=H).status_code == 422
    assert client.post(f"{A}/items", json={"name": "Mystery", "group": "package", "price_paise": 99900, "includes": ["Bath & blow dry", "Moon walk"]}, headers=H).status_code == 422


def test_stats_and_payouts(client):
    pid, ph = _provider()
    bid, _ = _book(client)
    _accept(client, ph)
    now = datetime.now(IST)
    st = client.get(f"{A}/stats", params={"from": (now - timedelta(days=1)).isoformat(), "to": (now + timedelta(days=1)).isoformat()}, headers=H).json()
    assert st["bookings"] == 1 and st["by_column"]["accepted"] == 1 and st["gmv_paise"] == 103400
    _move(client, bid, "completed")
    owed = client.get(f"{A}/payouts", headers=H).json()["owed"]
    assert owed[0]["owed_paise"] == round(103400 * 0.6)
