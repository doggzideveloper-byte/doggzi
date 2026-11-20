"""seed Doggzi Store + the menu-card catalog (data migration; medicine row skipped)

Revision ID: 0002
Revises: 0001
"""
import uuid
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.seed import DOGGZI_STORE, product_rows

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None
ARR = postgresql.ARRAY(sa.String())
ts = lambda: [sa.column("id", sa.Uuid()), sa.column("created_at", sa.DateTime(timezone=True)), sa.column("updated_at", sa.DateTime(timezone=True))]  # noqa: E731
vendors = sa.table("vendors", *ts(), *[sa.column(c) for c in ("name", "slug", "area", "story", "delivery_fee_paise", "kyc_status", "commission_bps", "is_doggzi", "is_active")], sa.column("serviceable_pincodes", ARR))
products = sa.table("products", *ts(), *[sa.column(c) for c in ("name", "brand", "brand_as_listed", "category", "pack_size", "popularity_rank")], sa.column("pet_types", ARR), sa.column("source_flags", ARR))
listings = sa.table("listings", *ts(), *[sa.column(c) for c in ("vendor_id", "product_id", "sku", "price_paise", "stock_qty", "is_active")])


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    vid = uuid.uuid4()
    op.bulk_insert(vendors, [{"id": vid, "created_at": now, "updated_at": now, **DOGGZI_STORE}])
    prows, lrows = [], []
    for r in product_rows():
        pid = uuid.uuid4()
        prows.append({"id": pid, "created_at": now, "updated_at": now, **{k: r[k] for k in ("name", "brand", "brand_as_listed", "category", "pack_size", "popularity_rank", "pet_types", "source_flags")}})
        lrows.append({"id": uuid.uuid4(), "created_at": now, "updated_at": now, "vendor_id": vid, "product_id": pid, "sku": r["sku"], "price_paise": r["price_paise"], "stock_qty": r["stock_qty"], "is_active": True})
    op.bulk_insert(products, prows)
    op.bulk_insert(listings, lrows)


def downgrade() -> None:
    # Removes only the seed, and only while no order references it. Ask before running on a live database.
    op.execute("DELETE FROM listings WHERE vendor_id IN (SELECT id FROM vendors WHERE slug='doggzi-store') AND id NOT IN (SELECT listing_id FROM sub_order_items) AND id NOT IN (SELECT listing_id FROM cart_items)")
    op.execute("DELETE FROM products WHERE id NOT IN (SELECT product_id FROM listings)")
    op.execute("DELETE FROM vendors WHERE slug='doggzi-store' AND id NOT IN (SELECT vendor_id FROM listings)")
