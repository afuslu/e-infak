"""Add operator_notes to demo_requests

Revision ID: pl0demo000001
Revises: pl0note000001
"""
import sqlalchemy as sa
from alembic import op

revision = "pl0demo000001"
down_revision = "pl0note000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("demo_requests", sa.Column("operator_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("demo_requests", "operator_notes")
