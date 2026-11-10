"""Media library: folders and image assets with generated variants.

Revision ID: m3d1a0000001
Revises: b5c6d7e8f9a0
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "m3d1a0000001"
down_revision = "b5c6d7e8f9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "media_folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "name", name="uq_media_folder_org_name"),
    )
    op.create_index("ix_media_folders_organization_id", "media_folders", ["organization_id"])
    op.create_table(
        "media_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("folder_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("media_folders.id", ondelete="SET NULL")),
        sa.Column("token", sa.String(24), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("original_file", sa.String(64)),
        sa.Column("mime", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("alt_text", sa.String(300), nullable=False, server_default=""),
        sa.Column("caption", sa.String(500), nullable=False, server_default=""),
        sa.Column("credit", sa.String(200), nullable=False, server_default=""),
        sa.Column("focal_x", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("focal_y", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("tags", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("variants", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("crop", postgresql.JSONB()),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "token", name="uq_media_asset_org_token"),
    )
    op.create_index("ix_media_assets_organization_id", "media_assets", ["organization_id"])
    op.create_index("ix_media_assets_folder_id", "media_assets", ["folder_id"])
    op.create_index("ix_media_assets_created_at", "media_assets", ["created_at"])


def downgrade() -> None:
    op.drop_table("media_assets")
    op.drop_table("media_folders")
