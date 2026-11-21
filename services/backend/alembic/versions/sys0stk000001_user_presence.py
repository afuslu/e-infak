"""Where staff are in the panel right now (STK PRO "Aktif Oturumlar")

Revision ID: sys0stk000001
Revises: mlg0stk000001
"""
import sqlalchemy as sa
from alembic import op

revision = "sys0stk000001"
down_revision = "mlg0stk000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_seen_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("last_seen_path", sa.String(200)))
    op.add_column("users", sa.Column("last_seen_ip", sa.String(64)))


def downgrade() -> None:
    op.drop_column("users", "last_seen_ip")
    op.drop_column("users", "last_seen_path")
    op.drop_column("users", "last_seen_at")
