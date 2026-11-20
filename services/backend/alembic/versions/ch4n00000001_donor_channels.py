"""WhatsApp messages, call-center call log and operator SMS donation records

Revision ID: ch4n00000001
Revises: pl0tckt000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "ch4n00000001"
down_revision = "pl0tckt000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone_extension", sa.String(10)))
    op.create_table(
        "whatsapp_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("donor_id", UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="SET NULL"), index=True),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False, server_default="template"),
        sa.Column("template_name", sa.String(120)),
        sa.Column("language", sa.String(10)),
        sa.Column("params", JSONB, nullable=False, server_default="[]"),
        sa.Column("body", sa.Text),
        sa.Column("status", sa.String(12), nullable=False, server_default="queued"),
        sa.Column("provider_ref", sa.String(128), index=True),
        sa.Column("error", sa.Text),
        sa.Column("batch_id", UUID(as_uuid=True), index=True),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("read_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_whatsapp_messages_org_status", "whatsapp_messages", ["organization_id", "status"])

    op.create_table(
        "call_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("provider", sa.String(20), nullable=False, server_default="netsantral"),
        sa.Column("unique_id", sa.String(80), nullable=False),
        sa.Column("direction", sa.String(3), nullable=False, server_default="in"),
        sa.Column("customer_phone", sa.String(20)),
        sa.Column("extension", sa.String(20)),
        sa.Column("donor_id", UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="SET NULL"), index=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="ringing"),
        sa.Column("last_event", sa.String(20)),
        sa.Column("talk_seconds", sa.Integer),
        sa.Column("recording_url", sa.String(500)),
        sa.Column("note", sa.Text),
        sa.Column("started_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "provider", "unique_id", name="uq_call_log_org_unique"),
    )
    op.create_index("ix_call_logs_org_started", "call_logs", ["organization_id", "started_at"])

    op.create_table(
        "sms_donation_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("external_ref", sa.String(120), nullable=False),
        sa.Column("source", sa.String(10), nullable=False, server_default="webhook"),
        sa.Column("phone", sa.String(20)),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("keyword", sa.String(60)),
        sa.Column("operator", sa.String(40)),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("campaign_id", UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="SET NULL")),
        sa.Column("donor_id", UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="SET NULL"), index=True),
        sa.Column("donation_id", UUID(as_uuid=True), sa.ForeignKey("donations.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(10), nullable=False, server_default="recorded"),
        sa.Column("error", sa.Text),
        sa.Column("raw", JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "external_ref", name="uq_sms_donation_org_ref"),
    )
    op.create_index("ix_sms_donation_org_received", "sms_donation_records", ["organization_id", "received_at"])


def downgrade() -> None:
    op.drop_table("sms_donation_records")
    op.drop_table("call_logs")
    op.drop_table("whatsapp_messages")
    op.drop_column("users", "phone_extension")
