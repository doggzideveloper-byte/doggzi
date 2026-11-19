from sqlalchemy import Boolean, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from .base import TimestampMixin


class Breed(TimestampMixin, Base):
    __tablename__ = "breeds"

    type: Mapped[str] = mapped_column(String(8), nullable=False)  # 'dog' | 'cat'
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    avatar_path: Mapped[str | None] = mapped_column(String(200))
    popularity_rank: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    # "Indie / Desi" and "Mixed / Not sure" are pinned to the top of the combobox.
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (Index("uq_breeds_type_slug", "type", "slug", unique=True),)
