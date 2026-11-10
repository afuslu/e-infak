"""Stock (warehouses, items, moves incl. in-kind donations), invoices, cheque endorsement target.

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b5c6d7e8f9a0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _base():
    return [
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False, index=True),
    ]


def _created():
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.add_column("cheques", sa.Column("endorsed_to_id", UUID, sa.ForeignKey("counterparties.id", ondelete="SET NULL")))
    op.create_table(
        "warehouses", *_base(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("address", sa.String(500)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        _created(),
    )
    op.create_table(
        "stock_items", *_base(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(40)),
        sa.Column("unit", sa.String(8), nullable=False, server_default="adet"),
        sa.Column("category", sa.String(60)),
        sa.Column("min_qty", sa.Numeric(14, 3), nullable=False, server_default="0"),
        sa.Column("unit_value_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        _created(),
        sa.UniqueConstraint("organization_id", "name", name="uq_stock_item_org_name"),
    )
    op.create_table(
        "invoices", *_base(),
        sa.Column("kind", sa.String(8), nullable=False, server_default="purchase"),
        sa.Column("number", sa.String(40), nullable=False),
        sa.Column("counterparty_id", UUID, sa.ForeignKey("counterparties.id"), nullable=False, index=True),
        sa.Column("issue_date", sa.Date(), nullable=False, index=True),
        sa.Column("due_date", sa.Date()),
        sa.Column("currency", sa.String(3), nullable=False, server_default="TRY"),
        sa.Column("warehouse_id", UUID, sa.ForeignKey("warehouses.id", ondelete="SET NULL")),
        sa.Column("subtotal_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("vat_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(10), nullable=False, server_default="open"),
        sa.Column("note", sa.Text()),
        sa.Column("created_by_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
        sa.UniqueConstraint("organization_id", "kind", "counterparty_id", "number", name="uq_invoice_number"),
    )
    op.create_table(
        "invoice_lines",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("invoice_id", UUID, sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("description", sa.String(300), nullable=False),
        sa.Column("item_id", UUID, sa.ForeignKey("stock_items.id", ondelete="SET NULL")),
        sa.Column("qty", sa.Numeric(14, 3), nullable=False, server_default="1"),
        sa.Column("unit_price_cents", sa.Integer(), nullable=False),
        sa.Column("vat_rate", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("line_total_cents", sa.Integer(), nullable=False),
    )
    op.create_table(
        "stock_moves", *_base(),
        sa.Column("item_id", UUID, sa.ForeignKey("stock_items.id"), nullable=False, index=True),
        sa.Column("warehouse_id", UUID, sa.ForeignKey("warehouses.id"), nullable=False, index=True),
        sa.Column("move_date", sa.Date(), nullable=False, index=True),
        sa.Column("direction", sa.String(3), nullable=False),
        sa.Column("qty", sa.Numeric(14, 3), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False, server_default="adjust"),
        sa.Column("unit_value_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("counterparty_id", UUID, sa.ForeignKey("counterparties.id", ondelete="SET NULL"), index=True),
        sa.Column("donor_id", UUID, sa.ForeignKey("donors.id", ondelete="SET NULL"), index=True),
        sa.Column("aid_recipient_id", UUID, sa.ForeignKey("aid_recipients.id", ondelete="SET NULL"), index=True),
        sa.Column("invoice_id", UUID, sa.ForeignKey("invoices.id", ondelete="CASCADE"), index=True),
        sa.Column("group_id", UUID, index=True),
        sa.Column("note", sa.String(500)),
        sa.Column("created_by_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
    )


def downgrade() -> None:
    for table in ("stock_moves", "invoice_lines", "invoices", "stock_items", "warehouses"):
        op.drop_table(table)
    op.drop_column("cheques", "endorsed_to_id")
