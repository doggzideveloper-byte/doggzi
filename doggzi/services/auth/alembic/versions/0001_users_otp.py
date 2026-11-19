"""users and otp codes

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op

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
    op.create_table("users", *_ts(), sa.Column("phone", sa.String(16), nullable=False, unique=True), sa.Column("role", sa.String(16), nullable=False, server_default="USER"))
    op.create_table(
        "otp_codes", *_ts(),
        sa.Column("phone", sa.String(16), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_otp_codes_phone", "otp_codes", ["phone"])


def downgrade() -> None:
    op.drop_table("otp_codes")
    op.drop_table("users")
