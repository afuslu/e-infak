"""Sequential receipt number per organisation ("Makbuz No"), continuing from STK PRO

Revision ID: rcp0stk000001
Revises: cmp0stk000001
"""
import sqlalchemy as sa
from alembic import op

revision = "rcp0stk000001"
down_revision = "cmp0stk000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("donations", sa.Column("receipt_seq", sa.Integer))
    op.create_index("ix_donations_org_receipt_seq", "donations", ["organization_id", "receipt_seq"])
    # Donations imported from STK PRO keep their "Makbuz No"; new receipts continue after the largest one.
    op.execute(
        "UPDATE donations SET receipt_seq = (payment_details->>'stkpro_makbuz_no')::int "
        "WHERE payment_details->>'stkpro_makbuz_no' ~ '^[0-9]{1,9}$'"
    )


def downgrade() -> None:
    op.drop_index("ix_donations_org_receipt_seq", table_name="donations")
    op.drop_column("donations", "receipt_seq")
