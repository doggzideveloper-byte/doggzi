"""Provider panel: dispatch, scoping (a provider never sees another's offers or jobs), codes, job flow, earnings."""
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.core import codes
from app.core.time import utcnow
from app.models import Booking, Offer, Provider

from .conftest import API, PETS, SESSION, auth, console_token, token

IST = ZoneInfo("Asia/Kolkata")
ADDR = {"line1": "Flat 12B", "line2": "Sector 56", "city": "Gurgaon", "pincode": "122011"}
ALL_DAY = [{"on": True, "from": 0, "to": 24}] * 7
P = f"{API}/provider"


def _provider(name="Ravi", rating=4.8, skills=("bath", "dry", "trim", "style", "dental", "massage"), areas=("122011",), hours=ALL_DAY, days_off=()):
    uid = uuid.uuid4()
    with SESSION["S"]() as s:
        p = Provider(user_id=uid, name=name, phone="+919000000001", skills=list(skills), areas=list(areas), rating=rating, weekly_hours=list(hours), days_off=list(days_off), docs=[{"name": "ID", "status": "Missing"}])
        s.add(p)
        s.commit()
        pid = p.id
    return pid, auth(console_token(uid))


def _book(client, slugs=("bath-blow-dry",), day=1, slot_i=0, pincode="122011"):
    uid = uuid.uuid4()
    h, pet = auth(token(user_id=uid)), str(PETS.own(uid))
    d = (datetime.now(IST).date() + timedelta(days=day)).isoformat()
    slot = client.get(f"{API}/slots", params={"date": d}).json()[slot_i]
    r = client.post(f"{API}/bookings", json={"pet_id": pet, "slot_id": slot["id"], "item_slugs": list(slugs), "address": {**ADDR, "pincode": pincode}}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"], h


def _row(bid):
    with SESSION["S"]() as s:
        return s.get(Booking, uuid.UUID(bid))


def _offers(client, h):
    r = client.get(f"{P}/offers", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _accept(client, h):
    o = _offers(client, h)[0]
    r = client.post(f"{P}/offers/{o['id']}/accept", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_booking_is_offered_to_the_best_provider_only(client):
    _, low = _provider("Low", rating=4.1)
    _, high = _provider("High", rating=4.9)
    bid, _ = _book(client)
    offers = _offers(client, high)
    assert len(offers) == 1 and offers[0]["booking_id"] == bid
    assert offers[0]["earning_paise"] == round(103400 * 0.6) and offers[0]["pet"]["name"] == "Bruno"
    assert "Flat" not in offers[0]["area"]  # exact flat only after accepting
    assert _offers(client, low) == []
    assert _row(bid).dispatch_status == "offered"


def test_a_provider_can_never_touch_another_providers_offer_or_job(client):
    _, a = _provider("A", rating=4.9)
    _, b = _provider("B", rating=4.0)
    _book(client)
    oid = _offers(client, a)[0]["id"]
    assert client.post(f"{P}/offers/{oid}/accept", headers=b).status_code == 404
    assert client.post(f"{P}/offers/{oid}/decline", json={"reason": "Too far"}, headers=b).status_code == 404
    job = _accept(client, a)
    for path, body in [("travel", None), ("arrive", None), ("start", {"code": "1234"}), ("checklist", {"done": [True]}), ("complete", {"code": "1234"}), ("collect", {"mode": "UPI"}), ("release", None)]:
        assert client.post(f"{P}/jobs/{job['id']}/{path}", json=body, headers=b).status_code == 404, path
    assert client.get(f"{P}/jobs", params={"date": job["slot_start"][:10]}, headers=b).json() == []
    assert len(client.get(f"{P}/jobs", params={"date": datetime.fromisoformat(job["slot_start"]).astimezone(IST).date().isoformat()}, headers=a).json()) == 1


def test_panel_needs_a_console_provider_session(client):
    assert client.get(f"{P}/offers").status_code == 401
    assert client.get(f"{P}/offers", headers=auth(token())).status_code == 401  # website token
    assert client.get(f"{P}/offers", headers=auth(console_token(uuid.uuid4(), roles=("VENDOR",)))).status_code == 403
    assert client.get(f"{P}/offers", headers=auth(console_token(uuid.uuid4()))).status_code == 403  # no provider profile


def test_logged_out_everywhere_tokens_are_rejected(client, monkeypatch):
    from app.core import console

    _, h = _provider()
    assert client.get(f"{P}/me", headers=h).status_code == 200
    monkeypatch.setattr(console, "_min_tv", lambda uid: 1)  # "log out of all devices" bumped the version
    assert client.get(f"{P}/me", headers=h).status_code == 401


def test_decline_moves_on_then_ops_queue(client):
    _, a = _provider("A", rating=4.9)
    _, b = _provider("B", rating=4.5)
    bid, _ = _book(client)
    oid = _offers(client, a)[0]["id"]
    assert client.post(f"{P}/offers/{oid}/decline", json={"reason": "Too far"}, headers=a).status_code == 204
    assert _offers(client, a) == [] and _offers(client, b)[0]["booking_id"] == bid
    assert client.post(f"{P}/offers/{_offers(client, b)[0]['id']}/decline", json={"reason": "Other"}, headers=b).status_code == 204
    assert _row(bid).dispatch_status == "ops_queue"
    assert client.post(f"{P}/offers/{oid}/accept", headers=a).status_code == 409  # already answered


def test_expired_offer_moves_to_the_next_provider(client):
    _, a = _provider("A", rating=4.9)
    _, b = _provider("B", rating=4.5)
    bid, _ = _book(client)
    with SESSION["S"]() as s:
        o = s.query(Offer).filter_by(booking_id=uuid.UUID(bid)).one()
        o.expires_at = utcnow() - timedelta(seconds=1)
        s.commit()
        oid = o.id
    assert _offers(client, b)[0]["booking_id"] == bid
    assert client.post(f"{P}/offers/{oid}/accept", headers=a).status_code == 409
    with SESSION["S"]() as s:
        assert s.get(Offer, oid).status == "expired"


def test_availability_skills_and_days_off_filter_dispatch(client):
    tomorrow = (datetime.now(IST).date() + timedelta(days=1))
    _provider("NoDental", rating=5.0, skills=("bath", "dry"))
    _provider("Evenings", rating=5.0, hours=[{"on": True, "from": 17, "to": 21}] * 7)
    _provider("Off", rating=5.0, days_off=(tomorrow.isoformat(),))
    _provider("Elsewhere", rating=5.0, areas=("201301",))
    _, ok = _provider("Ok", rating=3.0)
    bid, _ = _book(client, slugs=("dental-cleaning", "bath-blow-dry"), slot_i=0)  # 09:00 IST tomorrow
    assert _offers(client, ok)[0]["booking_id"] == bid


def test_full_job_flow_with_codes_checklist_and_collect(client):
    pid, h = _provider()
    bid, customer = _book(client, slugs=("full-package",))
    assert client.get(f"{API}/bookings/{bid}/codes", headers=customer).json()["start"] is None  # not assigned yet
    job = _accept(client, h)
    assert job["step"] == "accepted" and job["phone_visible"] and job["customer_phone"] == "+919876543210"
    assert [c["label"] for c in job["checklist"]] == ["Bath & blow dry", "Only face styling", "Full body hair trim"] or len(job["checklist"]) == 3
    c = client.get(f"{API}/bookings/{bid}/codes", headers=customer).json()
    assert len(c["start"]) == 4 and len(c["end"]) == 4 and c["provider_name"] == "Ravi"
    assert client.get(f"{API}/bookings/{bid}/codes", headers=auth(token())).status_code == 404  # someone else's booking
    j = f"{P}/jobs/{bid}"
    assert client.post(f"{j}/arrive", headers=h).status_code == 409  # must travel first
    assert client.post(f"{j}/travel", headers=h).json()["step"] == "travel"
    assert client.post(f"{j}/arrive", headers=h).json()["step"] == "arrived"
    wrong = "0000" if c["start"] != "0000" else "1111"
    r = client.post(f"{j}/start", json={"code": wrong}, headers=h)
    assert r.status_code == 422 and "4 tries left" in r.json()["detail"]
    assert client.post(f"{j}/start", json={"code": c["start"]}, headers=h).json()["step"] == "in_service"
    assert client.post(f"{j}/complete", json={"code": c["end"]}, headers=h).status_code == 409  # checklist first
    assert client.post(f"{j}/checklist", json={"done": [True, False]}, headers=h).status_code == 422
    assert client.post(f"{j}/checklist", json={"done": [True, True, True]}, headers=h).status_code == 200
    done = client.post(f"{j}/complete", json={"code": c["end"]}, headers=h).json()
    assert done["step"] == "completed"
    assert client.post(f"{j}/collect", json={"mode": "Card"}, headers=h).status_code == 422
    fin = client.post(f"{j}/collect", json={"mode": "UPI"}, headers=h).json()
    assert fin["step"] == "done" and fin["collected_mode"] == "UPI"
    assert not fin["phone_visible"] and fin["customer_phone"] == "98xxxxxx10"
    e = client.get(f"{P}/earnings", headers=h).json()
    assert e["today_paise"] == e["week_paise"] == round(172400 * 0.6) and e["jobs"][0]["title"].endswith("Bruno")
    with SESSION["S"]() as s:
        assert s.get(Provider, pid).jobs_done == 1 and s.get(Booking, uuid.UUID(bid)).status == "completed"


def test_code_locks_after_five_wrong_tries(client):
    _, h = _provider()
    bid, customer = _book(client)
    _accept(client, h)
    client.post(f"{P}/jobs/{bid}/travel", headers=h)
    client.post(f"{P}/jobs/{bid}/arrive", headers=h)
    right = codes.code_for(uuid.UUID(bid), "start")
    wrong = "0000" if right != "0000" else "1111"
    for _ in range(4):
        assert client.post(f"{P}/jobs/{bid}/start", json={"code": wrong}, headers=h).status_code == 422
    assert client.post(f"{P}/jobs/{bid}/start", json={"code": wrong}, headers=h).status_code == 423
    assert client.post(f"{P}/jobs/{bid}/start", json={"code": right}, headers=h).status_code == 423
    assert client.get(f"{P}/jobs", params={"date": (datetime.now(IST).date() + timedelta(days=1)).isoformat()}, headers=h).json()[0]["code_locked"]["start"] is True


def test_cant_make_it_lowers_rating_and_redispatches(client):
    pa, a = _provider("A", rating=4.9)
    _, b = _provider("B", rating=4.5)
    bid, _ = _book(client)
    _accept(client, a)
    assert client.post(f"{P}/jobs/{bid}/release", headers=a).status_code == 204
    with SESSION["S"]() as s:
        p = s.get(Provider, pa)
        assert p.rating == 4.8 and p.cant_make_count == 1
    assert _offers(client, b)[0]["booking_id"] == bid and _row(bid).provider_id is None


def test_going_offline_hands_back_open_offers(client):
    _, a = _provider("A", rating=4.9)
    _, b = _provider("B", rating=4.5)
    bid, _ = _book(client)
    r = client.patch(f"{P}/me", json={"is_online": False}, headers=a)
    assert r.status_code == 200 and r.json()["is_online"] is False
    assert _offers(client, a) == [] and _offers(client, b)[0]["booking_id"] == bid
    _book(client, slot_i=1)
    assert len(_offers(client, a)) == 0  # offline: no new offers


def test_availability_and_profile_validation(client):
    _, h = _provider()
    week = [{"on": True, "from": 9, "to": 19}] * 6 + [{"on": False, "from": 9, "to": 19}]
    r = client.put(f"{P}/availability", json={"weekly_hours": week, "days_off": ["2030-01-02"]}, headers=h)
    assert r.status_code == 200 and r.json()["weekly_hours"][6]["on"] is False
    assert client.put(f"{P}/availability", json={"weekly_hours": [{"on": True, "from": 19, "to": 9}] * 7}, headers=h).status_code == 422
    assert client.put(f"{P}/availability", json={"weekly_hours": week[:6]}, headers=h).status_code == 422
    assert client.patch(f"{P}/me", json={"skills": ["bath", "flying"]}, headers=h).status_code == 422
    assert client.patch(f"{P}/me", json={"areas": ["12345"]}, headers=h).status_code == 422
    r = client.patch(f"{P}/me", json={"skills": ["bath", "training"], "areas": ["122011", "122018"]}, headers=h)
    assert r.json()["skills"] == ["bath", "training"] and r.json()["areas"] == ["122011", "122018"]
    up = client.post(f"{P}/me/docs/0", files={"file": ("id.pdf", b"%PDF-1.4 demo", "application/pdf")}, headers=h)
    assert up.status_code == 200 and up.json()["docs"][0]["status"] == "In review"
    assert client.post(f"{P}/me/docs/9", files={"file": ("id.pdf", b"x", "application/pdf")}, headers=h).status_code == 404


def test_demo_seed_runs_twice_without_duplicates(client, monkeypatch):
    from app import seed_demo

    with SESSION["S"]() as s:
        seed_demo.seed(s)
        n = s.query(Booking).count()
        seed_demo.seed(s)
        assert s.query(Booking).count() == n
        ravi = s.query(Provider).filter_by(user_id=seed_demo.user_id("+919000000001")).one()
        assert s.query(Offer).filter_by(provider_id=ravi.id, status="offered").count() == 1
    h = auth(console_token(seed_demo.user_id("+919000000001")))
    today = datetime.now(IST).date().isoformat()
    jobs = client.get(f"{P}/jobs", params={"date": today}, headers=h).json()
    assert [j["step"] for j in jobs] == ["done", "accepted", "accepted"]
    assert client.get(f"{P}/earnings", headers=h).json()["payouts"][0]["status"] == "pending"


def test_customer_number_only_for_the_job_under_way_or_next(client):
    _, h = _provider()
    early, _ = _book(client, slot_i=0)
    _accept(client, h)
    late, _ = _book(client, slot_i=3)
    _accept(client, h)
    d = (datetime.now(IST).date() + timedelta(days=1)).isoformat()
    jobs = {j["id"]: j for j in client.get(f"{P}/jobs", params={"date": d}, headers=h).json()}
    assert jobs[early]["phone_visible"] and jobs[early]["customer_phone"] == "+919876543210" and jobs[early]["address"]["line1"] == "Flat 12B"
    assert not jobs[late]["phone_visible"] and jobs[late]["customer_phone"] == "98xxxxxx10" and jobs[late]["address"] is None
