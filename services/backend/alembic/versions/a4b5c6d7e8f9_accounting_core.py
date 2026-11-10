"""Accounting core: cash/bank accounts and ledger, expense cards, counterparties, cheques, payroll.

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a4b5c6d7e8f9"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _id():
    return sa.Column("id", UUID, primary_key=True)


def _org():
    return sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False, index=True)


def _created():
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "finance_accounts", _id(), _org(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False, server_default="cash"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="TRY"),
        sa.Column("bank_name", sa.String(120)),
        sa.Column("iban", sa.String(40)),
        sa.Column("opening_balance_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("opening_date", sa.Date()),
        sa.Column("default_for", sa.String(16)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        _created(),
    )
    op.create_table(
        "counterparties", _id(), _org(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False, server_default="supplier"),
        sa.Column("tax_no", sa.String(20)),
        sa.Column("tax_office", sa.String(100)),
        sa.Column("phone", sa.String(32)),
        sa.Column("email", sa.String(255)),
        sa.Column("iban", sa.String(40)),
        sa.Column("address", sa.Text()),
        sa.Column("note", sa.Text()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        _created(),
    )
    op.create_table(
        "expense_cards", _id(), _org(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("code", sa.String(20)),
        sa.Column("group", sa.String(60)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        _created(),
        sa.UniqueConstraint("organization_id", "name", name="uq_expense_card_org_name"),
    )
    op.create_table(
        "ledger_entries", _id(), _org(),
        sa.Column("account_id", UUID, sa.ForeignKey("finance_accounts.id"), nullable=False, index=True),
        sa.Column("entry_date", sa.Date(), nullable=False, index=True),
        sa.Column("direction", sa.String(3), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(60), nullable=False, server_default="Diğer"),
        sa.Column("description", sa.String(500)),
        sa.Column("source_type", sa.String(16), nullable=False, server_default="manual"),
        sa.Column("source_id", UUID),
        sa.Column("counterparty_id", UUID, sa.ForeignKey("counterparties.id", ondelete="SET NULL"), index=True),
        sa.Column("created_by_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
    )
    op.create_index("ix_ledger_source", "ledger_entries", ["source_type", "source_id"])
    op.create_table(
        "cheques", _id(), _org(),
        sa.Column("kind", sa.String(8), nullable=False, server_default="cheque"),
        sa.Column("direction", sa.String(8), nullable=False, server_default="received"),
        sa.Column("number", sa.String(40), nullable=False),
        sa.Column("bank_name", sa.String(120)),
        sa.Column("drawer", sa.String(200)),
        sa.Column("counterparty_id", UUID, sa.ForeignKey("counterparties.id", ondelete="SET NULL"), index=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="TRY"),
        sa.Column("issue_date", sa.Date()),
        sa.Column("due_date", sa.Date(), nullable=False, index=True),
        sa.Column("status", sa.String(12), nullable=False, server_default="portfolio", index=True),
        sa.Column("account_id", UUID, sa.ForeignKey("finance_accounts.id", ondelete="SET NULL")),
        sa.Column("note", sa.Text()),
        sa.Column("history", postgresql.JSONB(), nullable=False, server_default="[]"),
        _created(),
    )
    op.create_table(
        "employees", _id(), _org(),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("title", sa.String(120)),
        sa.Column("national_id", sa.String(11)),
        sa.Column("iban", sa.String(40)),
        sa.Column("phone", sa.String(32)),
        sa.Column("monthly_salary_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("start_date", sa.Date()),
        sa.Column("end_date", sa.Date()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("note", sa.Text()),
        _created(),
    )
    op.create_table(
        "payroll_items", _id(), _org(),
        sa.Column("employee_id", UUID, sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("salary_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("overtime_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("bonus_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deduction_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("advance_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(8), nullable=False, server_default="draft"),
        sa.Column("paid_on", sa.Date()),
        sa.Column("account_id", UUID, sa.ForeignKey("finance_accounts.id", ondelete="SET NULL")),
        sa.Column("note", sa.String(300)),
        _created(),
        sa.UniqueConstraint("employee_id", "period", name="uq_payroll_employee_period"),
    )
    op.create_table(
        "salary_advances", _id(), _org(),
        sa.Column("employee_id", UUID, sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("given_on", sa.Date(), nullable=False),
        sa.Column("account_id", UUID, sa.ForeignKey("finance_accounts.id", ondelete="SET NULL")),
        sa.Column("payroll_item_id", UUID, sa.ForeignKey("payroll_items.id", ondelete="SET NULL")),
        sa.Column("note", sa.String(300)),
        _created(),
    )
    op.add_column("expenses", sa.Column("expense_card_id", UUID, sa.ForeignKey("expense_cards.id", ondelete="SET NULL")))
    op.add_column("expenses", sa.Column("currency", sa.String(3), nullable=False, server_default="TRY"))
    op.add_column("expenses", sa.Column("account_id", UUID, sa.ForeignKey("finance_accounts.id", ondelete="SET NULL")))
    op.add_column("expenses", sa.Column("counterparty_id", UUID, sa.ForeignKey("counterparties.id", ondelete="SET NULL")))
    op.add_column("expenses", sa.Column("description", sa.String(1000)))
    op.add_column("expenses", sa.Column("created_by_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")))
    for column in ("expense_card_id", "account_id", "counterparty_id"):
        op.create_index(f"ix_expenses_{column}", "expenses", [column])


def downgrade() -> None:
    for column in ("expense_card_id", "account_id", "counterparty_id"):
        op.drop_index(f"ix_expenses_{column}", table_name="expenses")
    for column in ("created_by_id", "description", "counterparty_id", "account_id", "currency", "expense_card_id"):
        op.drop_column("expenses", column)
    for table in ("salary_advances", "payroll_items", "employees", "cheques", "ledger_entries", "expense_cards",
                  "counterparties", "finance_accounts"):
        op.drop_table(table)
