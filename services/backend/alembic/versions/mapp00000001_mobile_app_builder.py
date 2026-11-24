"""Mobile app builder: design, published versions and store applications.

Revision ID: mapp00000001
Revises: dopt00000001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "mapp00000001"
down_revision = "dopt00000001"
branch_labels = None
depends_on = None


def _org(**kw):
    return sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                     nullable=False, **kw)


def _created():
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "mobile_apps",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        _org(unique=True),
        sa.Column("config", JSONB), sa.Column("draft", JSONB),
        sa.Column("version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("draft_updated_at", sa.DateTime(timezone=True)), sa.Column("draft_updated_by", sa.String(255)),
        sa.Column("published_at", sa.DateTime(timezone=True)), sa.Column("published_by", sa.String(255)),
        _created(),
    )
    op.create_table(
        "mobile_app_revisions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        _org(index=True),
        sa.Column("config", JSONB, nullable=False),
        sa.Column("created_by", sa.String(255)),
        _created(),
    )
    op.create_table(
        "mobile_app_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        _org(unique=True),
        sa.Column("data", JSONB, nullable=False, server_default="{}"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft", index=True),
        sa.Column("note", sa.Text),
        sa.Column("submitted_at", sa.DateTime(timezone=True)), sa.Column("submitted_by", sa.String(255)),
        _created(),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("mobile_app_requests")
    op.drop_table("mobile_app_revisions")
    op.drop_table("mobile_apps")
