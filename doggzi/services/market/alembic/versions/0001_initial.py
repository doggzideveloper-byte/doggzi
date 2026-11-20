"""vendors, products, listings, carts, orders, sub-orders, stock reservations

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None
ARR = postgresql.ARRAY(sa.String())


def _ts():
    return [
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "vendors", *_ts(),
        sa.Column("name", sa.String(120), nullable=False), sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("owner_user_id", sa.Uuid()), sa.Column("phone", sa.String(16)), sa.Column("address", sa.String(300)), sa.Column("area", sa.String(80)),
        sa.Column("lat", sa.Float()), sa.Column("lng", sa.Float()),
        sa.Column("serviceable_pincodes", ARR, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("delivery_fee_paise", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("hours_json", postgresql.JSONB()), sa.Column("story", sa.String(300)), sa.Column("since_year", sa.Integer()),
        sa.Column("kyc_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("razorpay_linked_account_id", sa.String(64)),
        sa.Column("commission_bps", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_doggzi", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "products", *_ts(),
        sa.Column("name", sa.String(200), nullable=False), sa.Column("brand", sa.String(80), nullable=False), sa.Column("brand_as_listed", sa.String(80)),
        sa.Column("category", sa.String(16), nullable=False), sa.Column("pet_types", ARR, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("description", sa.Text()), sa.Column("pack_size", sa.String(40)),
        sa.Column("popularity_rank", sa.Integer(), nullable=False, server_default="1000"),
        sa.Column("source_flags", ARR, nullable=False, server_default=sa.text("'{}'")),
        sa.CheckConstraint("category in ('treats','toys','grooming','walking','health')", name="ck_products_category"),
    )
    op.create_table(
        "listings", *_ts(),
        sa.Column("vendor_id", sa.Uuid(), sa.ForeignKey("vendors.id"), nullable=False), sa.Column("product_id", sa.Uuid(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("sku", sa.String(40), nullable=False), sa.Column("price_paise", sa.Integer(), nullable=False), sa.Column("mrp_paise", sa.Integer()),
        sa.Column("stock_qty", sa.Integer(), nullable=False, server_default="0"), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("photo_url", sa.String(500)),
        sa.CheckConstraint("price_paise > 0 and stock_qty >= 0", name="ck_listings_values"),
        sa.CheckConstraint("mrp_paise is null or mrp_paise >= price_paise", name="ck_listings_mrp"),
    )
    op.create_index("uq_listings_vendor_sku", "listings", ["vendor_id", "sku"], unique=True)
    op.create_table("carts", *_ts(), sa.Column("cart_key", sa.Uuid(), nullable=False, unique=True), sa.Column("user_id", sa.Uuid()))
    op.create_index("ix_carts_user_id", "carts", ["user_id"])
    op.create_table(
        "cart_items", *_ts(),
        sa.Column("cart_id", sa.Uuid(), sa.ForeignKey("carts.id"), nullable=False), sa.Column("listing_id", sa.Uuid(), sa.ForeignKey("listings.id"), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False), sa.CheckConstraint("qty > 0", name="ck_cart_items_qty"),
    )
    op.create_index("ix_cart_items_cart_id", "cart_items", ["cart_id"])
    op.create_index("uq_cart_items", "cart_items", ["cart_id", "listing_id"], unique=True)
    op.create_table(
        "orders", *_ts(),
        sa.Column("user_id", sa.Uuid(), nullable=False), sa.Column("address_json", postgresql.JSONB(), nullable=False),
        sa.Column("total_paise", sa.Integer(), nullable=False), sa.Column("status", sa.String(20), nullable=False, server_default="pending_payment"),
        sa.Column("payment_mode", sa.String(16), nullable=False, server_default="mock"), sa.Column("razorpay_order_id", sa.String(64)),
        sa.Column("lines_json", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'")),
        sa.CheckConstraint("status in ('pending_payment','paid','cancelled','expired')", name="ck_orders_status"),
    )
    op.create_index("ix_orders_user_id", "orders", ["user_id"])
    op.create_table(
        "sub_orders", *_ts(),
        sa.Column("order_id", sa.Uuid(), sa.ForeignKey("orders.id"), nullable=False), sa.Column("vendor_id", sa.Uuid(), sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("subtotal_paise", sa.Integer(), nullable=False), sa.Column("delivery_fee_paise", sa.Integer(), nullable=False),
        sa.Column("commission_paise", sa.Integer(), nullable=False), sa.Column("status", sa.String(20), nullable=False, server_default="placed"),
        sa.Column("sla_due_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status in ('placed','accepted','rejected','packed','out_for_delivery','delivered','cancelled')", name="ck_sub_orders_status"),
    )
    op.create_index("ix_sub_orders_order_id", "sub_orders", ["order_id"])
    op.create_index("ix_sub_orders_vendor_id", "sub_orders", ["vendor_id"])
    op.create_table(
        "sub_order_items", *_ts(),
        sa.Column("sub_order_id", sa.Uuid(), sa.ForeignKey("sub_orders.id"), nullable=False), sa.Column("listing_id", sa.Uuid(), sa.ForeignKey("listings.id"), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False), sa.Column("price_paise_at_order", sa.Integer(), nullable=False),
    )
    op.create_index("ix_sub_order_items_sub_order_id", "sub_order_items", ["sub_order_id"])
    op.create_table(
        "stock_reservations", *_ts(),
        sa.Column("listing_id", sa.Uuid(), sa.ForeignKey("listings.id"), nullable=False), sa.Column("order_id", sa.Uuid(), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_stock_reservations_listing_id", "stock_reservations", ["listing_id"])
    op.create_index("ix_stock_reservations_order_id", "stock_reservations", ["order_id"])


def downgrade() -> None:
    for t in ("stock_reservations", "sub_order_items", "sub_orders", "orders", "cart_items", "carts", "listings", "products", "vendors"):
        op.drop_table(t)
