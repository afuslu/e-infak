"""Recipient lists (SMS / mail) and the mail module

Revision ID: mlg0stk000001
Revises: rcp0stk000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "mlg0stk000001"
down_revision = "rcp0stk000001"
branch_labels = None
depends_on = None


def _org():
    return sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                     nullable=False, index=True)


def upgrade() -> None:
    op.create_table(
        "recipient_lists",
        sa.Column("id", UUID(as_uuid=True), primary_key=True), _org(),
        sa.Column("channel", sa.String(8), nullable=False, server_default="sms"),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(300)),
        sa.Column("member_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "recipient_list_members",
        sa.Column("list_id", UUID(as_uuid=True), sa.ForeignKey("recipient_lists.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("donor_id", UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="CASCADE"), primary_key=True, index=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "mail_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True), _org(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "name", name="uq_mail_template_org_name"),
    )
    op.create_table(
        "mail_batches",
        sa.Column("id", UUID(as_uuid=True), primary_key=True), _org(),
        sa.Column("seq_no", sa.Integer, nullable=False, server_default="0"),
        sa.Column("source", sa.String(160), nullable=False, server_default=""),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("commercial", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("total", sa.Integer, nullable=False, server_default="0"),
        sa.Column("send_after", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("status", sa.String(12), nullable=False, server_default="queued"),
        sa.Column("stats", JSONB, nullable=False, server_default="{}"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_mail_batches_org_created", "mail_batches", ["organization_id", "created_at"])
    op.create_table(
        "mail_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True), _org(),
        sa.Column("batch_id", UUID(as_uuid=True), sa.ForeignKey("mail_batches.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("donor_id", UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="SET NULL"), index=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("name", sa.String(200)),
        sa.Column("status", sa.String(10), nullable=False, server_default="queued"),
        sa.Column("error", sa.Text),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_mail_messages_batch_status", "mail_messages", ["batch_id", "status"])


def downgrade() -> None:
    op.drop_table("mail_messages")
    op.drop_table("mail_batches")
    op.drop_table("mail_templates")
    op.drop_table("recipient_list_members")
    op.drop_table("recipient_lists")
