"""Site form builder (STK PRO Web Sitesi → Form)

Revision ID: frm0stk000001
Revises: pl0totp000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "frm0stk000001"
down_revision = "pl0totp000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "site_forms",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("slug", sa.String(160), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("fields", JSONB, nullable=False, server_default="[]"),
        sa.Column("submit_label", sa.String(60)),
        sa.Column("success_message", sa.String(400)),
        sa.Column("notify_email", sa.String(255)),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "slug", name="uq_site_form_org_slug"),
    )
    op.create_table(
        "site_form_submissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("form_id", UUID(as_uuid=True), sa.ForeignKey("site_forms.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("data", JSONB, nullable=False, server_default="{}"),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_site_form_submissions_form_created", "site_form_submissions", ["form_id", "created_at"])


def downgrade() -> None:
    op.drop_table("site_form_submissions")
    op.drop_table("site_forms")
