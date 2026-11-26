"""WhatsApp Business: inbox conversations, incoming messages, event notifications, consent and calls.

Revision ID: wa0biz000001
Revises: dacc00000001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "wa0biz000001"
down_revision = "dacc00000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whatsapp_conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("donor_id", UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="SET NULL"), index=True),
        sa.Column("contact_name", sa.String(200)),
        sa.Column("status", sa.String(10), nullable=False, server_default="open"),
        sa.Column("assigned_to", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("unread_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_inbound_at", sa.DateTime(timezone=True)),
        sa.Column("last_message_at", sa.DateTime(timezone=True)),
        sa.Column("last_preview", sa.String(200)),
        sa.Column("last_auto_reply_at", sa.DateTime(timezone=True)),
        sa.Column("source_ref", sa.String(80)),
        sa.Column("opted_out", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "phone", name="uq_whatsapp_conversation_org_phone"),
    )
    op.create_index("ix_whatsapp_conversations_org_last", "whatsapp_conversations",
                    ["organization_id", "last_message_at"])

    op.alter_column("whatsapp_messages", "kind", type_=sa.String(20), existing_nullable=False)
    op.alter_column("whatsapp_messages", "status", type_=sa.String(12), existing_nullable=False)
    op.add_column("whatsapp_messages", sa.Column("direction", sa.String(3), nullable=False, server_default="out"))
    op.add_column("whatsapp_messages", sa.Column(
        "conversation_id", UUID(as_uuid=True), sa.ForeignKey("whatsapp_conversations.id", ondelete="SET NULL")))
    op.create_index("ix_whatsapp_messages_conversation", "whatsapp_messages", ["conversation_id", "created_at"])
    op.add_column("whatsapp_messages", sa.Column("source", sa.String(20), nullable=False, server_default="manual"))
    op.add_column("whatsapp_messages", sa.Column("media", JSONB))
    op.add_column("whatsapp_messages", sa.Column("interactive", JSONB))
    op.add_column("whatsapp_messages", sa.Column("fallback", JSONB))
    op.add_column("whatsapp_messages", sa.Column("related_type", sa.String(30)))
    op.add_column("whatsapp_messages", sa.Column("related_id", UUID(as_uuid=True)))
    op.add_column("whatsapp_messages", sa.Column("dedupe_key", sa.String(120)))
    op.add_column("whatsapp_messages", sa.Column("reply_to", sa.String(128)))
    op.create_index("uq_whatsapp_messages_org_dedupe", "whatsapp_messages", ["organization_id", "dedupe_key"],
                    unique=True, postgresql_where=sa.text("dedupe_key IS NOT NULL"))

    op.add_column("donors", sa.Column("whatsapp_opt_in_at", sa.DateTime(timezone=True)))
    op.add_column("donors", sa.Column("whatsapp_opt_out", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("donors", sa.Column("whatsapp_consent_source", sa.String(30)))

    op.create_table(
        "whatsapp_calls",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("call_id", sa.String(128), nullable=False),
        sa.Column("direction", sa.String(20), nullable=False, server_default="USER_INITIATED"),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("donor_id", UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="SET NULL"), index=True),
        sa.Column("conversation_id", UUID(as_uuid=True),
                  sa.ForeignKey("whatsapp_conversations.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(12), nullable=False, server_default="ringing"),
        sa.Column("sdp_offer", sa.Text),
        sa.Column("sdp_answer", sa.Text),
        sa.Column("answered_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("connected_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("duration_seconds", sa.Integer),
        sa.Column("error", sa.Text),
        sa.UniqueConstraint("organization_id", "call_id", name="uq_whatsapp_call_org_call"),
    )
    op.create_index("ix_whatsapp_calls_org_started", "whatsapp_calls", ["organization_id", "started_at"])


def downgrade() -> None:
    op.drop_index("ix_whatsapp_calls_org_started", table_name="whatsapp_calls")
    op.drop_table("whatsapp_calls")
    op.drop_column("donors", "whatsapp_consent_source")
    op.drop_column("donors", "whatsapp_opt_out")
    op.drop_column("donors", "whatsapp_opt_in_at")
    op.drop_index("uq_whatsapp_messages_org_dedupe", table_name="whatsapp_messages")
    for column in ("reply_to", "dedupe_key", "related_id", "related_type", "fallback", "interactive", "media",
                   "source"):
        op.drop_column("whatsapp_messages", column)
    op.drop_index("ix_whatsapp_messages_conversation", table_name="whatsapp_messages")
    op.drop_column("whatsapp_messages", "conversation_id")
    op.drop_column("whatsapp_messages", "direction")
    op.execute("DELETE FROM whatsapp_messages WHERE length(kind) > 10")
    op.alter_column("whatsapp_messages", "kind", type_=sa.String(10), existing_nullable=False)
    op.drop_index("ix_whatsapp_conversations_org_last", table_name="whatsapp_conversations")
    op.drop_table("whatsapp_conversations")
