"""console: user name + token version, memberships (roles)

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("name", sa.String(80)))
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_table(
        "memberships",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
    )
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])
    op.create_index("uq_memberships_user_role", "memberships", ["user_id", "role"], unique=True)


def downgrade() -> None:
    op.drop_table("memberships")
    op.drop_column("users", "token_version")
    op.drop_column("users", "name")
