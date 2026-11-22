"""Pledge installments charged from a stored card (STK PRO "Otomatik Talimat Modülü ile Entegre")

Revision ID: plg0stk000001
Revises: mgr0stk000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "plg0stk000001"
down_revision = "mgr0stk000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pledges", sa.Column("auto_charge", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("pledges", sa.Column("card_subscription_id", UUID(as_uuid=True),
                                       sa.ForeignKey("subscriptions.id", ondelete="SET NULL")))
    op.add_column("pledges", sa.Column("last_charge_error", sa.String(500)))
    op.add_column("pledges", sa.Column("last_charge_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    for name in ("last_charge_at", "last_charge_error", "card_subscription_id", "auto_charge"):
        op.drop_column("pledges", name)
