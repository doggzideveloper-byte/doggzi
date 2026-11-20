import os
import uuid
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("AUTH_JWT_SECRET", "test-auth-secret")
os.environ.setdefault("PAYMENTS_MODE", "mock")

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core import cache  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Listing, Product, Vendor  # noqa: E402
from app.seed import DOGGZI_STORE, product_rows  # noqa: E402

API = "/api/market/v1"


@pytest.fixture()
def ctx():
    # TEST_DATABASE_URL (e.g. a throwaway Postgres) runs the suite against the real dialect.
    url = os.environ.get("TEST_DATABASE_URL")
    engine = create_engine(url) if url else create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, expire_on_commit=False)
    with S() as s:
        v = Vendor(**DOGGZI_STORE)
        s.add(v)
        s.flush()
        for r in product_rows():
            p = Product(**{k: r[k] for k in ("name", "brand", "brand_as_listed", "category", "pack_size", "popularity_rank", "pet_types", "source_flags")})
            s.add(p)
            s.flush()
            s.add(Listing(vendor_id=v.id, product_id=p.id, sku=r["sku"], price_paise=r["price_paise"], stock_qty=r["stock_qty"]))
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
        yield c, S
    app.dependency_overrides.clear()


def token(user_id: uuid.UUID | None = None) -> str:
    now = datetime.now(timezone.utc)
    uid = str(user_id or uuid.uuid4())
    return jwt.encode({"typ": "user", "sub": uid, "user_id": uid, "phone": "+919876543210", "role": "USER", "iat": now, "exp": now + timedelta(hours=1)}, "test-auth-secret", algorithm="HS256")


def auth(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}
