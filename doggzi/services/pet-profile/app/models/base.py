import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, String, Uuid
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from ..core.time import utcnow

# text[] in Postgres; JSON on SQLite so the test suite runs anywhere.
StrArray = ARRAY(String).with_variant(JSON(), "sqlite")


class TimestampMixin:
    """Every table has UUID id, created_at and updated_at (UTC, set by the app)."""

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
