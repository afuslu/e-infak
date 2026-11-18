"""Force a password change after a temporary password

Revision ID: pw0chg000001
Revises: ig0inst000001
"""
import sqlalchemy as sa
from alembic import op

revision = "pw0chg000001"
down_revision = "ig0inst000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("users", "platform_users"):
        op.add_column(table, sa.Column("must_change_password", sa.Boolean(), nullable=False,
                                       server_default=sa.false()))


def downgrade() -> None:
    for table in ("users", "platform_users"):
        op.drop_column(table, "must_change_password")
