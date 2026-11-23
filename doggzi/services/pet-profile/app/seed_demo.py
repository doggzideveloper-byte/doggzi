"""SEED_DEMO=true: pets for the demo customers (Admin panel customer drawer). Local / demo server only.

Owner ids are uuid5 of the customer's phone, the same as services/auth seed_demo. Safe to run on every start.
Run: python -m app.seed_demo
"""
import os
import uuid

from sqlalchemy import select

from .db import SessionLocal
from .models import Breed, Pet

DEMO_NS = uuid.UUID("6f1c2a8e-3b7d-4c55-9e0a-d0991e5f0d01")  # same as services/auth
PETS = [
    ("+919876543210", "Bruno", "dog", "Labrador Retriever"), ("+919812345609", "Coco", "dog", "Shih Tzu"), ("+919810098100", "Simba", "dog", "Golden Retriever"),
    ("+919900112233", "Leo", "dog", "Beagle"), ("+919811122233", "Kiara", "dog", "Indie / Desi"), ("+919822233344", "Max", "dog", "German Shepherd"),
    ("+919988776612", "Mishti", "cat", "Persian"), ("+919800000001", "Toffee", "dog", "Pug"),
]


def seed(db) -> int:
    n = 0
    for phone, name, kind, breed in PETS:
        owner = uuid.uuid5(DEMO_NS, phone)
        if db.scalar(select(Pet.id).where(Pet.owner_user_id == owner, Pet.name == name)):
            continue
        b = db.scalar(select(Breed).where(Breed.type == kind, Breed.name == breed))
        db.add(Pet(id=uuid.uuid5(DEMO_NS, f"pet:{phone}:{name}"), owner_user_id=owner, name=name, type=kind, breed_id=b.id if b else None))
        n += 1
    db.commit()
    return n


if __name__ == "__main__":
    if os.environ.get("SEED_DEMO", "").lower() in ("1", "true", "yes"):
        with SessionLocal() as db:
            print(f"seed_demo: {seed(db)} demo pets")
    else:
        print("seed_demo: SEED_DEMO is off, nothing to do")
