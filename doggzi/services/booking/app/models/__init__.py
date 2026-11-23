import uuid
from datetime import datetime

from datetime import date

from sqlalchemy import JSON, Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..core.time import utcnow
from ..db import Base

StrArray = ARRAY(String).with_variant(JSON(), "sqlite")
Json = JSONB().with_variant(JSON(), "sqlite")


class TimestampMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class ServiceItem(TimestampMixin, Base):
    __tablename__ = "service_items"
    group: Mapped[str] = mapped_column(String(16), nullable=False)  # package|spa|training|boarding|pickup
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    price_paise: Mapped[int | None] = mapped_column(Integer)  # null when on request
    price_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="fixed")  # fixed|on_request|availability
    scene_key: Mapped[str] = mapped_column(String(40), nullable=False)
    pet_types: Mapped[list[str]] = mapped_column(StrArray, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PackageItem(TimestampMixin, Base):
    """What each package includes. DRAFT contents: Abhiyash to confirm."""

    __tablename__ = "package_items"
    package_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_items.id"), nullable=False)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_items.id"), nullable=False)
    __table_args__ = (Index("uq_package_items", "package_id", "item_id", unique=True),)


class Slot(TimestampMixin, Base):
    __tablename__ = "slots"
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), unique=True, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    booked_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Mirrors migration 0001 so tests built from the models enforce the same rules as the real database.
    __table_args__ = (CheckConstraint("booked_count >= 0 and booked_count <= capacity", name="ck_slots_capacity"),)


BOOKING_STATUSES = ("requested", "confirmed", "completed", "cancelled")


class Booking(TimestampMixin, Base):
    __tablename__ = "bookings"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    pet_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    slot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("slots.id"), nullable=False)
    address_json: Mapped[dict] = mapped_column(Json, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="requested")
    total_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500))
    # Snapshots taken at booking time (the provider panel shows them without calling other services).
    customer_phone: Mapped[str | None] = mapped_column(String(16))
    pet_snapshot: Mapped[dict | None] = mapped_column(Json)  # {name, type, breed}
    # Dispatch + job (provider panel)
    dispatch_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")  # pending|offered|assigned|ops_queue|closed
    provider_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("providers.id"), index=True)
    job_step: Mapped[str | None] = mapped_column(String(16))  # accepted|travel|arrived|in_service|completed|done
    checklist: Mapped[list | None] = mapped_column(Json)  # [{label, done}]
    photos: Mapped[dict | None] = mapped_column(Json)  # {before|after: {name, size, at}} (upload stubbed)
    pay_after_service: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    collected_mode: Mapped[str | None] = mapped_column(String(8))  # UPI|Cash
    earning_paise: Mapped[int | None] = mapped_column(Integer)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    slot: Mapped[Slot] = relationship(lazy="joined")
    items: Mapped[list["BookingItem"]] = relationship(lazy="selectin", back_populates="booking")
    __table_args__ = (CheckConstraint("status in (" + ", ".join(repr(v) for v in BOOKING_STATUSES) + ")", name="ck_bookings_status"),)


class BookingItem(TimestampMixin, Base):
    __tablename__ = "booking_items"
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False, index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_items.id"), nullable=False)
    price_paise_at_booking: Mapped[int] = mapped_column(Integer, nullable=False)
    booking: Mapped[Booking] = relationship(back_populates="items")
    item: Mapped[ServiceItem] = relationship(lazy="joined")


class Provider(TimestampMixin, Base):
    """A groomer / trainer / boarding partner. `user_id` is the auth user (console login)."""

    __tablename__ = "providers"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(16))
    skills: Mapped[list[str]] = mapped_column(StrArray, nullable=False, default=list)
    areas: Mapped[list[str]] = mapped_column(StrArray, nullable=False, default=list)  # pincodes
    rating: Mapped[float] = mapped_column(Float, nullable=False, default=5.0)
    jobs_done: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cant_make_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    weekly_hours: Mapped[list] = mapped_column(Json, nullable=False, default=list)  # 7 x {on, from, to} Mon..Sun, IST hours
    days_off: Mapped[list[str]] = mapped_column(StrArray, nullable=False, default=list)  # YYYY-MM-DD (IST)
    docs: Mapped[list] = mapped_column(Json, nullable=False, default=list)  # [{name, status}]
    # Admin panel onboarding pipeline: dispatch only offers jobs to 'live' providers. Pausing sets is_active=false.
    stage: Mapped[str] = mapped_column(String(12), nullable=False, default="live")
    __table_args__ = (CheckConstraint("stage in ('applied', 'idcheck', 'skills', 'areas', 'training', 'live')", name="ck_providers_stage"),)


class Offer(TimestampMixin, Base):
    """One booking offered to one provider. Expired/declined offers move on to the next provider."""

    __tablename__ = "offers"
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False, index=True)
    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("providers.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="offered")  # offered|accepted|declined|expired|released|cancelled
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decline_reason: Mapped[str | None] = mapped_column(String(40))
    earning_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    booking: Mapped[Booking] = relationship(lazy="joined")


class JobEvent(TimestampMixin, Base):
    __tablename__ = "job_events"
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False, index=True)
    provider_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("providers.id"))
    step: Mapped[str] = mapped_column(String(24), nullable=False)
    meta: Mapped[dict | None] = mapped_column(Json)


class BookingCode(TimestampMixin, Base):
    """Start/end codes: only an HMAC is stored; 5 wrong tries lock the code."""

    __tablename__ = "booking_codes"
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)  # start|end
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (Index("uq_booking_codes", "booking_id", "kind", unique=True),)


class Payout(TimestampMixin, Base):
    __tablename__ = "provider_payouts"
    provider_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("providers.id"), nullable=False, index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")  # pending|paid
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
