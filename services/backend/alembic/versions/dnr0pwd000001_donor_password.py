"""Add optional hashed_password to donors for password-based donor portal login.

Revision ID: dnr0pwd000001
Revises: plg0stk000001
Create Date: 2026-11-22 13:27:00
"""
from alembic import op
import sqlalchemy as sa


revision = "dnr0pwd000001"
down_revision = "plg0stk000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("donors", sa.Column("hashed_password", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("donors", "hashed_password")
