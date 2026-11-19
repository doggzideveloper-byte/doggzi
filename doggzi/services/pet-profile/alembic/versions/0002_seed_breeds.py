"""seed breeds (data migration)

Revision ID: 0002
Revises: 0001
"""
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

from app.seed import breed_rows

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

breeds = sa.table(
    "breeds",
    sa.column("id", sa.Uuid()), sa.column("created_at", sa.DateTime(timezone=True)), sa.column("updated_at", sa.DateTime(timezone=True)),
    sa.column("type", sa.String), sa.column("name", sa.String), sa.column("slug", sa.String), sa.column("avatar_path", sa.String),
    sa.column("popularity_rank", sa.Integer), sa.column("is_pinned", sa.Boolean), sa.column("is_active", sa.Boolean),
)


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    op.bulk_insert(breeds, [{"id": uuid.uuid4(), "created_at": now, "updated_at": now, **r} for r in breed_rows()])


def downgrade() -> None:
    # Only removes rows this migration added, and only if no pet references them.
    slugs = [r["slug"] for r in breed_rows()]
    op.execute(breeds.delete().where(breeds.c.slug.in_(slugs)).where(~sa.exists().where(sa.text("pets.breed_id = breeds.id"))))
