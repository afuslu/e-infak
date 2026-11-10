"""Bank account sync (API pulled movements, matcher memory) and donor external reference for migrations.

Revision ID: b4nk5ync0001
Revises: c6d7e8f9a0b1
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b4nk5ync0001"
down_revision = "c6d7e8f9a0b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("donors", sa.Column("external_ref", sa.String(64)))
    op.create_unique_constraint("uq_donor_org_external_ref", "donors", ["organization_id", "external_ref"])

    op.create_table(
        "bank_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("bank_key", sa.String(32), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("iban", sa.String(34)),
        sa.Column("account_no", sa.String(40)),
        sa.Column("currency", sa.String(3), nullable=False, server_default="TRY"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("auto_approve", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("default_campaign_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("campaigns.id", ondelete="SET NULL")),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "bank_key", "iban", name="uq_bank_account_org_bank_iban"),
    )
    op.create_table(
        "bank_match_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("pattern", sa.String(255), nullable=False),
        sa.Column("donor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("donors.id", ondelete="CASCADE")),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id", ondelete="CASCADE")),
        sa.Column("hits", sa.Integer, nullable=False, server_default="0"),
        sa.Column("source", sa.String(16), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "kind", "pattern", name="uq_bank_match_rule"),
    )

    op.alter_column("bank_transactions", "import_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column("bank_transactions", sa.Column(
        "bank_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bank_accounts.id", ondelete="SET NULL")))
    op.create_index("ix_bank_transactions_bank_account_id", "bank_transactions", ["bank_account_id"])
    op.add_column("bank_transactions", sa.Column("source", sa.String(16), nullable=False, server_default="upload"))
    op.add_column("bank_transactions", sa.Column(
        "donation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("donations.id", ondelete="SET NULL")))
    op.create_index("ix_bank_transactions_donation_id", "bank_transactions", ["donation_id"])
    op.add_column("bank_transactions", sa.Column(
        "suggestion", postgresql.JSONB, nullable=False, server_default="{}"))


def downgrade() -> None:
    op.drop_column("bank_transactions", "suggestion")
    op.drop_index("ix_bank_transactions_donation_id", "bank_transactions")
    op.drop_column("bank_transactions", "donation_id")
    op.drop_column("bank_transactions", "source")
    op.drop_index("ix_bank_transactions_bank_account_id", "bank_transactions")
    op.drop_column("bank_transactions", "bank_account_id")
    op.execute("DELETE FROM bank_transactions WHERE import_id IS NULL")
    op.alter_column("bank_transactions", "import_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_table("bank_match_rules")
    op.drop_table("bank_accounts")
    op.drop_constraint("uq_donor_org_external_ref", "donors", type_="unique")
    op.drop_column("donors", "external_ref")
