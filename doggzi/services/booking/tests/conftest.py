import os
import uuid
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("AUTH_JWT_SECRET", "test-auth-secret")
os.environ["MOCK_AVAILABILITY"] = "false"

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core import cache  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import PackageItem, ServiceItem  # noqa: E402
from app.seed import PACKAGES, item_rows  # noqa: E402

API = "/api/booking/v1"


@pytest.fixture()
def client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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

    app.dependency_overrides[get_db] = _db
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
