import os

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("AUTH_JWT_SECRET", "test-auth-secret")
os.environ["ADMIN_PHONES"] = "9000000001"

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core import ratelimit  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.notify import get_sender  # noqa: E402

API = "/api/auth/v1"


class FakeSender:
    def __init__(self):
        self.sent: list[tuple[str, str]] = []

    def send(self, phone, code):
        self.sent.append((phone, code))


@pytest.fixture()
def ctx():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, expire_on_commit=False)

    def _db():
        db = S()
        try:
            yield db
        finally:
            db.close()

    sender = FakeSender()
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_sender] = lambda: sender
    ratelimit.reset()
    with TestClient(app) as c:
        yield c, sender
    app.dependency_overrides.clear()


def test_request_and_verify_issues_jwt_with_user_id(ctx):
    c, sender = ctx
    r = c.post(f"{API}/otp/request", json={"phone": "98765 43210"})
    assert r.status_code == 200 and r.json()["sent"] is True and r.json()["dev_code"] is None
    phone, code = sender.sent[-1]
    assert phone == "+919876543210" and len(code) == 6
    r = c.post(f"{API}/otp/verify", json={"phone": "+919876543210", "code": code})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    claims = jwt.decode(tok, "test-auth-secret", algorithms=["HS256"])
    assert claims["user_id"] == r.json()["user"]["id"] and claims["typ"] == "user"
    assert c.get(f"{API}/me", headers={"Authorization": f"Bearer {tok}"}).json()["phone"] == "+919876543210"
    # A code works once
    assert c.post(f"{API}/otp/verify", json={"phone": "+919876543210", "code": code}).status_code == 400


def test_same_user_on_second_login(ctx):
    c, sender = ctx
    ids = []
    for _ in range(2):
        c.post(f"{API}/otp/request", json={"phone": "9876500000"})
        ids.append(c.post(f"{API}/otp/verify", json={"phone": "9876500000", "code": sender.sent[-1][1]}).json()["user"]["id"])
    assert ids[0] == ids[1]


def test_wrong_code_and_attempt_limit(ctx):
    c, sender = ctx
    c.post(f"{API}/otp/request", json={"phone": "9876543211"})
    good = sender.sent[-1][1]
    bad = "000000" if good != "000000" else "111111"
    for _ in range(5):
        assert c.post(f"{API}/otp/verify", json={"phone": "9876543211", "code": bad}).status_code == 400
    assert c.post(f"{API}/otp/verify", json={"phone": "9876543211", "code": good}).status_code == 400


def test_phone_validation(ctx):
    c, _ = ctx
    for bad in ["12345", "5876543210", "+14155550100"]:
        assert c.post(f"{API}/otp/request", json={"phone": bad}).status_code == 422


def test_rate_limited(ctx):
    c, _ = ctx
    codes = [c.post(f"{API}/otp/request", json={"phone": "9876543212"}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_dev_echo_only_when_enabled(ctx, monkeypatch):
    c, sender = ctx
    monkeypatch.setattr(get_settings(), "otp_dev_echo", True)
    r = c.post(f"{API}/otp/request", json={"phone": "9876543213"})
    assert r.json()["dev_code"] == sender.sent[-1][1]


def test_admin_role_from_config(ctx):
    c, sender = ctx
    c.post(f"{API}/otp/request", json={"phone": "9000000001"})
    r = c.post(f"{API}/otp/verify", json={"phone": "9000000001", "code": sender.sent[-1][1]})
    assert r.json()["user"]["role"] == "ADMIN"


def test_me_requires_token(ctx):
    c, _ = ctx
    assert c.get(f"{API}/me").status_code == 401
