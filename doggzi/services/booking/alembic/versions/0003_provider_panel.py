"""provider panel: providers, offers, job events, start/end codes, payouts; booking dispatch + job columns

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

ARR = postgresql.ARRAY(sa.String()).with_variant(sa.JSON(), "sqlite")
JSON = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def _ts():
    return [
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "providers", *_ts(),
        sa.Column("user_id", sa.Uuid(), nullable=False, unique=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("phone", sa.String(16)),
        sa.Column("skills", ARR, nullable=False, server_default="{}"),
        sa.Column("areas", ARR, nullable=False, server_default="{}"),
        sa.Column("rating", sa.Float(), nullable=False, server_default="5"),
        sa.Column("jobs_done", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cant_make_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_online", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("weekly_hours", JSON, nullable=False, server_default="[]"),
        sa.Column("days_off", ARR, nullable=False, server_default="{}"),
        sa.Column("docs", JSON, nullable=False, server_default="[]"),
    )
    # Booking: snapshots, dispatch and job state. All additive (nullable or defaulted).
    op.add_column("bookings", sa.Column("customer_phone", sa.String(16)))
    op.add_column("bookings", sa.Column("pet_snapshot", JSON))
    op.add_column("bookings", sa.Column("dispatch_status", sa.String(16), nullable=False, server_default="pending"))
    op.add_column("bookings", sa.Column("provider_id", sa.Uuid(), sa.ForeignKey("providers.id")))
    op.add_column("bookings", sa.Column("job_step", sa.String(16)))
    op.add_column("bookings", sa.Column("checklist", JSON))
    op.add_column("bookings", sa.Column("photos", JSON))
    op.add_column("bookings", sa.Column("pay_after_service", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("bookings", sa.Column("collected_mode", sa.String(8)))
    op.add_column("bookings", sa.Column("earning_paise", sa.Integer()))
    op.add_column("bookings", sa.Column("completed_at", sa.DateTime(timezone=True)))
    op.create_index("ix_bookings_provider_id", "bookings", ["provider_id"])
    op.create_table(
        "offers", *_ts(),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id"), nullable=False),
        sa.Column("provider_id", sa.Uuid(), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="offered"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True)),
        sa.Column("decline_reason", sa.String(40)),
        sa.Column("earning_paise", sa.Integer(), nullable=False),
    )
    op.create_index("ix_offers_booking_id", "offers", ["booking_id"])
    op.create_index("ix_offers_provider_id", "offers", ["provider_id"])
    op.create_table(
        "job_events", *_ts(),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id"), nullable=False),
        sa.Column("provider_id", sa.Uuid(), sa.ForeignKey("providers.id")),
        sa.Column("step", sa.String(24), nullable=False),
        sa.Column("meta", JSON),
    )
    op.create_index("ix_job_events_booking_id", "job_events", ["booking_id"])
    op.create_table(
        "booking_codes", *_ts(),
        sa.Column("booking_id", sa.Uuid(), sa.ForeignKey("bookings.id"), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_at", sa.DateTime(timezone=True)),
        sa.Column("used_at", sa.DateTime(timezone=True)),
    )
    op.create_index("uq_booking_codes", "booking_codes", ["booking_id", "kind"], unique=True)
    op.create_table(
        "provider_payouts", *_ts(),
        sa.Column("provider_id", sa.Uuid(), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_provider_payouts_provider_id", "provider_payouts", ["provider_id"])


def downgrade() -> None:
    op.drop_table("provider_payouts")
    op.drop_table("booking_codes")
    op.drop_table("job_events")
    op.drop_table("offers")
    op.drop_index("ix_bookings_provider_id", "bookings")
    for c in ("completed_at", "earning_paise", "collected_mode", "pay_after_service", "photos", "checklist", "job_step", "provider_id", "dispatch_status", "pet_snapshot", "customer_phone"):
        op.drop_column("bookings", c)
    op.drop_table("providers")
