"""Admin panel: provider onboarding stage (existing providers stay 'live')

Revision ID: 0004
Revises: 0003

Additive only: one column with a default and its CHECK. No rows are deleted.
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("providers", sa.Column("stage", sa.String(12), nullable=False, server_default="live"))
    op.create_check_constraint("ck_providers_stage", "providers", "stage in ('applied', 'idcheck', 'skills', 'areas', 'training', 'live')")


def downgrade() -> None:
    op.drop_constraint("ck_providers_stage", "providers", type_="check")
    op.drop_column("providers", "stage")
