import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Uuid, Boolean
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


class Booking(TimestampMixin, Base):
    __tablename__ = "bookings"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    pet_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    slot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("slots.id"), nullable=False)
    address_json: Mapped[dict] = mapped_column(Json, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="requested")
    total_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500))
    slot: Mapped[Slot] = relationship(lazy="joined")
    items: Mapped[list["BookingItem"]] = relationship(lazy="selectin", back_populates="booking")


class BookingItem(TimestampMixin, Base):
    __tablename__ = "booking_items"
    booking_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bookings.id"), nullable=False, index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("service_items.id"), nullable=False)
    price_paise_at_booking: Mapped[int] = mapped_column(Integer, nullable=False)
    booking: Mapped[Booking] = relationship(back_populates="items")
    item: Mapped[ServiceItem] = relationship(lazy="joined")
