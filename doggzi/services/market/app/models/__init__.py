import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
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


class Vendor(TimestampMixin, Base):
    __tablename__ = "vendors"
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    phone: Mapped[str | None] = mapped_column(String(16))
    address: Mapped[str | None] = mapped_column(String(300))
    area: Mapped[str | None] = mapped_column(String(80))
    lat: Mapped[float | None] = mapped_column()
    lng: Mapped[float | None] = mapped_column()
    serviceable_pincodes: Mapped[list[str]] = mapped_column(StrArray, nullable=False, default=list)
    delivery_fee_paise: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hours_json: Mapped[dict | None] = mapped_column(Json)
    story: Mapped[str | None] = mapped_column(String(300))
    since_year: Mapped[int | None] = mapped_column(Integer)
    kyc_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    razorpay_linked_account_id: Mapped[str | None] = mapped_column(String(64))
    commission_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_doggzi: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Vendor panel
    holiday_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # hides all listings
    hours_text: Mapped[str | None] = mapped_column(String(80))
    photos: Mapped[list] = mapped_column(Json, nullable=False, default=list)  # [{name, size, status}] (upload stubbed)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=5)


class VendorMember(TimestampMixin, Base):
    """Who may use a store's Vendor panel. The store is always resolved from the signed-in user on the server."""

    __tablename__ = "vendor_members"
    vendor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vendors.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, unique=True)  # one store per login
    phone: Mapped[str | None] = mapped_column(String(16))
    name: Mapped[str | None] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(8), nullable=False, default="staff")  # owner|staff


class ProductRequest(TimestampMixin, Base):
    """A vendor asks Doggzi to add a product to the catalog (Admin approves)."""

    __tablename__ = "product_requests"
    vendor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vendors.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(80))
    category: Mapped[str | None] = mapped_column(String(16))
    price_paise: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")  # pending|approved|rejected


class Product(TimestampMixin, Base):
    """Canonical product. `brand` shows on the site; `brand_as_listed` + `source_flags` keep the menu-card data for review."""

    __tablename__ = "products"
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    brand: Mapped[str] = mapped_column(String(80), nullable=False)
    brand_as_listed: Mapped[str | None] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(16), nullable=False)  # treats|toys|grooming|walking|health
    pet_types: Mapped[list[str]] = mapped_column(StrArray, nullable=False, default=list)
    description: Mapped[str | None] = mapped_column(Text)
    pack_size: Mapped[str | None] = mapped_column(String(40))
    popularity_rank: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    source_flags: Mapped[list[str]] = mapped_column(StrArray, nullable=False, default=list)


class Listing(TimestampMixin, Base):
    __tablename__ = "listings"
    vendor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vendors.id"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    sku: Mapped[str] = mapped_column(String(40), nullable=False)
    price_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    mrp_paise: Mapped[int | None] = mapped_column(Integer)
    stock_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    photo_url: Mapped[str | None] = mapped_column(String(500))  # Doggzi-approved vendor photo only
    photo_status: Mapped[str] = mapped_column(String(10), nullable=False, default="none")  # none|pending|approved|rejected
    photo_meta: Mapped[dict | None] = mapped_column(Json)  # pending upload {name, size, at}
    vendor: Mapped[Vendor] = relationship(lazy="joined")
    product: Mapped[Product] = relationship(lazy="joined")
    __table_args__ = (Index("uq_listings_vendor_sku", "vendor_id", "sku", unique=True),)


class Cart(TimestampMixin, Base):
    """Anonymous carts are keyed by a client-generated id (X-Cart-Id); user_id is set once they log in."""

    __tablename__ = "carts"
    cart_key: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True, nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    items: Mapped[list["CartItem"]] = relationship(lazy="selectin", cascade="all, delete-orphan", order_by="CartItem.created_at")


class CartItem(TimestampMixin, Base):
    __tablename__ = "cart_items"
    cart_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("carts.id"), nullable=False, index=True)
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("listings.id"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    listing: Mapped[Listing] = relationship(lazy="joined")
    __table_args__ = (Index("uq_cart_items", "cart_id", "listing_id", unique=True),)


# Every status the code may write. The DB CHECK constraints (migration 0004) and the model constraints use these.
ORDER_STATUSES = ("pending_payment", "paid", "cancelled", "expired")
SUB_ORDER_STATUSES = ("placed", "accepted", "rejected", "packed", "out_for_delivery", "delivered", "cancelled", "missed")


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} in ({', '.join(repr(v) for v in values)})"


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True, nullable=False)
    address_json: Mapped[dict] = mapped_column(Json, nullable=False)
    total_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending_payment")  # pending_payment|paid|cancelled|expired
    payment_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="mock")
    razorpay_order_id: Mapped[str | None] = mapped_column(String(64))
    customer_phone: Mapped[str | None] = mapped_column(String(16))
    pet_snapshot: Mapped[dict | None] = mapped_column(Json)  # {name, type, breed} shown on the vendor's card
    lines_json: Mapped[list] = mapped_column(Json, nullable=False, default=list)  # priced snapshot until payment
    sub_orders: Mapped[list["SubOrder"]] = relationship(lazy="selectin", order_by="SubOrder.created_at")
    __table_args__ = (CheckConstraint(_in("status", ORDER_STATUSES), name="ck_orders_status"),)


class SubOrder(TimestampMixin, Base):
    __tablename__ = "sub_orders"
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), nullable=False, index=True)
    vendor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vendors.id"), nullable=False, index=True)
    subtotal_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    delivery_fee_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    commission_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="placed")  # placed|accepted|packed|out_for_delivery|delivered|rejected|missed|cancelled
    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reject_reason: Mapped[str | None] = mapped_column(String(40))
    pack_checks: Mapped[list | None] = mapped_column(Json)  # [bool] per item
    delivery_code_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    packed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payout_status: Mapped[str] = mapped_column(String(10), nullable=False, default="on_hold")  # on_hold|released|settled
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    order: Mapped["Order"] = relationship(lazy="select", viewonly=True)
    vendor: Mapped[Vendor] = relationship(lazy="joined")
    items: Mapped[list["SubOrderItem"]] = relationship(lazy="selectin")
    __table_args__ = (CheckConstraint(_in("status", SUB_ORDER_STATUSES), name="ck_sub_orders_status"),)


class SubOrderItem(TimestampMixin, Base):
    __tablename__ = "sub_order_items"
    sub_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sub_orders.id"), nullable=False, index=True)
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("listings.id"), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    price_paise_at_order: Mapped[int] = mapped_column(Integer, nullable=False)
    listing: Mapped[Listing] = relationship(lazy="joined")


class StockReservation(TimestampMixin, Base):
    __tablename__ = "stock_reservations"
    listing_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("listings.id"), nullable=False, index=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), nullable=False, index=True)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
