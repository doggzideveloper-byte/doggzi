"""Booking against a real Postgres built by the Alembic migrations (CHECK constraints as on the servers).
Skipped unless TEST_DATABASE_URL points at Postgres."""
import os
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from app.core import cache, codes
from app.core.config import get_settings
from app.core.pets import get_pet_lookup
from app.db import get_db
from app.main import app
from app.models import BOOKING_STATUSES, Booking, Provider, Slot

from .conftest import API, PETS, auth, console_token, token

URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(not URL.startswith("postgresql"), reason="needs TEST_DATABASE_URL (Postgres)")
IST = ZoneInfo("Asia/Kolkata")
ADDR = {"line1": "Flat 12B", "line2": "Sector 56", "city": "Gurgaon", "pincode": "122011"}
P = f"{API}/provider"


@pytest.fixture()
def pg(monkeypatch):
    engine = create_engine(URL)
    with engine.begin() as c:
        c.execute(text("drop schema public cascade"))
        c.execute(text("create schema public"))
    monkeypatch.setattr(get_settings(), "database_url", URL)
    command.upgrade(Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini")), "head")
    S = sessionmaker(bind=engine, expire_on_commit=False)

    def _db():
        db = S()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_pet_lookup] = lambda: PETS
    cache.clear()
    with TestClient(app) as c:
        yield c, S
    app.dependency_overrides.clear()
    engine.dispose()


def _provider(S, name, rating):
    uid = uuid.uuid4()
    with S() as s:
        s.add(Provider(user_id=uid, name=name, phone="+919000000001", skills=["bath", "dry", "trim", "style", "dental", "massage"], areas=["122011"], rating=rating,
                       weekly_hours=[{"on": True, "from": 0, "to": 24}] * 7, days_off=[], docs=[]))
        s.commit()
    return auth(console_token(uid))


def _book(c, slot_i=0):
    uid = uuid.uuid4()
    d = (datetime.now(IST).date() + timedelta(days=1)).isoformat()
    slot = c.get(f"{API}/slots", params={"date": d}).json()[slot_i]
    r = c.post(f"{API}/bookings", json={"pet_id": str(PETS.own(uid)), "slot_id": slot["id"], "item_slugs": ["bath-blow-dry"], "address": ADDR}, headers=auth(token(user_id=uid)))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_booking_statuses_through_the_provider_flow(pg):
    c, S = pg
    a = _provider(S, "A", 4.9)
    b = _provider(S, "B", 4.5)
    bid = _book(c)
    o = c.get(f"{P}/offers", headers=a).json()[0]
    assert c.post(f"{P}/offers/{o['id']}/accept", headers=a).status_code == 200  # requested → confirmed
    assert c.post(f"{P}/jobs/{bid}/release", headers=a).status_code == 204       # confirmed → requested (back to dispatch)
    o = c.get(f"{P}/offers", headers=b).json()[0]
    c.post(f"{P}/offers/{o['id']}/accept", headers=b)
    j = f"{P}/jobs/{bid}"
    for step, body in [("travel", None), ("arrive", None), ("start", {"code": codes.code_for(uuid.UUID(bid), "start")}), ("checklist", {"done": [True]}),
                       ("complete", {"code": codes.code_for(uuid.UUID(bid), "end")}), ("collect", {"mode": "Cash"})]:
        r = c.post(f"{j}/{step}", json=body, headers=b)
        assert r.status_code == 200, (step, r.text)
    with S() as s:
        assert s.get(Booking, uuid.UUID(bid)).status == "completed"
    admin = auth(token(role="ADMIN"))
    other = _book(c, slot_i=1)
    assert c.patch(f"{API}/admin/bookings/{other}/status", json={"status": "cancelled"}, headers=admin).status_code == 200
    with S() as s:
        assert {r for (r,) in s.execute(text("select distinct status from bookings"))} <= set(BOOKING_STATUSES)


def test_demo_offers_never_overfill_a_slot(pg):
    c, S = pg
    from app import seed_demo

    with S() as s:
        seed_demo.seed(s)
        ravi = s.scalar(select(Provider).where(Provider.user_id == seed_demo.user_id("+919000000001")))
        for _ in range(6):  # "ring me" pressed repeatedly: all land in the same 19:00 slot
            seed_demo.demo_offer(s, ravi)
            s.commit()
        assert all(x.booked_count <= x.capacity for x in s.scalars(select(Slot)))
