import os
import uuid
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("AUTH_JWT_SECRET", "test-auth-secret")
os.environ["NOTIFICATION_URL"] = ""
os.environ["SESSION_REDIS_URL"] = ""
os.environ["REDIS_URL"] = ""
os.environ["EXPORTS_PER_HOUR"] = "3"

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core import live  # noqa: E402
from app.core.upstream import get_upstream  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402

API = "/api/admin/v1"
PHONE = "+919876543210"
UID = str(uuid.uuid4())
PARTNER = str(uuid.uuid4())  # a provider still onboarding: has a login, no console role


def booking_card(**kw) -> dict:
    return {"id": str(uuid.uuid4()), "ref": "BK-AB12", "column": "accepted", "status": "confirmed", "job_step": "accepted", "dispatch_status": "assigned",
            "pet": {"name": "Bruno", "type": "dog", "breed": "Labrador Retriever"}, "pet_id": str(uuid.uuid4()), "services": ["Full Package"], "total_paise": 172400,
            "slot_start": "2026-11-23T12:00:00+05:30", "slot_end": "2026-11-23T13:30:00+05:30", "area": "Sector 56, Gurgaon", "pincode": "122011",
            "provider": {"id": str(uuid.uuid4()), "name": "Ravi Kumar"}, "offer_expires_at": None, "customer_phone": PHONE, "user_id": UID, "pay": "Pay after service",
            "overdue": False, "notes": None, "created_at": "2026-11-23T08:00:00+00:00", **kw}


def sub_order(**kw) -> dict:
    return {"id": str(uuid.uuid4()), "ref": "SO-CD34", "order_id": str(uuid.uuid4()), "order_ref": "DZ-ORD-ABC123", "status": "placed", "reject_reason": None, "user_id": UID,
            "customer_phone": PHONE, "pet": None, "area": "Sector 56, Gurgaon", "vendor_id": str(uuid.uuid4()), "vendor": "Doggzi Store", "subtotal_paise": 67000,
            "delivery_fee_paise": 4900, "total_paise": 71900, "commission_paise": 6700, "payment_mode": "mock", "items": [{"name": "Chew", "sku": "DZ-MKT-001", "qty": 1, "price_paise": 67000}],
            "placed_at": "2026-11-23T08:00:00+00:00", "sla_due_at": "2026-11-23T08:10:00+00:00", "accepted_at": None, "deliver_by": None, "payout_status": "on_hold",
            "refund_status": "none", "refunded_paise": None, **kw}


class FakeUp:
    """Stands in for the other services. Answers by (method, service, path); records every call."""

    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.vendor = {"id": str(uuid.uuid4()), "name": "Paws Corner", "slug": "paws-corner", "stage": "docs", "paused": False, "area": "Sector 49", "phone": "+919000000005",
                       "is_doggzi": False, "commission_pct": 10.0, "pincodes": ["122011"], "hours_text": None, "holiday_mode": False, "kyc_status": "pending", "razorpay_linked": False,
                       "owner_user_id": None, "accept_rate": 90, "avg_pack_minutes": 11, "cancellations_month": 0, "listings": 3, "created_at": "2026-11-01T00:00:00+00:00"}

    def _answer(self, method, svc, path, body):
        if (svc, path) == ("booking", "/bookings") and method == "GET":
            return [booking_card()]
        if svc == "booking" and path.endswith("/move"):
            return {"before": "accepted", **booking_card(column=body["to"])}
        if svc == "booking" and path.endswith("/reassign"):
            return {"before": "accepted", "before_provider": {"id": "x", "name": "Ravi Kumar"}, **booking_card(column="offered", provider={"id": body["provider_id"], "name": "Sana Ali"})}
        if (svc, path) == ("market", "/sub-orders"):
            return [sub_order()]
        if svc == "market" and path.startswith("/sub-orders/"):
            act = path.rsplit("/", 1)[1]
            extra = {"refund": {"status": "cancelled", "refund_status": "refunded", "refunded_paise": 71900}, "cancel": {"status": "cancelled"}}.get(act, {})
            return {"before": "placed", **sub_order(**extra)}
        if (svc, path) == ("auth", "/customers"):
            return [{"user_id": UID, "name": "Ananya Iyer", "phone": PHONE, "since": "2026-11-01T00:00:00"},
                    {"user_id": PARTNER, "name": "Kavya Menon", "phone": "+919811177700", "since": "2026-11-01T00:00:00"}]
        if (svc, path) in (("booking", "/customers"),):
            return {UID: {"bookings": 2, "address": {"line2": "Sector 56", "city": "Gurgaon", "pincode": "122011"}, "phones": [PHONE]}}
        if (svc, path) == ("market", "/customers"):
            return {UID: {"orders": 1, "address": None, "phones": [PHONE]}}
        if (svc, path) == ("pets", "/pets"):
            return [{"id": str(uuid.uuid4()), "owner_user_id": UID, "name": "Bruno", "type": "dog", "breed": "Labrador Retriever", "created_at": "2026-11-01T00:00:00"}]
        if svc == "auth" and path.startswith("/users/"):
            return {"user_id": path.rsplit("/", 1)[1], "name": "Ananya Iyer", "phone": PHONE, "since": "2026-11-01T00:00:00"}
        if (svc, path) == ("auth", "/users"):
            return {"user_id": str(uuid.uuid4()), "phone": "+91" + body["phone"], "name": body.get("name"), "created_user": True}
        if (svc, path) == ("auth", "/members"):
            return [{"user_id": str(uuid.uuid4()), "name": "Neha Gupta", "phone": "+919000000004", "roles": ["OPS"], "since": "2026-11-01T00:00:00"}]
        if (svc, path) == ("auth", "/memberships"):
            return {"user_id": str(uuid.uuid4()), "phone": body["phone"], "created_user": False}
        if svc == "auth" and path.startswith("/members/"):
            return {"user_id": path.rsplit("/", 1)[1], "name": "Neha Gupta", "phone": "+919000000004", "removed": ["OPS"]}
        if (svc, path) == ("market", "/vendors"):
            return [self.vendor]
        if svc == "market" and path.startswith("/vendors/"):
            return {"before": self.vendor, **self.vendor, **{k: v for k, v in body.items() if k in ("stage", "paused", "commission_pct", "pincodes")}}
        if (svc, path) == ("booking", "/providers"):
            return [{"id": str(uuid.uuid4()), "user_id": PARTNER, "name": "Ravi Kumar", "phone": "+919000000001", "stage": "live", "paused": False, "is_online": True,
                     "rating": 4.8, "jobs_done": 126, "skills": ["bath"], "skill_labels": ["Bath"], "areas": ["122011"], "docs": [], "owed_paise": 920000, "created_at": "2026-11-01T00:00:00"}]
        if (svc, path) == ("booking", "/stats"):
            return {"bookings": 9, "gmv_paise": 900000, "by_column": {"requested": 1, "completed": 8}, "overdue": [booking_card(overdue=True)], "applications": []}
        if (svc, path) == ("market", "/stats"):
            return {"orders": 3, "gmv_paise": 300000, "by_status": {"new": 1, "delivered": 2}, "needs_ops": [], "applications": []}
        if (svc, path) == ("pets", "/stats"):
            return {"passports": 5, "plans": 2}
        if (svc, path) == ("booking", "/items"):
            return [{"id": str(uuid.uuid4()), "slug": "full-package", "group": "package", "name": "Full Package", "price_paise": 172400, "price_mode": "fixed", "cats": False,
                     "is_active": True, "includes": ["Bath & blow dry"], "sort_order": 0}]
        if (svc, path) == ("market", "/products"):
            return []
        if (svc, path) == ("market", "/payments"):
            return {"payments": [], "refunds": [], "route": [], "recon": []}
        if (svc, path) == ("booking", "/payouts"):
            return {"owed": [], "payouts": [], "collected": []}
        raise AssertionError(f"unexpected upstream call {method} {svc} {path}")

    def call(self, method, svc, path, params=None, json=None):
        self.calls.append((method, svc, path, json, params))
        return self._answer(method, svc, path, json or {})

    def get(self, svc, path, **params):
        return self.call("GET", svc, path, params=params)

    def post(self, svc, path, json=None, **params):
        return self.call("POST", svc, path, json=json or {}, params=params)

    def patch(self, svc, path, json):
        return self.call("PATCH", svc, path, json=json)

    def delete(self, svc, path, **params):
        return self.call("DELETE", svc, path, params=params)


@pytest.fixture()
def ctx():
    engine = create_engine(os.environ.get("TEST_DATABASE_URL") or "sqlite://", **({} if os.environ.get("TEST_DATABASE_URL") else {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}))
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, expire_on_commit=False)

    def _db():
        db = S()
        try:
            yield db
        finally:
            db.close()

    up = FakeUp()
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_upstream] = lambda: up
    live.store().reset()
    with TestClient(app) as c:
        yield c, S, up
    app.dependency_overrides.clear()


def console(roles=("ADMIN",), user_id: uuid.UUID | None = None, name: str = "Abhiyash") -> dict:
    now = datetime.now(timezone.utc)
    uid = str(user_id or uuid.uuid4())
    t = jwt.encode({"typ": "console", "sub": uid, "user_id": uid, "phone": "+919000000003", "name": name, "roles": list(roles), "tv": 0,
                    "iat": now, "exp": now + timedelta(hours=12)}, "test-auth-secret", algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}
