"""Organisation legal identity, legal document links and tax-deduction flag

Revision ID: l3g4l0000001
Revises: b4nk5ync0001
"""
import sqlalchemy as sa
from alembic import op

revision = "l3g4l0000001"
down_revision = "b4nk5ync0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization_settings", sa.Column("tax_office", sa.String(120), nullable=True))
    op.add_column("organization_settings", sa.Column("registry_no", sa.String(60), nullable=True))
    for name in ("kvkk_url", "terms_url", "preinfo_url", "refund_url"):
        op.add_column("organization_settings", sa.Column(name, sa.String(500), nullable=True))
    op.add_column(
        "organization_settings",
        sa.Column("tax_deduction_eligible", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    for name in (
        "tax_deduction_eligible", "refund_url", "preinfo_url", "terms_url", "kvkk_url", "registry_no", "tax_office",
    ):
        op.drop_column("organization_settings", name)
