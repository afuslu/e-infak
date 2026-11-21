"""Staff notification inbox and per-person notification settings (mobile app)

Revision ID: nt0stf000001
Revises: ch4n00000002
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "nt0stf000001"
down_revision = "ch4n00000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(32), nullable=False, index=True),
        sa.Column("channel", sa.String(32)),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("amount_cents", sa.Integer),
        sa.Column("currency", sa.String(3)),
        sa.Column("data", JSONB, nullable=False, server_default="{}"),
        sa.Column("pushed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_staff_notifications_user_created", "staff_notifications", ["user_id", "created_at"])
    op.create_table(
        "staff_notification_settings",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("settings", JSONB, nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("staff_notification_settings")
    op.drop_index("ix_staff_notifications_user_created", table_name="staff_notifications")
    op.drop_table("staff_notifications")
