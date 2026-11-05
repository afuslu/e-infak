"""add public trust content to organization settings

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
"""

from alembic import op
import sqlalchemy as sa


revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organization_settings", sa.Column("about_text", sa.Text()))
    op.add_column("organization_settings", sa.Column("mission_text", sa.Text()))
    op.add_column("organization_settings", sa.Column("vision_text", sa.Text()))
    op.add_column("organization_settings", sa.Column("bylaws_url", sa.String(length=500)))
    op.add_column("organization_settings", sa.Column("board_url", sa.String(length=500)))
    op.add_column("organization_settings", sa.Column("audit_report_url", sa.String(length=500)))
    op.add_column("organization_settings", sa.Column("activity_report_url", sa.String(length=500)))
    op.add_column("organization_settings", sa.Column("fundraising_permit_url", sa.String(length=500)))


def downgrade():
    for column in (
        "fundraising_permit_url",
        "activity_report_url",
        "audit_report_url",
        "board_url",
        "bylaws_url",
        "vision_text",
        "mission_text",
        "about_text",
    ):
        op.drop_column("organization_settings", column)
