"""Add platform_notes to organizations

Revision ID: pl0note000001
Revises: pl0alrt000001
"""
import sqlalchemy as sa
from alembic import op

revision = "pl0note000001"
down_revision = "pl0alrt000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("platform_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "platform_notes")
