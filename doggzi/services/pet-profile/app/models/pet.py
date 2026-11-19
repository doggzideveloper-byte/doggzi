import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Index, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base
from .base import StrArray, TimestampMixin
from .breed import Breed


class Pet(TimestampMixin, Base):
    __tablename__ = "pets"

    guest_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    name: Mapped[str] = mapped_column(String(24), nullable=False)
    type: Mapped[str] = mapped_column(String(8), nullable=False)
    breed_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("breeds.id"))
    photo_url: Mapped[str | None] = mapped_column(String(500))
    # Page 3 (Fresh Food): additive columns, filled in by the plan preview.
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    life_stage: Mapped[str | None] = mapped_column(String(10))
    age_years: Mapped[Decimal | None] = mapped_column(Numeric(4, 1))
    allergies: Mapped[list[str]] = mapped_column(StrArray, nullable=False, default=list)
    activity_level: Mapped[str | None] = mapped_column(String(16))
    notify_fresh_food: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    breed: Mapped[Breed | None] = relationship(lazy="joined")

    __table_args__ = (Index("ix_pets_guest_id", "guest_id"), Index("ix_pets_owner_user_id", "owner_user_id"))
