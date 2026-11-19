"""seed the services catalog (data migration)

Revision ID: 0002
Revises: 0001
"""
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.seed import PACKAGES, item_rows

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

ts = [sa.column("id", sa.Uuid()), sa.column("created_at", sa.DateTime(timezone=True)), sa.column("updated_at", sa.DateTime(timezone=True))]
items = sa.table("service_items", *ts, sa.column("group", sa.String), sa.column("name", sa.String), sa.column("slug", sa.String),
                 sa.column("price_paise", sa.Integer), sa.column("price_mode", sa.String), sa.column("scene_key", sa.String),
                 sa.column("pet_types", postgresql.ARRAY(sa.String())), sa.column("is_active", sa.Boolean), sa.column("sort_order", sa.Integer))
pkgs = sa.table("package_items", *[sa.column(c.name, c.type) for c in ts], sa.column("package_id", sa.Uuid()), sa.column("item_id", sa.Uuid()))


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    rows = [{"id": uuid.uuid4(), "created_at": now, "updated_at": now, **r} for r in item_rows()]
    op.bulk_insert(items, rows)
    ids = {r["slug"]: r["id"] for r in rows}
    op.bulk_insert(pkgs, [{"id": uuid.uuid4(), "created_at": now, "updated_at": now, "package_id": ids[p], "item_id": ids[i]} for p, inc in PACKAGES.items() for i in inc])


def downgrade() -> None:
    op.execute(pkgs.delete())
    slugs = [r["slug"] for r in item_rows()]
    op.execute(items.delete().where(items.c.slug.in_(slugs)).where(~sa.exists().where(sa.text("booking_items.item_id = service_items.id"))))
