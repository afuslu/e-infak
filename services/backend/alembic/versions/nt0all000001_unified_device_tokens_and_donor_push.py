"""Unified device tokens (staff, donor, platform) and donor push opt-out.

Revision ID: nt0all000001
Revises: mapp00000001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "nt0all000001"
down_revision = "mapp00000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "donors",
        sa.Column("push_opt_out", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # Deduplicate any shared physical device token rows keeping the most recently created one.
    op.execute(
        """
        DELETE FROM device_tokens a
        USING device_tokens b
        WHERE a.token = b.token
          AND (a.created_at < b.created_at OR (a.created_at = b.created_at AND a.id < b.id))
        """
    )
    op.drop_constraint("uq_device_tokens_user_token", "device_tokens", type_="unique")
    op.alter_column("device_tokens", "user_id", existing_type=UUID(as_uuid=True), nullable=True)
    op.add_column(
        "device_tokens",
        sa.Column("donor_id", UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="CASCADE"), nullable=True),
    )
    op.add_column(
        "device_tokens",
        sa.Column(
            "platform_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("platform_users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_device_tokens_donor_id", "device_tokens", ["donor_id"])
    op.create_index("ix_device_tokens_platform_user_id", "device_tokens", ["platform_user_id"])
    op.create_unique_constraint("uq_device_tokens_token", "device_tokens", ["token"])


def downgrade() -> None:
    op.drop_constraint("uq_device_tokens_token", "device_tokens", type_="unique")
    op.drop_index("ix_device_tokens_platform_user_id", table_name="device_tokens")
    op.drop_index("ix_device_tokens_donor_id", table_name="device_tokens")
    op.drop_column("device_tokens", "platform_user_id")
    op.drop_column("device_tokens", "donor_id")
    op.execute("DELETE FROM device_tokens WHERE user_id IS NULL")
    op.alter_column("device_tokens", "user_id", existing_type=UUID(as_uuid=True), nullable=False)
    op.create_unique_constraint("uq_device_tokens_user_token", "device_tokens", ["user_id", "token"])
    op.drop_column("donors", "push_opt_out")
