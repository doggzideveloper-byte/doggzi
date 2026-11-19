import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Group = Literal["package", "spa", "training", "boarding", "pickup"]
PriceMode = Literal["fixed", "on_request", "availability"]
PetType = Literal["dog", "cat"]
Status = Literal["requested", "confirmed", "completed", "cancelled"]


class ItemOut(BaseModel):
    id: uuid.UUID
    slug: str
    group: Group
    name: str
    price_paise: int | None
    price_mode: PriceMode
    scene_key: str
    pet_types: list[PetType]
    includes: list[str] = []
    sort_order: int


class CatalogOut(BaseModel):
    items: list[ItemOut]


class SlotOut(BaseModel):
    id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    available: bool


class AddressIn(BaseModel):
    label: str | None = Field(default=None, max_length=40)
    line1: str = Field(min_length=1, max_length=120)
    line2: str | None = Field(default=None, max_length=120)
    landmark: str | None = Field(default=None, max_length=120)
    city: str = Field(min_length=1, max_length=60)
    pincode: str

    @field_validator("pincode")
    @classmethod
    def _pin(cls, v: str) -> str:
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("6-digit pincode")
        return v


class BookingIn(BaseModel):
    pet_id: uuid.UUID
    slot_id: uuid.UUID
    item_slugs: list[str] = Field(min_length=1, max_length=20)
    address: AddressIn
    notes: str | None = Field(default=None, max_length=500)
    # Ignored for pricing: the server always recomputes. Accepted only so mismatches can be spotted in logs.
    client_total_paise: int | None = None


class BookingItemOut(BaseModel):
    slug: str
    name: str
    price_paise_at_booking: int


class BookingOut(BaseModel):
    id: uuid.UUID
    pet_id: uuid.UUID
    slot: SlotOut
    address: dict
    status: Status
    total_paise: int
    items: list[BookingItemOut]
    notes: str | None
    created_at: datetime


class ItemCreate(BaseModel):
    group: Group
    name: str = Field(min_length=1, max_length=120)
    slug: str = Field(pattern=r"^[a-z0-9-]{2,80}$")
    price_paise: int | None = Field(default=None, ge=0)
    price_mode: PriceMode = "fixed"
    scene_key: str = Field(min_length=1, max_length=40)
    pet_types: list[PetType] = ["dog"]
    is_active: bool = True
    sort_order: int = 0


class ItemPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    price_paise: int | None = Field(default=None, ge=0)
    price_mode: PriceMode | None = None
    scene_key: str | None = None
    pet_types: list[PetType] | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class SlotCreate(BaseModel):
    starts_at: datetime
    minutes: int = Field(default=90, ge=15, le=480)
    capacity: int = Field(default=2, ge=0, le=50)


class StatusPatch(BaseModel):
    status: Status
