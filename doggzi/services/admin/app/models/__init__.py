import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, Index, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..core.time import utcnow
from ..db import Base

Json = JSONB().with_variant(JSON(), "sqlite")


class TimestampMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class AuditEntry(TimestampMixin, Base):
    """One row per admin write (and per CSV export). Never updated or deleted by the app."""

    __tablename__ = "audit_log"
    actor_user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    actor_name: Mapped[str] = mapped_column(String(80), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(8), nullable=False)  # ADMIN|OPS
    module: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(300), nullable=False)
    target: Mapped[str | None] = mapped_column(String(80))
    before: Mapped[str | None] = mapped_column(String(500))
    after: Mapped[str | None] = mapped_column(String(500))
    __table_args__ = (Index("ix_audit_log_created_at", "created_at"),)


class CustomerProfile(TimestampMixin, Base):
    """What OPS knows about a customer beyond their login: area and pincode for bookings / orders made for them."""

    __tablename__ = "customer_profiles"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True, nullable=False)
    area: Mapped[str | None] = mapped_column(String(120))
    pincode: Mapped[str | None] = mapped_column(String(6))


class CustomerNote(TimestampMixin, Base):
    __tablename__ = "customer_notes"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    author_name: Mapped[str] = mapped_column(String(80), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)


CONTENT_KINDS = ("faq", "testimonial", "video")
CONTENT_PAGES = ("Explore", "Fresh Food", "Services", "Marketplace")


class ContentItem(TimestampMixin, Base):
    """FAQs, testimonials and YouTube Shorts. Testimonials can only be live with recorded consent."""

    __tablename__ = "content_items"
    kind: Mapped[str] = mapped_column(String(12), nullable=False)
    page: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(8), nullable=False, default="draft")  # draft|live
    consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    data: Mapped[dict] = mapped_column(Json, nullable=False, default=dict)  # faq {q, a} · testimonial {pet, parent, service, quote} · video {video_id}
    __table_args__ = (
        CheckConstraint("kind in ('faq', 'testimonial', 'video')", name="ck_content_kind"),
        CheckConstraint("status in ('draft', 'live')", name="ck_content_status"),
        CheckConstraint("kind <> 'testimonial' or status = 'draft' or consent", name="ck_content_testimonial_consent"),
    )


class SiteConfig(TimestampMixin, Base):
    __tablename__ = "site_config"
    key: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    value: Mapped[dict] = mapped_column(Json, nullable=False)  # {"v": ...}
