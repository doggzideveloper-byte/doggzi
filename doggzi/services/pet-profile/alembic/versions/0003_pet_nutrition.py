"""pet nutrition + notify flag (Page 3). Additive only: no drops.

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


def upgrade() -> None:
    op.add_column("pets", sa.Column("weight_kg", sa.Numeric(5, 2)))
    op.add_column("pets", sa.Column("life_stage", sa.Text()))
    op.add_column("pets", sa.Column("age_years", sa.Numeric(4, 1)))
    op.add_column("pets", sa.Column("allergies", postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'")))
    op.add_column("pets", sa.Column("activity_level", sa.Text()))
    op.add_column("pets", sa.Column("notify_fresh_food", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_check_constraint("ck_pets_life_stage", "pets", "life_stage is null or life_stage in ('puppy','kitten','adult','senior')")
    op.create_check_constraint("ck_pets_weight", "pets", "weight_kg is null or (weight_kg >= 0.5 and weight_kg <= 100)")


def downgrade() -> None:
    # Reversal drops data; ask before running this on a real database.
    op.drop_constraint("ck_pets_weight", "pets")
    op.drop_constraint("ck_pets_life_stage", "pets")
    for c in ("notify_fresh_food", "activity_level", "allergies", "age_years", "life_stage", "weight_kg"):
        op.drop_column("pets", c)
