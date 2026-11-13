"""SMS templates can belong to a campaign (donation item).

Revision ID: sm5q00000003
Revises: sm5q00000002
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "sm5q00000003"
down_revision = "sm5q00000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sms_templates", sa.Column(
        "campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="SET NULL")))
    op.create_unique_constraint("uq_sms_template_org_campaign", "sms_templates", ["organization_id", "campaign_id"])


def downgrade() -> None:
    op.drop_constraint("uq_sms_template_org_campaign", "sms_templates", type_="unique")
    op.drop_column("sms_templates", "campaign_id")
