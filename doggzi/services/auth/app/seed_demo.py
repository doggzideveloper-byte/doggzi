"""SEED_DEMO=true: create the five demo console logins (local / demo server only; a no-op otherwise).

User ids are deterministic (uuid5 of the phone) so other services can seed matching records, e.g. booking
creates the provider profile for 9000000001 with the same user id, without calling this service.
Run: python -m app.seed_demo   (the Dockerfile runs it after migrations).
"""
import uuid

from sqlalchemy import select

from .core.config import get_settings
from .db import SessionLocal
from .models import Membership, User

DEMO_NS = uuid.UUID("6f1c2a8e-3b7d-4c55-9e0a-d0991e5f0d01")
DEMO_USERS = [
    ("+919000000001", "Ravi Kumar", ["PROVIDER"]),
    ("+919000000002", "Meera Shah", ["VENDOR"]),
    ("+919000000003", "Abhiyash", ["ADMIN"]),
    ("+919000000004", "Neha Gupta", ["OPS"]),
    ("+919000000005", "Arjun Mehta", ["PROVIDER", "VENDOR"]),
]

# Demo customers (Admin panel): their bookings / orders / pets are seeded by booking, market and pet-profile
# with the same uuid5 ids.
DEMO_CUSTOMERS = [
    ("+919876543210", "Ananya Iyer"), ("+919812345609", "Karan Malhotra"), ("+919810098100", "Riya Kapoor"), ("+919900112233", "Dev Sharma"),
    ("+919811122233", "Ishita Bose"), ("+919822233344", "Aman Verma"), ("+919988776612", "Nikita Rao"), ("+919800000001", "Rohan Das"),
]


def demo_user_id(phone: str) -> uuid.UUID:
    return uuid.uuid5(DEMO_NS, phone)


def seed(db) -> int:
    n = 0
    for phone, name, roles in DEMO_USERS:
        user = db.scalar(select(User).where(User.phone == phone))
        if not user:
            user = User(id=demo_user_id(phone), phone=phone, name=name, role="USER")
            db.add(user)
            db.flush()
            n += 1
        elif not user.name:
            user.name = name
        have = set(db.scalars(select(Membership.role).where(Membership.user_id == user.id)))
        for r in roles:
            if r not in have:
                db.add(Membership(user_id=user.id, role=r))
    for phone, name in DEMO_CUSTOMERS:
        if not db.scalar(select(User).where(User.phone == phone)):
            db.add(User(id=demo_user_id(phone), phone=phone, name=name, role="USER"))
            n += 1
    db.commit()
    return n


if __name__ == "__main__":
    if get_settings().seed_demo:
        with SessionLocal() as db:
            print(f"seed_demo: {seed(db)} new demo users")
    else:
        print("seed_demo: SEED_DEMO is off, nothing to do")
