"""Organisation IP allow and block lists.

Revision ID: ip0rul000001
Revises: d3m0r3q00001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "ip0rul000001"
down_revision = "d3m0r3q00001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "org_ip_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("network", sa.String(64), nullable=False),
        sa.Column("note", sa.String(200)),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_org_ip_rules_org_kind", "org_ip_rules", ["organization_id", "kind"])


def downgrade() -> None:
    op.drop_table("org_ip_rules")
