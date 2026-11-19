"""breeds and pets (Page 1)

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
    op.create_table(
        "breeds",
        *_ts(),
        sa.Column("type", sa.String(8), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("avatar_path", sa.String(200)),
        sa.Column("popularity_rank", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.CheckConstraint("type in ('dog','cat')", name="ck_breeds_type"),
    )
    op.create_index("uq_breeds_type_slug", "breeds", ["type", "slug"], unique=True)
    op.create_table(
        "pets",
        *_ts(),
        sa.Column("guest_id", sa.Uuid()),
        sa.Column("owner_user_id", sa.Uuid()),
        sa.Column("name", sa.String(24), nullable=False),
        sa.Column("type", sa.String(8), nullable=False),
        sa.Column("breed_id", sa.Uuid(), sa.ForeignKey("breeds.id")),
        sa.Column("photo_url", sa.String(500)),
        sa.CheckConstraint("type in ('dog','cat')", name="ck_pets_type"),
    )
    op.create_index("ix_pets_guest_id", "pets", ["guest_id"])
    op.create_index("ix_pets_owner_user_id", "pets", ["owner_user_id"])


def downgrade() -> None:
    op.drop_table("pets")
    op.drop_table("breeds")
