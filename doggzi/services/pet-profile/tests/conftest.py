import os
import uuid
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("GUEST_JWT_SECRET", "test-guest-secret")
os.environ.setdefault("AUTH_JWT_SECRET", "test-auth-secret")

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core import cache  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Breed  # noqa: E402
from app.seed import breed_rows  # noqa: E402

API = "/api/pet-profile/v1"


@pytest.fixture()
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    with Session() as s:
        s.add_all([Breed(**r) for r in breed_rows()])
        s.commit()

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _db
    cache.clear()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def user_token(user_id: uuid.UUID | None = None, role: str = "USER", secret: str = "test-auth-secret") -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"typ": "user", "sub": str(user_id or uuid.uuid4()), "user_id": str(user_id or uuid.uuid4()), "phone": "+919876543210", "role": role, "iat": now, "exp": now + timedelta(hours=1)}, secret, algorithm="HS256")


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
