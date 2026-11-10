"""Receipt books (matbu makbuz koçanı) and the official paper number on donations.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "receipt_books",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("series", sa.String(20), nullable=False),
        sa.Column("start_no", sa.Integer(), nullable=False),
        sa.Column("end_no", sa.Integer(), nullable=False),
        sa.Column("next_no", sa.Integer(), nullable=False),
        sa.Column("branch", sa.String(100)),
        sa.Column("holder_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("voided", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_receipt_books_organization_id", "receipt_books", ["organization_id"])
    op.create_index("ix_receipt_books_holder_user_id", "receipt_books", ["holder_user_id"])
    op.add_column("donations", sa.Column(
        "receipt_book_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("receipt_books.id", ondelete="SET NULL")))
    op.add_column("donations", sa.Column("official_receipt_no", sa.String(40)))
    op.create_index("ix_donations_receipt_book_id", "donations", ["receipt_book_id"])
    op.create_index("uq_donations_org_official_receipt", "donations", ["organization_id", "official_receipt_no"],
                    unique=True, postgresql_where=sa.text("official_receipt_no IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("uq_donations_org_official_receipt", table_name="donations")
    op.drop_index("ix_donations_receipt_book_id", table_name="donations")
    op.drop_column("donations", "official_receipt_no")
    op.drop_column("donations", "receipt_book_id")
    op.drop_table("receipt_books")
