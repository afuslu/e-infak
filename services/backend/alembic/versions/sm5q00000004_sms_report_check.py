"""When an SMS's delivery report was last asked for.

Revision ID: sm5q00000004
Revises: sm5q00000003
"""
import sqlalchemy as sa
from alembic import op

revision = "sm5q00000004"
down_revision = "sm5q00000003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sms_messages", sa.Column("report_checked_at", sa.DateTime(timezone=True)))
    op.add_column("sms_messages", sa.Column("report_checks", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("sms_messages", "report_checks")
    op.drop_column("sms_messages", "report_checked_at")
