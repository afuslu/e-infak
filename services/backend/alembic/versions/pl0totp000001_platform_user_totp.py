"""Add TOTP 2FA fields to platform_users table

Revision ID: pl0totp000001
Revises: 2fa0stk000001
"""
import sqlalchemy as sa
from alembic import op

revision = "pl0totp000001"
down_revision = "2fa0stk000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("platform_users", sa.Column("totp_secret", sa.String(64)))
    op.add_column("platform_users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("platform_users", "totp_enabled")
    op.drop_column("platform_users", "totp_secret")
