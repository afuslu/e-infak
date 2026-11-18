"""Platform SaaS controls: subscriptions, payments, operator roles, broadcasts

Revision ID: pl0saas000001
Revises: pw0chg000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "pl0saas000001"
down_revision = "pw0chg000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("subscription_status", sa.String(16), nullable=False, server_default="active"))
    op.add_column("organizations", sa.Column("billing_cycle", sa.String(16), nullable=False, server_default="monthly"))
    op.add_column("organizations", sa.Column("subscription_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organizations", sa.Column("monthly_fee_cents", sa.Integer(), nullable=False, server_default="0"))

    op.add_column("platform_users", sa.Column("role", sa.String(20), nullable=False, server_default="admin"))

    op.create_table(
        "platform_payments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("recorded_by_id", UUID(as_uuid=True), sa.ForeignKey("platform_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="TRY"),
        sa.Column("period_label", sa.String(80), nullable=False),
        sa.Column("payment_method", sa.String(24), nullable=False, server_default="havale"),
        sa.Column("status", sa.String(16), nullable=False, server_default="paid"),
        sa.Column("notes", sa.String(300), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )

    op.create_table(
        "platform_broadcasts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_by_id", UUID(as_uuid=True), sa.ForeignKey("platform_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("level", sa.String(16), nullable=False, server_default="info"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true", index=True),
        sa.Column("maintenance_mode", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table("platform_broadcasts")
    op.drop_table("platform_payments")
    op.drop_column("platform_users", "role")
    op.drop_column("organizations", "monthly_fee_cents")
    op.drop_column("organizations", "subscription_ends_at")
    op.drop_column("organizations", "billing_cycle")
    op.drop_column("organizations", "subscription_status")
