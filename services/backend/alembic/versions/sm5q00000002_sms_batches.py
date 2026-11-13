"""Bulk SMS batches; commercial flag on messages.

Revision ID: sm5q00000002
Revises: sm5q00000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "sm5q00000002"
down_revision = "sm5q00000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sms_messages", sa.Column("commercial", sa.Boolean(), nullable=False, server_default="false"))
    op.create_table(
        "sms_batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("audience", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("audience_label", sa.String(200), nullable=False, server_default=""),
        sa.Column("commercial", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("send_after", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_sms_batches_org_created", "sms_batches", ["organization_id", "created_at"])


def downgrade() -> None:
    op.drop_table("sms_batches")
    op.drop_column("sms_messages", "commercial")
