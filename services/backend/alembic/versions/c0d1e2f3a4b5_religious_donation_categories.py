"""Religious donation types as campaign categories (zekat, fitre, fidye, sadaka, adak, akika).

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
"""
from alembic import op

revision = "c0d1e2f3a4b5"
down_revision = "b9c0d1e2f3a4"
branch_labels = None
depends_on = None

VALUES = ("ZEKAT", "FITRE", "FIDYE", "SADAKA", "ADAK", "AKIKA")


def upgrade() -> None:
    for value in VALUES:
        op.execute(f"ALTER TYPE campaigncategory ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    # PostgreSQL enum değerleri geri alınamaz; kullanılmayan değerler zararsızdır.
    pass
