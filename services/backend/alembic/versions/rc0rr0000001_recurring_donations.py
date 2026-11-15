"""Recurring donation instructions: card mode and reminder mode.

Revision ID: rc0rr0000001
Revises: ip0rul000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "rc0rr0000001"
down_revision = "ip0rul000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("mode", sa.String(16), nullable=False, server_default="reminder"))
    op.add_column("subscriptions", sa.Column("day_of_month", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("subscriptions", sa.Column("provider", sa.String(32)))
    op.add_column("subscriptions", sa.Column("card_ref", sa.Text()))
    op.add_column("subscriptions", sa.Column("card_last_4", sa.String(4)))
    op.add_column("subscriptions", sa.Column("card_brand", sa.String(32)))
    op.add_column("subscriptions", sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("subscriptions", sa.Column("last_error", sa.String(500)))
    op.add_column("subscriptions", sa.Column("last_charged_at", sa.DateTime(timezone=True)))
    op.add_column("subscriptions", sa.Column("last_reminded_at", sa.DateTime(timezone=True)))
    op.add_column("subscriptions", sa.Column("source_order_id", UUID(as_uuid=True),
                                             sa.ForeignKey("payment_orders.id", ondelete="SET NULL")))
    op.add_column("subscriptions", sa.Column("manage_token", sa.String(64)))
    op.create_index("ix_subscriptions_manage_token", "subscriptions", ["manage_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_subscriptions_manage_token", table_name="subscriptions")
    for column in ("manage_token", "source_order_id", "last_reminded_at", "last_charged_at", "last_error",
                   "failed_attempts", "card_brand", "card_last_4", "card_ref", "provider", "day_of_month", "mode"):
        op.drop_column("subscriptions", column)
