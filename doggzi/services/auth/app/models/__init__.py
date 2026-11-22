import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Uuid
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
    name: Mapped[str | None] = mapped_column(String(80))
    # Bumped by "Log out of all devices": console tokens carrying an older version stop working.
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


CONSOLE_ROLES = ("ADMIN", "OPS", "PROVIDER", "VENDOR")


class Membership(TimestampMixin, Base):
    """A console role held by a user (a user can hold several, e.g. PROVIDER + VENDOR)."""

    __tablename__ = "memberships"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    __table_args__ = (Index("uq_memberships_user_role", "user_id", "role", unique=True),)


class OtpCode(TimestampMixin, Base):
    __tablename__ = "otp_codes"
    phone: Mapped[str] = mapped_column(String(16), index=True, nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
