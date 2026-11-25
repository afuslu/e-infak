"""Donor portal account deletion: remember when the donor closed their account.

Revision ID: dacc00000001
Revises: nt0all000001
"""
from alembic import op
import sqlalchemy as sa

revision = "dacc00000001"
down_revision = "nt0all000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("donors", sa.Column("portal_closed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("donors", "portal_closed_at")
