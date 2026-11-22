"""Staff hierarchy for tasks (STK PRO "Personel / Alt Personel Görev Atama")

Revision ID: mgr0stk000001
Revises: frm0stk000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "mgr0stk000001"
down_revision = "frm0stk000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("manager_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), index=True))


def downgrade() -> None:
    op.drop_column("users", "manager_id")
