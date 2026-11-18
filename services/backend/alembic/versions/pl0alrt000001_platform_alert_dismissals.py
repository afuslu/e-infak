"""Add platform_alert_dismissals table

Revision ID: pl0alrt000001
Revises: pl0saas000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "pl0alrt000001"
down_revision = "pl0saas000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_alert_dismissals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("kind", sa.String(64), nullable=False, index=True),
        sa.Column("dismissed_by_id", UUID(as_uuid=True), sa.ForeignKey("platform_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("platform_alert_dismissals")
