"""vendor panel: members, product requests, holiday/hours/photos, listing photo status, sub-order workflow + payouts

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

JSON = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def _ts():
    return [
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    # All additive: new nullable / defaulted columns and new tables.
    op.add_column("vendors", sa.Column("holiday_mode", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("vendors", sa.Column("hours_text", sa.String(80)))
    op.add_column("vendors", sa.Column("photos", JSON, nullable=False, server_default="[]"))
    op.add_column("vendors", sa.Column("low_stock_threshold", sa.Integer(), nullable=False, server_default="5"))
    op.create_table(
        "vendor_members", *_ts(),
        sa.Column("vendor_id", sa.Uuid(), sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False, unique=True),
        sa.Column("phone", sa.String(16)),
        sa.Column("name", sa.String(80)),
        sa.Column("role", sa.String(8), nullable=False, server_default="staff"),
    )
    op.create_index("ix_vendor_members_vendor_id", "vendor_members", ["vendor_id"])
    op.create_table(
        "product_requests", *_ts(),
        sa.Column("vendor_id", sa.Uuid(), sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("brand", sa.String(80)),
        sa.Column("category", sa.String(16)),
        sa.Column("price_paise", sa.Integer()),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
    )
    op.create_index("ix_product_requests_vendor_id", "product_requests", ["vendor_id"])
    op.add_column("listings", sa.Column("photo_status", sa.String(10), nullable=False, server_default="none"))
    op.add_column("listings", sa.Column("photo_meta", JSON))
    op.add_column("orders", sa.Column("customer_phone", sa.String(16)))
    op.add_column("orders", sa.Column("pet_snapshot", JSON))
    for name, col in [
        ("reject_reason", sa.String(40)), ("pack_checks", JSON), ("accepted_at", sa.DateTime(timezone=True)), ("packed_at", sa.DateTime(timezone=True)),
        ("out_at", sa.DateTime(timezone=True)), ("delivered_at", sa.DateTime(timezone=True)), ("settled_at", sa.DateTime(timezone=True)),
    ]:
        op.add_column("sub_orders", sa.Column(name, col))
    op.add_column("sub_orders", sa.Column("delivery_code_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("sub_orders", sa.Column("payout_status", sa.String(10), nullable=False, server_default="on_hold"))


def downgrade() -> None:
    for c in ("payout_status", "delivery_code_attempts", "settled_at", "delivered_at", "out_at", "packed_at", "accepted_at", "pack_checks", "reject_reason"):
        op.drop_column("sub_orders", c)
    op.drop_column("orders", "pet_snapshot")
    op.drop_column("orders", "customer_phone")
    op.drop_column("listings", "photo_meta")
    op.drop_column("listings", "photo_status")
    op.drop_table("product_requests")
    op.drop_table("vendor_members")
    for c in ("low_stock_threshold", "photos", "hours_text", "holiday_mode"):
        op.drop_column("vendors", c)
