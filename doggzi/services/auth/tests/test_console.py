import jwt
import pytest

from app.core import sessions
from app.models import Membership, User
from app.seed_demo import demo_user_id, seed

from .test_otp import API, ctx  # noqa: F401  (fixture)


@pytest.fixture()
def team(ctx):  # noqa: F811
    c, sender = ctx
    from app.db import get_db
    from app.main import app

    db = next(app.dependency_overrides[get_db]())
    seed(db)
    sessions.reset()
    return c, sender, db


def _login(c, sender, phone):
    r = c.post(f"{API}/console/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = sender.sent[-1][1]
    return c.post(f"{API}/console/otp/verify", json={"phone": phone, "code": code})


def test_demo_seed_is_idempotent_with_stable_ids(team):
    c, _, db = team
    assert seed(db) == 0
    u = db.query(User).filter_by(phone="+919000000005").one()
    assert u.id == demo_user_id("+919000000005") and u.name == "Arjun Mehta"
    assert sorted(m.role for m in db.query(Membership).filter_by(user_id=u.id)) == ["PROVIDER", "VENDOR"]


def test_console_login_returns_roles_and_12h_token(team):
    c, sender, _ = team
    r = _login(c, sender, "9000000005")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["roles"] == ["PROVIDER", "VENDOR"] and body["expires_in"] == 12 * 3600
    claims = jwt.decode(body["access_token"], "test-auth-secret", algorithms=["HS256"])
    assert claims["typ"] == "console" and claims["user_id"] == body["user"]["id"] and claims["roles"] == ["PROVIDER", "VENDOR"]
    assert claims["exp"] - claims["iat"] == 12 * 3600
    me = c.get(f"{API}/console/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200 and me.json()["name"] == "Arjun Mehta"


def test_non_members_cannot_get_a_console_code(team):
    c, sender, _ = team
    r = c.post(f"{API}/console/otp/request", json={"phone": "9876543210"})
    assert r.status_code == 403 and "Doggzi team" in r.json()["detail"]
    assert not sender.sent


def test_website_token_is_not_a_console_token(team):
    c, sender, _ = team
    c.post(f"{API}/otp/request", json={"phone": "9876543210"})
    t = c.post(f"{API}/otp/verify", json={"phone": "9876543210", "code": sender.sent[-1][1]}).json()["access_token"]
    assert c.get(f"{API}/console/me", headers={"Authorization": f"Bearer {t}"}).status_code == 401


def test_logout_all_devices_kills_older_tokens(team):
    c, sender, _ = team
    a = _login(c, sender, "9000000003").json()["access_token"]
    from app.core import ratelimit
    ratelimit.reset()
    b = _login(c, sender, "9000000003").json()["access_token"]
    h = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731
    assert c.post(f"{API}/console/logout-all", headers=h(a)).status_code == 204
    assert c.get(f"{API}/console/me", headers=h(a)).status_code == 401
    assert c.get(f"{API}/console/me", headers=h(b)).status_code == 401
    uid = demo_user_id("+919000000003")
    assert sessions.current(uid) == 1


def test_wrong_console_code_counts_down(team):
    c, sender, _ = team
    c.post(f"{API}/console/otp/request", json={"phone": "9000000001"})
    r = c.post(f"{API}/console/otp/verify", json={"phone": "9000000001", "code": "000000" if sender.sent[-1][1] != "000000" else "111111"})
    assert r.status_code == 400 and "4 tries left" in r.json()["detail"]
