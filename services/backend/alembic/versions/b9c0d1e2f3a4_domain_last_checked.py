"""Custom domains: when DNS verification last ran.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
"""
import sqlalchemy as sa
from alembic import op

revision = "b9c0d1e2f3a4"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization_domains", sa.Column("last_checked_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("organization_domains", "last_checked_at")
