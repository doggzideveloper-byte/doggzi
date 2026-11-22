import os

os.environ["INTERNAL_TOKEN"] = "t0k"
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.providers import ConsoleProvider  # noqa: E402

c = TestClient(app)
URL = "/api/notification/v1/send/otp"


def test_console_provider_sends():
    r = c.post(URL, json={"phone": "+919876543210", "code": "123456"}, headers={"X-Internal-Token": "t0k"})
    assert r.status_code == 202 and r.json()["provider"] == "console"
    assert ConsoleProvider.sent[-1] == ("+919876543210", "123456")


def test_internal_only():
    assert c.post(URL, json={"phone": "+919876543210", "code": "123456"}).status_code == 403


def test_validation():
    h = {"X-Internal-Token": "t0k"}
    assert c.post(URL, json={"phone": "9876543210", "code": "123456"}, headers=h).status_code == 422
    assert c.post(URL, json={"phone": "+919876543210", "code": "12ab"}, headers=h).status_code == 422


def test_message_is_logged_and_internal_only():
    from app.api.v1.send import SENT

    body = {"channel": "whatsapp", "to": "+919876543210", "template": "job_travel", "data": {"provider": "Ravi"}}
    assert c.post("/api/notification/v1/send/message", json=body).status_code == 403
    r = c.post("/api/notification/v1/send/message", json=body, headers={"X-Internal-Token": "t0k"})
    assert r.status_code == 202 and SENT[-1]["template"] == "job_travel"
    assert c.post("/api/notification/v1/send/message", json={**body, "channel": "sms"}, headers={"X-Internal-Token": "t0k"}).status_code == 422
