"""Modern tasks features: recurrence and comments.

Revision ID: tk0m00000001
Revises: sm5q00000005
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "tk0m00000001"
down_revision = "sm5q00000005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("recurrence", sa.String(16), nullable=False, server_default="none"))
    op.add_column("tasks", sa.Column("comments", JSONB(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("tasks", "comments")
    op.drop_column("tasks", "recurrence")
