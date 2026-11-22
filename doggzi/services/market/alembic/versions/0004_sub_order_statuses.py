"""sub_orders status CHECK: allow every status the code writes (adds 'missed' for the accept-window expiry)

Revision ID: 0004
Revises: 0003

0001 created ck_sub_orders_status without 'missed', so the Vendor panel's expiry sweep failed on Postgres.
The list now comes from app.models.SUB_ORDER_STATUSES (also enforced by the model, so tests catch drift).
Widening a CHECK is non-destructive: no rows change.
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

STATUSES = ("placed", "accepted", "rejected", "packed", "out_for_delivery", "delivered", "cancelled", "missed")
OLD = ("placed", "accepted", "rejected", "packed", "out_for_delivery", "delivered", "cancelled")


def _expr(values) -> str:
    return "status in (" + ", ".join(f"'{v}'" for v in values) + ")"


def upgrade() -> None:
    op.drop_constraint("ck_sub_orders_status", "sub_orders", type_="check")
    op.create_check_constraint("ck_sub_orders_status", "sub_orders", _expr(STATUSES))


def downgrade() -> None:
    # Rows already 'missed' would violate the old constraint; send them back to OPS as cancelled first.
    op.execute("update sub_orders set status = 'cancelled' where status = 'missed'")
    op.drop_constraint("ck_sub_orders_status", "sub_orders", type_="check")
    op.create_check_constraint("ck_sub_orders_status", "sub_orders", _expr(OLD))
