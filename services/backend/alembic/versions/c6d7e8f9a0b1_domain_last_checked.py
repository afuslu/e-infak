"""Custom domains: when DNS verification last ran.

Revision ID: c6d7e8f9a0b1
Revises: m3d1a0000001
"""
import sqlalchemy as sa
from alembic import op

revision = "c6d7e8f9a0b1"
down_revision = "m3d1a0000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization_domains", sa.Column("last_checked_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("organization_domains", "last_checked_at")
