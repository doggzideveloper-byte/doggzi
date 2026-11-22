import os
import uuid
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("AUTH_JWT_SECRET", "test-auth-secret")
os.environ["MOCK_AVAILABILITY"] = "false"
os.environ["DISPATCH_SWEEP_SECONDS"] = "0"
os.environ["NOTIFICATION_URL"] = ""
os.environ["SESSION_REDIS_URL"] = ""

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core import cache  # noqa: E402
from app.core.pets import get_pet_lookup  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PackageItem, ServiceItem  # noqa: E402
from app.seed import PACKAGES, item_rows  # noqa: E402

API = "/api/booking/v1"


class FakePets:
    """Pet owners as pet-profile would report them. Unknown ids → 'missing'."""

    def __init__(self):
        self.owners: dict = {}

    def get(self, pet_id):
        if pet_id not in self.owners:
            return None
        return {"owner_user_id": self.owners[pet_id], "name": "Bruno", "type": "dog", "breed": "Labrador Retriever"}

    def own(self, user_id, pet_id=None):
        pid = pet_id or uuid.uuid4()
        self.owners[pid] = user_id
        return pid


PETS = FakePets()
SESSION: dict = {}  # the current test's sessionmaker (for tests that set up rows directly)


@pytest.fixture()
def client():
    # TEST_DATABASE_URL (e.g. a throwaway Postgres) runs the suite against the real dialect.
    url = os.environ.get("TEST_DATABASE_URL")
    engine = create_engine(url) if url else create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, expire_on_commit=False)
    with S() as s:
        objs = {r["slug"]: ServiceItem(**r) for r in item_rows()}
        s.add_all(objs.values())
        s.flush()
        s.add_all([PackageItem(package_id=objs[p].id, item_id=objs[i].id) for p, inc in PACKAGES.items() for i in inc])
        s.commit()

    def _db():
        db = S()
        try:
            yield db
        finally:
            db.close()

    SESSION["S"] = S
    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_pet_lookup] = lambda: PETS
    PETS.owners.clear()
    cache.clear()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def token(role: str = "USER", user_id: uuid.UUID | None = None) -> str:
    now = datetime.now(timezone.utc)
    uid = str(user_id or uuid.uuid4())
    return jwt.encode({"typ": "user", "sub": uid, "user_id": uid, "phone": "+919876543210", "role": role, "iat": now, "exp": now + timedelta(hours=1)}, "test-auth-secret", algorithm="HS256")


def auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def console_token(user_id: uuid.UUID, roles=("PROVIDER",), tv: int = 0) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"typ": "console", "sub": str(user_id), "user_id": str(user_id), "phone": "+919000000001", "name": "Test", "roles": list(roles), "tv": tv,
                       "iat": now, "exp": now + timedelta(hours=12)}, "test-auth-secret", algorithm="HS256")
