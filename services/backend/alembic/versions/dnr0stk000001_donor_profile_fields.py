"""Donor profile fields matching STK PRO's donor form

Revision ID: dnr0stk000001
Revises: nt0stf000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "dnr0stk000001"
down_revision = "nt0stf000001"
branch_labels = None
depends_on = None

COLUMNS = [
    ("membership_type", sa.String(60)),
    ("blood_group", sa.String(8)),
    ("gender", sa.String(10)),
    ("occupation", sa.String(100)),
    ("rating", sa.String(60)),
    ("referral_source", sa.String(100)),
    ("birth_date", sa.Date()),
    ("district", sa.String(100)),
    ("neighbourhood", sa.String(150)),
    ("phone_code", sa.String(6)),
    ("phone2", sa.String(20)),
    ("phone2_code", sa.String(6)),
]


def upgrade() -> None:
    for name, type_ in COLUMNS:
        op.add_column("donors", sa.Column(name, type_))
    op.add_column("donors", sa.Column("staff_user_id", UUID(as_uuid=True),
                                      sa.ForeignKey("users.id", ondelete="SET NULL"), index=True))
    op.create_index("ix_donors_org_created", "donors", ["organization_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_donors_org_created", table_name="donors")
    op.drop_column("donors", "staff_user_id")
    for name, _ in reversed(COLUMNS):
        op.drop_column("donors", name)
