"""Modern bulk SMS features: campaign ROI, throttling, A/B testing, click tracking.

Revision ID: sm5q00000005
Revises: sm5q00000004
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "sm5q00000005"
down_revision = "sm5q00000004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sms_batches", sa.Column("campaign_id", UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="SET NULL")))
    op.add_column("sms_batches", sa.Column("throttle_per_minute", sa.Integer()))
    op.add_column("sms_batches", sa.Column("ab_variant_body", sa.Text()))
    op.add_column("sms_batches", sa.Column("ab_test_percent", sa.Integer()))
    op.add_column("sms_batches", sa.Column("updated_at", sa.DateTime(timezone=True)))

    op.add_column("sms_messages", sa.Column("ab_variant", sa.String(1)))
    op.add_column("sms_messages", sa.Column("track_code", sa.String(20)))
    op.add_column("sms_messages", sa.Column("clicked_at", sa.DateTime(timezone=True)))
    op.add_column("sms_messages", sa.Column("click_count", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("ix_sms_messages_track_code", "sms_messages", ["track_code"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_sms_messages_track_code", table_name="sms_messages")
    op.drop_column("sms_messages", "click_count")
    op.drop_column("sms_messages", "clicked_at")
    op.drop_column("sms_messages", "track_code")
    op.drop_column("sms_messages", "ab_variant")

    op.drop_column("sms_batches", "updated_at")
    op.drop_column("sms_batches", "ab_test_percent")
    op.drop_column("sms_batches", "ab_variant_body")
    op.drop_column("sms_batches", "throttle_per_minute")
    op.drop_column("sms_batches", "campaign_id")
