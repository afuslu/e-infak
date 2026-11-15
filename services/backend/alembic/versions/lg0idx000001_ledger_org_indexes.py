"""Add composite indexes on ledger_entries for fast org-scoped date & sync queries.

Revision ID: lg0idx000001
Revises: rc0rr0000001
"""
from alembic import op

revision = "lg0idx000001"
down_revision = "rc0rr0000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_ledger_org_date", "ledger_entries", ["organization_id", "entry_date"], if_not_exists=True)
    op.create_index(
        "ix_ledger_org_source",
        "ledger_entries",
        ["organization_id", "source_type", "source_id"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_ledger_org_source", table_name="ledger_entries", if_exists=True)
    op.drop_index("ix_ledger_org_date", table_name="ledger_entries", if_exists=True)
