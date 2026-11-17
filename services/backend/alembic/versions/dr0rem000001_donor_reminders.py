"""Hatırlatıcı: staff call reminders.

Revision ID: dr0rem000001
Revises: mrg000000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "dr0rem000001"
down_revision = "mrg000000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "donor_reminders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("donor_id", UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("remind_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("repeat", sa.String(10), nullable=False, server_default="none"),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_donor_reminders_donor_id", "donor_reminders", ["donor_id"])
    op.create_index("ix_donor_reminders_owner_open", "donor_reminders",
                    ["organization_id", "created_by_id", "completed_at", "remind_at"])
    op.create_index("ix_donor_reminders_due", "donor_reminders", ["completed_at", "notified_at", "remind_at"])


def downgrade() -> None:
    op.drop_table("donor_reminders")
