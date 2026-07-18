"""full automation security, outbox and reconciliation foundation

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'EDITOR'")
    for value in ("PARTIALLY_REFUNDED", "CHARGEBACK", "REVIEW"):
        op.execute(f"ALTER TYPE paymentorderstatus ADD VALUE IF NOT EXISTS '{value}'")
    op.execute("""
        CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_logs are append-only';
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER audit_logs_append_only
        BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation()
    """)

    op.add_column("organizations", sa.Column("payment_secret_ref", sa.String(255)))
    for column in ("vpos_merchant_id", "vpos_terminal_id", "vpos_password"):
        op.drop_column("organizations", column)

    op.alter_column("donors", "allow_email", server_default=sa.false())
    op.alter_column("donors", "allow_sms", server_default=sa.false())

    op.add_column("payment_orders", sa.Column("locale", sa.String(5), nullable=False, server_default="tr"))
    op.add_column("payment_orders", sa.Column("refunded_cents", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("payment_orders", sa.Column("query_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("payment_orders", sa.Column("query_next_at", sa.DateTime(timezone=True)))
    op.create_index("ix_payment_orders_query_next_at", "payment_orders", ["query_next_at"])
    op.add_column("campaigns", sa.Column("translations", postgresql.JSONB(), nullable=False, server_default="{}"))
    op.add_column("campaigns", sa.Column("checkout_fields_schema", postgresql.JSONB(), nullable=False, server_default="[]"))

    op.add_column("api_keys", sa.Column("scopes", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.add_column("api_keys", sa.Column("expires_at", sa.DateTime(timezone=True)))
    op.add_column("api_keys", sa.Column("last_used_at", sa.DateTime(timezone=True)))

    op.add_column("webhook_settings", sa.Column("secret_ref", sa.String(255)))
    op.add_column("webhook_settings", sa.Column("subscribed_events", sa.String(1000), nullable=False, server_default="donation.paid"))
    op.add_column("webhook_settings", sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="8"))
    op.execute("UPDATE webhook_settings SET secret_ref = 'env:EINFAK_WEBHOOK_' || replace(id::text, '-', '_')")
    op.alter_column("webhook_settings", "secret_ref", nullable=False)
    op.drop_column("webhook_settings", "secret_token")

    outbox_status = postgresql.ENUM("PENDING", "PROCESSING", "DELIVERED", "FAILED", name="outboxstatus", create_type=False)
    reconciliation_status = postgresql.ENUM("UNMATCHED", "MATCHED", "AMBIGUOUS", "IGNORED", name="reconciliationstatus", create_type=False)
    outbox_status.create(op.get_bind(), checkfirst=True)
    reconciliation_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "outbox_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("aggregate_type", sa.String(64), nullable=False),
        sa.Column("aggregate_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("status", outbox_status, nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("processing_started_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("event_type", "aggregate_id", name="uq_outbox_event_aggregate"),
    )
    op.create_index("ix_outbox_events_org", "outbox_events", ["organization_id"])
    op.create_index("ix_outbox_events_status_next", "outbox_events", ["status", "next_attempt_at"])

    op.create_table(
        "consent_records",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("donor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("donors.id"), nullable=False),
        sa.Column("consent_type", sa.String(32), nullable=False),
        sa.Column("granted", sa.Boolean(), nullable=False),
        sa.Column("document_version", sa.String(32), nullable=False),
        sa.Column("locale", sa.String(5), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("ip_address", sa.String(50)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_consent_records_org_donor", "consent_records", ["organization_id", "donor_id"])

    op.create_table(
        "bank_statement_imports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("file_hash", sa.String(64), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("imported_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "file_hash", name="uq_bank_import_org_hash"),
    )
    op.create_index("ix_bank_statement_imports_org", "bank_statement_imports", ["organization_id"])

    op.create_table(
        "bank_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("import_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bank_statement_imports.id"), nullable=False),
        sa.Column("external_id", sa.String(128), nullable=False),
        sa.Column("booked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("sender_name", sa.String(255)),
        sa.Column("description", sa.Text()),
        sa.Column("status", reconciliation_status, nullable=False),
        sa.Column("payment_order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payment_orders.id")),
        sa.Column("matched_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("matched_at", sa.DateTime(timezone=True)),
        sa.Column("raw_data", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "external_id", name="uq_bank_transaction_org_external"),
    )
    op.create_index("ix_bank_transactions_org_status", "bank_transactions", ["organization_id", "status"])

    op.create_table(
        "payment_refunds",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("payment_order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payment_orders.id"), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("provider_transaction_id", sa.String(128)),
        sa.Column("failure_message", sa.Text()),
        sa.Column("requested_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_payment_refunds_org_order", "payment_refunds", ["organization_id", "payment_order_id"])


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS prevent_audit_log_mutation")
    op.drop_table("payment_refunds")
    op.drop_table("bank_transactions")
    op.drop_table("bank_statement_imports")
    op.drop_table("consent_records")
    op.drop_table("outbox_events")
    op.add_column("webhook_settings", sa.Column("secret_token", sa.String(100)))
    op.execute("UPDATE webhook_settings SET secret_token = 'ROTATE_REQUIRED'")
    op.alter_column("webhook_settings", "secret_token", nullable=False)
    op.drop_column("webhook_settings", "max_attempts")
    op.drop_column("webhook_settings", "subscribed_events")
    op.drop_column("webhook_settings", "secret_ref")
    op.drop_column("api_keys", "last_used_at")
    op.drop_column("api_keys", "expires_at")
    op.drop_column("api_keys", "scopes")
    op.drop_column("payment_orders", "refunded_cents")
    op.drop_index("ix_payment_orders_query_next_at", table_name="payment_orders")
    op.drop_column("payment_orders", "query_next_at")
    op.drop_column("payment_orders", "query_attempts")
    op.drop_column("payment_orders", "locale")
    op.drop_column("campaigns", "checkout_fields_schema")
    op.drop_column("campaigns", "translations")
    op.add_column("organizations", sa.Column("vpos_merchant_id", sa.String(100)))
    op.add_column("organizations", sa.Column("vpos_terminal_id", sa.String(100)))
    op.add_column("organizations", sa.Column("vpos_password", sa.String(255)))
    op.drop_column("organizations", "payment_secret_ref")
