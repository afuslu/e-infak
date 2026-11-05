"""Site builder: block content, drafts and published revisions for pages.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b9c0d1e2f3a4"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("site_pages", sa.Column("kind", sa.String(16), nullable=False, server_default="page"))
    op.add_column("site_pages", sa.Column("blocks", postgresql.JSONB()))
    op.add_column("site_pages", sa.Column("draft_blocks", postgresql.JSONB()))
    op.add_column("site_pages", sa.Column("version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("site_pages", sa.Column("draft_updated_at", sa.DateTime(timezone=True)))
    op.add_column("site_pages", sa.Column("draft_updated_by", sa.String(255)))
    op.add_column("site_pages", sa.Column("published_at", sa.DateTime(timezone=True)))
    op.add_column("site_pages", sa.Column("published_by", sa.String(255)))
    op.create_table(
        "site_page_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("page_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("site_pages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("blocks", postgresql.JSONB(), nullable=False),
        sa.Column("note", sa.String(200)),
        sa.Column("created_by", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for column in ("page_id", "organization_id", "created_at"):
        op.create_index(f"ix_site_page_revisions_{column}", "site_page_revisions", [column])
    # Pages without blocks keep rendering their title + text; nothing is converted here,
    # the editor converts a page when it is first opened.


def downgrade() -> None:
    op.drop_table("site_page_revisions")
    for column in ("published_by", "published_at", "draft_updated_by", "draft_updated_at", "version",
                   "draft_blocks", "blocks", "kind"):
        op.drop_column("site_pages", column)
