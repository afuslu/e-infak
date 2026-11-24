"""Optional backup password (encrypted until the ZIP is built) and sent closing reminders.

Revision ID: off0brd000002
Revises: off0brd000001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "off0brd000002"
down_revision = "off0brd000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("data_exports", sa.Column("password_enc", sa.Text))
    op.add_column("data_exports", sa.Column("encrypted", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("organization_offboardings", sa.Column("reminders_sent", JSONB, nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("organization_offboardings", "reminders_sent")
    op.drop_column("data_exports", "encrypted")
    op.drop_column("data_exports", "password_enc")
