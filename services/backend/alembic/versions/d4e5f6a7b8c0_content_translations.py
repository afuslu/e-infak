"""Website languages and content translations

Revision ID: d4e5f6a7b8c0
Revises: c3d4e5f6a7b9
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d4e5f6a7b8c0"
down_revision = "c3d4e5f6a7b9"
branch_labels = None
depends_on = None

TABLES = ("content_posts", "site_pages", "site_menu_items", "gallery_items")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("translations", postgresql.JSONB(), nullable=False, server_default="{}"))
    op.add_column("organization_settings", sa.Column("languages", postgresql.JSONB(), nullable=False, server_default='["tr"]'))


def downgrade() -> None:
    op.drop_column("organization_settings", "languages")
    for table in TABLES:
        op.drop_column(table, "translations")
