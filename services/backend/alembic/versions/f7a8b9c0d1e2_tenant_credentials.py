"""Encrypted per-organisation provider credentials.

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d1
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f7a8b9c0d1e2"
down_revision = "e5f6a7b8c9d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        sa.Column("updated_by", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "provider", name="uq_tenant_credential_provider"),
    )
    op.create_index("ix_tenant_credentials_organization_id", "tenant_credentials", ["organization_id"])


def downgrade() -> None:
    op.drop_index("ix_tenant_credentials_organization_id", table_name="tenant_credentials")
    op.drop_table("tenant_credentials")
