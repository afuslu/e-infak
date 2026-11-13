"""SMS queue and log; templates bound to events.

Revision ID: sm5q00000001
Revises: l3g4l0000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "sm5q00000001"
down_revision = "l3g4l0000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sms_templates", sa.Column("event_key", sa.String(40)))
    op.add_column("sms_templates", sa.Column("auto_mode", sa.String(8), nullable=False, server_default="manual"))
    op.add_column("sms_templates", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("sms_templates", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))
    op.create_unique_constraint("uq_sms_template_org_event", "sms_templates", ["organization_id", "event_key"])

    op.create_table(
        "sms_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seq_no", sa.Integer(), nullable=False),
        sa.Column("donor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="SET NULL")),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("source", sa.String(16), nullable=False, server_default="manual"),
        sa.Column("related_type", sa.String(32)),
        sa.Column("related_id", postgresql.UUID(as_uuid=True)),
        sa.Column("dedupe_key", sa.String(120)),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sms_templates.id", ondelete="SET NULL")),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True)),
        sa.Column("encoding", sa.String(8), nullable=False, server_default="gsm"),
        sa.Column("parts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("provider", sa.String(32)),
        sa.Column("provider_ref", sa.String(64)),
        sa.Column("error", sa.Text()),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("send_after", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "seq_no", name="uq_sms_message_org_seq"),
        sa.UniqueConstraint("organization_id", "dedupe_key", name="uq_sms_message_org_dedupe"),
    )
    op.create_index("ix_sms_messages_donor_id", "sms_messages", ["donor_id"])
    op.create_index("ix_sms_messages_batch_id", "sms_messages", ["batch_id"])
    op.create_index("ix_sms_messages_due", "sms_messages", ["status", "send_after"])
    op.create_index("ix_sms_messages_org_created", "sms_messages", ["organization_id", "created_at"])
    op.create_index("ix_sms_messages_related", "sms_messages", ["organization_id", "related_type", "related_id"])


def downgrade() -> None:
    op.drop_table("sms_messages")
    op.drop_constraint("uq_sms_template_org_event", "sms_templates", type_="unique")
    for column in ("sort_order", "is_active", "auto_mode", "event_key"):
        op.drop_column("sms_templates", column)
