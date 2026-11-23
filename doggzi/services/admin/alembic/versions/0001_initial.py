"""admin: audit log, customer profiles + notes, content (FAQs, testimonials, videos), site config

Revision ID: 0001
Revises:
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

JSON = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def _ts():
    return [sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False)]


def upgrade() -> None:
    op.create_table("audit_log", *_ts(), sa.Column("actor_user_id", sa.Uuid(), nullable=False), sa.Column("actor_name", sa.String(80), nullable=False),
                    sa.Column("actor_role", sa.String(8), nullable=False), sa.Column("module", sa.String(20), nullable=False), sa.Column("action", sa.String(300), nullable=False),
                    sa.Column("target", sa.String(80)), sa.Column("before", sa.String(500)), sa.Column("after", sa.String(500)))
    op.create_index("ix_audit_log_actor_user_id", "audit_log", ["actor_user_id"])
    op.create_index("ix_audit_log_module", "audit_log", ["module"])
    op.create_index("ix_audit_log_created_at", "audit_log", ["created_at"])
    op.create_table("customer_profiles", *_ts(), sa.Column("user_id", sa.Uuid(), nullable=False, unique=True), sa.Column("area", sa.String(120)), sa.Column("pincode", sa.String(6)))
    op.create_table("customer_notes", *_ts(), sa.Column("user_id", sa.Uuid(), nullable=False), sa.Column("author_name", sa.String(80), nullable=False), sa.Column("body", sa.Text(), nullable=False))
    op.create_index("ix_customer_notes_user_id", "customer_notes", ["user_id"])
    op.create_table("content_items", *_ts(), sa.Column("kind", sa.String(12), nullable=False), sa.Column("page", sa.String(20)),
                    sa.Column("status", sa.String(8), nullable=False, server_default="draft"), sa.Column("consent", sa.Boolean(), nullable=False, server_default=sa.false()),
                    sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"), sa.Column("data", JSON, nullable=False),
                    sa.CheckConstraint("kind in ('faq', 'testimonial', 'video')", name="ck_content_kind"),
                    sa.CheckConstraint("status in ('draft', 'live')", name="ck_content_status"),
                    sa.CheckConstraint("kind <> 'testimonial' or status = 'draft' or consent", name="ck_content_testimonial_consent"))
    op.create_table("site_config", *_ts(), sa.Column("key", sa.String(40), nullable=False, unique=True), sa.Column("value", JSON, nullable=False))


def downgrade() -> None:
    for t in ("site_config", "content_items", "customer_notes", "customer_profiles", "audit_log"):
        op.drop_table(t)
