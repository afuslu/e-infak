"""Donor message opt-outs: informational messages go to everyone who has not opted out.

allow_sms / allow_email stay as the explicit permission for commercial messages.

Revision ID: optout000001
Revises: off0brd000002
Create Date: 2026-11-24 15:40:00
"""
from alembic import op
import sqlalchemy as sa


revision = "optout000001"
down_revision = "off0brd000002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in ("sms_opt_out", "email_opt_out"):
        op.add_column("donors", sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    for name in ("email_opt_out", "sms_opt_out"):
        op.drop_column("donors", name)
