"""Admin panel: vendor onboarding stage + pause, product block / brand confirmation, sub-order refunds

Revision ID: 0005
Revises: 0004

Additive only: new columns with defaults (existing stores stay 'live'; products flagged 'brand_mismatch' start
unconfirmed), plus CHECKs for the new enums. No rows are deleted.
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vendors", sa.Column("stage", sa.String(12), nullable=False, server_default="live"))
    op.add_column("vendors", sa.Column("paused", sa.Boolean, nullable=False, server_default=sa.false()))
    op.create_check_constraint("ck_vendors_stage", "vendors", "stage in ('applied', 'docs', 'razorpay', 'live')")
    op.add_column("products", sa.Column("is_blocked", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("products", sa.Column("brand_confirmed", sa.Boolean, nullable=False, server_default=sa.true()))
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("update products set brand_confirmed = false where 'brand_mismatch' = any(source_flags)")
    else:
        op.execute("update products set brand_confirmed = 0 where source_flags like '%brand_mismatch%'")
    op.add_column("sub_orders", sa.Column("refund_status", sa.String(12), nullable=False, server_default="none"))
    op.add_column("sub_orders", sa.Column("refunded_paise", sa.Integer))
    op.add_column("sub_orders", sa.Column("refunded_at", sa.DateTime(timezone=True)))
    op.create_check_constraint("ck_sub_orders_refund_status", "sub_orders", "refund_status in ('none', 'refunded')")


def downgrade() -> None:
    op.drop_constraint("ck_sub_orders_refund_status", "sub_orders", type_="check")
    for c in ("refunded_at", "refunded_paise", "refund_status"):
        op.drop_column("sub_orders", c)
    op.drop_column("products", "brand_confirmed")
    op.drop_column("products", "is_blocked")
    op.drop_constraint("ck_vendors_stage", "vendors", type_="check")
    op.drop_column("vendors", "paused")
    op.drop_column("vendors", "stage")
