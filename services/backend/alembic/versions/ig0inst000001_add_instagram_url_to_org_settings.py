"""Add instagram_url to organization_settings

Revision ID: ig0inst000001
Revises: kb0kurban0001
"""
import sqlalchemy as sa
from alembic import op

revision = "ig0inst000001"
down_revision = "kb0kurban0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization_settings", sa.Column("instagram_url", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("organization_settings", "instagram_url")
