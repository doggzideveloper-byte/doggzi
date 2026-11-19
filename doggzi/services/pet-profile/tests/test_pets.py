import uuid
from datetime import datetime, timedelta, timezone

import jwt

from .conftest import API, auth, user_token


def _breed(client, t, name):
    return next(b for b in client.get(f"{API}/breeds", params={"type": t}).json() if b["name"] == name)


def _guest(client, **kw):
    body = {"name": "Bruno", "type": "dog", **kw}
    r = client.post(f"{API}/pets/guest", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_guest_pet_and_token_round_trip(client):
    lab = _breed(client, "dog", "Labrador Retriever")
    out = _guest(client, breed_id=lab["id"])
    assert out["pet"]["name"] == "Bruno" and out["pet"]["breed"]["name"] == "Labrador Retriever"
    me = client.get(f"{API}/pets/me", headers=auth(out["guest_token"]))
    assert me.status_code == 200
    assert [p["id"] for p in me.json()] == [out["pet"]["id"]]


def test_skipped_breed_defaults_to_mixed(client):
    out = _guest(client, type="cat", name="Mishti")
    assert out["pet"]["breed"]["name"] == "Mixed / Not sure"


def test_name_validation(client):
    for bad in ["", "   ", "B" * 25, "Bruno99", "<script>"]:
        r = client.post(f"{API}/pets/guest", json={"name": bad, "type": "dog"})
        assert r.status_code == 422, bad
    assert client.post(f"{API}/pets/guest", json={"name": "Mr. O'Neil-Jr", "type": "dog"}).status_code == 201


def test_type_required_and_breed_must_match_type(client):
    assert client.post(f"{API}/pets/guest", json={"name": "Bruno"}).status_code == 422
    persian = _breed(client, "cat", "Persian")
    r = client.post(f"{API}/pets/guest", json={"name": "Bruno", "type": "dog", "breed_id": persian["id"]})
    assert r.status_code == 422


def test_me_requires_a_valid_token(client):
    assert client.get(f"{API}/pets/me").status_code == 401
    assert client.get(f"{API}/pets/me", headers=auth("garbage")).status_code == 401
    forged = jwt.encode({"typ": "guest", "guest_id": str(uuid.uuid4())}, "wrong-secret", algorithm="HS256")
    assert client.get(f"{API}/pets/me", headers=auth(forged)).status_code == 401
    expired = jwt.encode({"typ": "guest", "guest_id": str(uuid.uuid4()), "exp": datetime.now(timezone.utc) - timedelta(minutes=1)}, "test-guest-secret", algorithm="HS256")
    assert client.get(f"{API}/pets/me", headers=auth(expired)).status_code == 401


def test_patch_pet_updates_and_bumps_updated_at(client):
    out = _guest(client)
    pid, tok = out["pet"]["id"], out["guest_token"]
    persian = _breed(client, "cat", "Persian")
    r = client.patch(f"{API}/pets/{pid}", json={"name": "Mishti", "type": "cat", "breed_id": persian["id"]}, headers=auth(tok))
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["name"], body["type"], body["breed"]["name"]) == ("Mishti", "cat", "Persian")
    assert body["updated_at"] >= out["pet"]["updated_at"]
    # Changing type without a breed resets to that type's Mixed / Not sure
    r = client.patch(f"{API}/pets/{pid}", json={"type": "dog"}, headers=auth(tok))
    assert r.json()["breed"]["name"] == "Mixed / Not sure"
    assert client.patch(f"{API}/pets/{pid}", json={"name": "B@d"}, headers=auth(tok)).status_code == 422


def test_cannot_touch_someone_elses_pet(client):
    a, b = _guest(client), _guest(client, name="Rex")
    r = client.patch(f"{API}/pets/{a['pet']['id']}", json={"name": "Stolen"}, headers=auth(b["guest_token"]))
    assert r.status_code == 404


def test_nutrition(client):
    out = _guest(client)
    pid, tok = out["pet"]["id"], out["guest_token"]
    body = {"weight_kg": 28.5, "life_stage": "adult", "age_years": 4, "allergies": ["chicken", "grains"], "activity_level": "zoomies"}
    r = client.patch(f"{API}/pets/{pid}/nutrition", json=body, headers=auth(tok))
    assert r.status_code == 200, r.text
    p = r.json()
    assert (p["weight_kg"], p["life_stage"], p["allergies"], p["activity_level"]) == (28.5, "adult", ["chicken", "grains"], "zoomies")
    for bad in [{**body, "weight_kg": 0.2}, {**body, "weight_kg": 101}, {**body, "allergies": ["peanuts"]}, {**body, "life_stage": "kitten"}, {**body, "allergies": ["none", "beef"]}]:
        assert client.patch(f"{API}/pets/{pid}/nutrition", json=bad, headers=auth(tok)).status_code == 422, bad
    r = client.patch(f"{API}/pets/{pid}/nutrition", json={**body, "allergies": ["none"]}, headers=auth(tok))
    assert r.json()["allergies"] == []


def test_notify_preference(client):
    out = _guest(client, type="cat", name="Mishti")
    r = client.patch(f"{API}/pets/{out['pet']['id']}/preferences", json={"notify_fresh_food": True}, headers=auth(out["guest_token"]))
    assert r.json()["notify_fresh_food"] is True


def test_claim_moves_guest_pets_to_user(client):
    out = _guest(client)
    uid = uuid.uuid4()
    tok = user_token(uid)
    r = client.post(f"{API}/pets/claim", headers={**auth(tok), "X-Guest-Token": out["guest_token"]})
    assert r.status_code == 200, r.text
    assert [p["id"] for p in r.json()] == [out["pet"]["id"]]
    # The user token now sees the pet, and the guest token still works in that browser
    assert [p["id"] for p in client.get(f"{API}/pets/me", headers=auth(tok)).json()] == [out["pet"]["id"]]
    assert len(client.get(f"{API}/pets/me", headers=auth(out["guest_token"])).json()) == 1
    # A different user can't take it over
    other = user_token(uuid.uuid4())
    assert client.post(f"{API}/pets/claim", headers={**auth(other), "X-Guest-Token": out["guest_token"]}).status_code == 409


def test_claim_requires_user_token(client):
    out = _guest(client)
    r = client.post(f"{API}/pets/claim", headers={**auth(out["guest_token"]), "X-Guest-Token": out["guest_token"]})
    assert r.status_code == 401
