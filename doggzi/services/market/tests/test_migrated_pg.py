"""Runs against a real Postgres built by the Alembic migrations (not create_all), so CHECK constraints from
the migrations are enforced exactly as on the servers. Skipped unless TEST_DATABASE_URL points at Postgres.

    TEST_DATABASE_URL=postgresql+psycopg://user@host/market_test pytest tests/test_migrated_pg.py
"""
import logging
import os
import uuid
from datetime import timedelta

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from app.core import cache
from app.core.config import get_settings
from app.core.time import utcnow
from app.db import get_db
from app.main import app
from app.models import SUB_ORDER_STATUSES, Listing, Order, SubOrder, Vendor, VendorMember

from .conftest import API, auth, console_token, token

URL = os.environ.get("TEST_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(not URL.startswith("postgresql"), reason="needs TEST_DATABASE_URL (Postgres)")
ADDR = {"line1": "Flat 12B", "line2": "Sector 56", "city": "Gurgaon", "pincode": "122011"}
V = f"{API}/vendor"


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
    cache.clear()
    with S() as s:
        store = s.scalar(select(Vendor).where(Vendor.is_doggzi.is_(True)))  # seeded by migration 0002
        uid = uuid.uuid4()
        s.add(VendorMember(vendor_id=store.id, user_id=uid, phone="+919000000002", role="owner"))
        s.commit()
        store_id = store.id
    with TestClient(app) as c:
        yield c, S, auth(console_token(uid)), store_id
    app.dependency_overrides.clear()
    engine.dispose()


def _paid_sub_order(c, S, store_id) -> str:
    with S() as s:
        lid = s.scalars(select(Listing.id).where(Listing.vendor_id == store_id, Listing.stock_qty > 3)).first()
    h = auth(token())
    r = c.post(f"{API}/orders", json={"address": ADDR, "lines": [{"listing_id": str(lid), "qty": 1}]}, headers=h)
    assert r.status_code == 201, r.text
    oid = r.json()["order"]["id"]
    assert c.post(f"{API}/orders/{oid}/pay/mock", headers=h).status_code == 200
    with S() as s:
        return str(s.scalar(select(SubOrder.id).where(SubOrder.order_id == uuid.UUID(oid))))


def _status(S, sid) -> str:
    with S() as s:
        return s.get(SubOrder, uuid.UUID(sid)).status


def test_every_sub_order_status_is_allowed_by_the_migrated_schema(pg):
    c, S, h, store_id = pg
    # accept-window timeout → missed (the demo-server 500)
    late = _paid_sub_order(c, S, store_id)
    with S() as s:
        s.get(SubOrder, uuid.UUID(late)).sla_due_at = utcnow() - timedelta(seconds=1)
        s.commit()
    r = c.get(f"{V}/sub-orders", headers=h)
    assert r.status_code == 200 and late not in {x["id"] for x in r.json()}
    assert _status(S, late) == "missed"
    assert c.post(f"{V}/sub-orders/{late}/accept", headers=h).status_code == 409
    # placed → accepted → packed → out_for_delivery → delivered
    so = _paid_sub_order(c, S, store_id)
    u = f"{V}/sub-orders/{so}"
    assert c.post(f"{u}/accept", headers=h).json()["status"] == "accepted"
    assert c.post(f"{u}/checks", json={"checks": [True]}, headers=h).status_code == 200
    assert c.post(f"{u}/packed", headers=h).json()["status"] == "packed"
    assert c.post(f"{u}/out", headers=h).json()["status"] == "out_for_delivery"
    assert c.post(f"{u}/delivered", json={}, headers=h).json()["status"] == "delivered"
    # placed → rejected
    rej = _paid_sub_order(c, S, store_id)
    assert c.post(f"{V}/sub-orders/{rej}/reject", json={"reason": "Shop closed"}, headers=h).json()["status"] == "rejected"
    # cancelled (OPS / refunds) is allowed too; anything else is refused by the database
    with S() as s:
        s.execute(text("update sub_orders set status = 'cancelled' where id = :i"), {"i": rej})
        s.commit()
        with pytest.raises(Exception):
            s.execute(text("update sub_orders set status = 'lost_in_space' where id = :i"), {"i": so})
            s.commit()
        s.rollback()
    with S() as s:
        assert {r for (r,) in s.execute(text("select distinct status from sub_orders"))} <= set(SUB_ORDER_STATUSES)
        # order statuses: paid, and a checkout that timed out → expired
        assert {o.status for o in s.scalars(select(Order))} == {"paid"}
    with S() as s:
        lid = s.scalars(select(Listing.id).where(Listing.vendor_id == store_id, Listing.stock_qty > 3)).first()
    hh = auth(token())
    oid = c.post(f"{API}/orders", json={"address": ADDR, "lines": [{"listing_id": str(lid), "qty": 1}]}, headers=hh).json()["order"]["id"]
    with S() as s:
        s.execute(text("update stock_reservations set expires_at = now() - interval '1 minute' where order_id = :o"), {"o": oid})
        s.commit()
    assert c.post(f"{API}/orders/{oid}/pay/mock", headers=hh).status_code == 409
    with S() as s:
        assert s.get(Order, uuid.UUID(oid)).status == "expired"


def test_sweep_skips_a_row_the_database_refuses(pg, caplog):
    """Simulates the old schema (no 'missed' in the CHECK): the list still loads, the bad rows are logged."""
    c, S, h, store_id = pg
    late = _paid_sub_order(c, S, store_id)
    ok = _paid_sub_order(c, S, store_id)
    with S() as s:
        s.get(SubOrder, uuid.UUID(late)).sla_due_at = utcnow() - timedelta(seconds=1)
        s.execute(text("alter table sub_orders drop constraint ck_sub_orders_status"))
        s.execute(text("alter table sub_orders add constraint ck_sub_orders_status check (status in ('placed','accepted','rejected','packed','out_for_delivery','delivered','cancelled'))"))
        s.commit()
    with caplog.at_level(logging.ERROR, logger="market.vendor"):
        r = c.get(f"{V}/sub-orders", headers=h)
    assert r.status_code == 200
    assert ok in {x["id"] for x in r.json()}
    assert "skipped sub-order" in caplog.text
    assert _status(S, late) == "placed"  # left for OPS to look at, not lost
    assert c.post(f"{V}/sub-orders/{ok}/accept", headers=h).status_code == 200  # the rest of the panel keeps working


def test_migration_0004_downgrade_and_upgrade(pg):
    c, S, h, store_id = pg
    late = _paid_sub_order(c, S, store_id)
    with S() as s:
        s.get(SubOrder, uuid.UUID(late)).sla_due_at = utcnow() - timedelta(seconds=1)
        s.commit()
    c.get(f"{V}/sub-orders", headers=h)
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    command.downgrade(cfg, "0003")
    assert _status(S, late) == "cancelled"
    command.upgrade(cfg, "head")
