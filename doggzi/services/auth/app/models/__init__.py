import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from ..core.time import utcnow
from ..db import Base


class TimestampMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    phone: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="USER")


class OtpCode(TimestampMixin, Base):
    __tablename__ = "otp_codes"
    phone: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
