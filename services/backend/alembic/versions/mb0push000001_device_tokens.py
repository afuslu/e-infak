"""Mobile device tokens for push notifications.

Revision ID: mb0push000001
Revises: tk0m00000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "mb0push000001"
down_revision = "tk0m00000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "device_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False, server_default="expo"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("user_id", "token", name="uq_device_tokens_user_token"),
    )


def downgrade() -> None:
    op.drop_table("device_tokens")
