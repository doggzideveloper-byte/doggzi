"""service items, packages, slots, bookings

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


def _ts():
    return [
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "service_items", *_ts(),
        sa.Column("group", sa.String(16), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("price_paise", sa.Integer()),
        sa.Column("price_mode", sa.String(16), nullable=False, server_default="fixed"),
        sa.Column("scene_key", sa.String(40), nullable=False),
        sa.Column("pet_types", postgresql.ARRAY(sa.String()), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("\"group\" in ('package','spa','training','boarding','pickup')", name="ck_items_group"),
        sa.CheckConstraint("price_mode in ('fixed','on_request','availability')", name="ck_items_price_mode"),
        sa.CheckConstraint("price_mode <> 'fixed' or price_paise is not null", name="ck_items_fixed_has_price"),
    )
    op.create_table(
        "package_items", *_ts(),
        sa.Column("package_id", sa.Uuid(), sa.ForeignKey("service_items.id"), nullable=False),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("service_items.id"), nullable=False),
    )
    op.create_index("uq_package_items", "package_items", ["package_id", "item_id"], unique=True)
    op.create_table(
        "slots", *_ts(),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False, unique=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("booked_count", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("booked_count >= 0 and booked_count <= capacity", name="ck_slots_capacity"),
    )
    op.create_table(
        "bookings", *_ts(),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("pet_id", sa.Uuid(), nullable=False),
        sa.Column("slot_id", sa.Uuid(), sa.ForeignKey("slots.id"), nullable=False),
        sa.Column("address_json", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="requested"),
        sa.Column("total_paise", sa.Integer(), nullable=False),
        sa.Column("notes", sa.String(500)),
        sa.CheckConstraint("status in ('requested','confirmed','completed','cancelled')", name="ck_bookings_status"),
    )
    op.create_index("ix_bookings_user_id", "bookings", ["user_id"])
    op.create_table(
        "booking_items", *_ts(),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id"), nullable=False),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("service_items.id"), nullable=False),
        sa.Column("price_paise_at_booking", sa.Integer(), nullable=False),
    )
    op.create_index("ix_booking_items_booking_id", "booking_items", ["booking_id"])


def downgrade() -> None:
    for t in ("booking_items", "bookings", "slots", "package_items", "service_items"):
        op.drop_table(t)
