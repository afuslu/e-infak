"""Donation videos stored on our server and their per-donor view log

Revision ID: ch4n00000002
Revises: ch4n00000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "ch4n00000002"
down_revision = "ch4n00000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "donation_videos",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("file_name", sa.String(80), nullable=False),
        sa.Column("content_type", sa.String(60), nullable=False),
        sa.Column("size_bytes", sa.Integer, nullable=False),
        sa.Column("received_bytes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("status", sa.String(10), nullable=False, server_default="uploading"),
        sa.Column("title", sa.String(200)),
        sa.Column("kurban_animal_id", UUID(as_uuid=True), sa.ForeignKey("kurban_animals.id", ondelete="SET NULL"),
                  index=True),
        sa.Column("donation_id", UUID(as_uuid=True), sa.ForeignKey("donations.id", ondelete="SET NULL"), index=True),
        sa.Column("campaign_id", UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="SET NULL"), index=True),
        sa.Column("uploaded_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "video_views",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("video_id", UUID(as_uuid=True), sa.ForeignKey("donation_videos.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("donor_id", UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="CASCADE")),
        sa.Column("view_count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("first_viewed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("video_id", "donor_id", name="uq_video_view_video_donor"),
    )


def downgrade() -> None:
    op.drop_table("video_views")
    op.drop_table("donation_videos")
