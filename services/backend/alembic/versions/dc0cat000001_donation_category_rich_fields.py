"""Add rich fields (image_url, donation_type, target_url, suggested_amounts_cents, translations) to donation_categories.

Revision ID: dc0cat000001
Revises: lg0idx000001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "dc0cat000001"
down_revision = "lg0idx000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("donation_categories", sa.Column("image_url", sa.String(length=500), nullable=True))
    op.add_column("donation_categories", sa.Column("donation_type", sa.String(length=40), nullable=True))
    op.add_column("donation_categories", sa.Column("target_url", sa.String(length=500), nullable=True))
    op.add_column(
        "donation_categories",
        sa.Column(
            "suggested_amounts_cents",
            postgresql.ARRAY(sa.Integer()),
            nullable=False,
            server_default="{}",
        ),
    )
    op.add_column(
        "donation_categories",
        sa.Column(
            "translations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("donation_categories", "translations")
    op.drop_column("donation_categories", "suggested_amounts_cents")
    op.drop_column("donation_categories", "target_url")
    op.drop_column("donation_categories", "donation_type")
    op.drop_column("donation_categories", "image_url")
