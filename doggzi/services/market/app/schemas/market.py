import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Category = Literal["treats", "toys", "grooming", "walking", "health"]
PetType = Literal["dog", "cat"]
SubStatus = Literal["placed", "accepted", "rejected", "packed", "out_for_delivery", "delivered", "cancelled"]


class VendorOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    area: str | None
    story: str | None
    since_year: int | None
    delivery_fee_paise: int
    serviceable_pincodes: list[str]
    is_doggzi: bool


class ListingOut(BaseModel):
    id: uuid.UUID
    sku: str
    name: str
    brand: str
    category: Category
    pet_types: list[PetType]
    description: str | None
    pack_size: str | None
    price_paise: int
    mrp_paise: int | None
    in_stock: bool
    available_qty: int
    photo_url: str | None
    popularity_rank: int
    vendor: VendorOut


class CatalogOut(BaseModel):
    items: list[ListingOut]
    vendors: list[VendorOut]


class CartItemIn(BaseModel):
    listing_id: uuid.UUID
    qty: int = Field(ge=0, le=10, description="Sets the quantity; 0 removes the line")


class CartLineOut(BaseModel):
    id: uuid.UUID
    listing: ListingOut
    qty: int
    line_total_paise: int


class CartGroupOut(BaseModel):
    vendor: VendorOut
    lines: list[CartLineOut]
    subtotal_paise: int
    delivery_fee_paise: int


class CartOut(BaseModel):
    groups: list[CartGroupOut]
    item_count: int
    total_paise: int


class AddressIn(BaseModel):
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


class OrderLineIn(BaseModel):
    listing_id: uuid.UUID
    qty: int = Field(ge=1, le=10)


class OrderIn(BaseModel):
    address: AddressIn
    lines: list[OrderLineIn] = Field(min_length=1, max_length=50)
    client_total_paise: int | None = None  # ignored for pricing


class SubOrderItemOut(BaseModel):
    sku: str
    name: str
    qty: int
    price_paise_at_order: int


class SubOrderOut(BaseModel):
    id: uuid.UUID
    vendor: VendorOut
    subtotal_paise: int
    delivery_fee_paise: int
    status: SubStatus
    sla_due_at: datetime | None
    items: list[SubOrderItemOut]


class PaymentOut(BaseModel):
    mode: Literal["mock", "razorpay"]
    amount_paise: int
    currency: str = "INR"
    razorpay_order_id: str | None = None


class OrderOut(BaseModel):
    id: uuid.UUID
    status: Literal["pending_payment", "paid", "cancelled", "expired"]
    total_paise: int
    address: dict
    created_at: datetime
    sub_orders: list[SubOrderOut]
    lines: list[dict]


class OrderCreatedOut(BaseModel):
    order: OrderOut
    payment: PaymentOut
