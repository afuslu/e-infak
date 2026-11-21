"""Add TOTP 2FA fields to users table

Revision ID: 2fa0stk000001
Revises: sys0stk000001
"""
import sqlalchemy as sa
from alembic import op

revision = "2fa0stk000001"
down_revision = "sys0stk000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.String(64)))
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "totp_secret")
