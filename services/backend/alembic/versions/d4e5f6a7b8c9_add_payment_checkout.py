"""add payment checkout

Revision ID: d4e5f6a7b8c9
Revises: a7b8c9d0e1f2
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    status_enum = postgresql.ENUM(
        "PENDING",
        "AWAITING_TRANSFER",
        "PROCESSING",
        "PAID",
        "FAILED",
        "CANCELLED",
        "REFUNDED",
        name="paymentorderstatus",
    )
    status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "payment_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("donor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("donors.id"), nullable=False),
        sa.Column("merchant_payment_id", sa.String(128), nullable=False, unique=True),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("payment_method", sa.String(32), nullable=False),
        sa.Column("status", status_enum, nullable=False),
        sa.Column("total_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="TRY"),
        sa.Column("transfer_reference", sa.String(64), unique=True),
        sa.Column("consent_version", sa.String(32), nullable=False, server_default="2026-07"),
        sa.Column("failure_code", sa.String(64)),
        sa.Column("failure_message", sa.Text()),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "idempotency_key", name="uq_payment_order_org_idempotency"),
    )
    for column in ("organization_id", "donor_id", "merchant_payment_id", "status", "transfer_reference"):
        op.create_index(f"ix_payment_orders_{column}", "payment_orders", [column])

    op.create_table(
        "payment_order_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payment_orders.id"), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("campaigns.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("unit_amount_cents", sa.Integer(), nullable=False),
        sa.Column("total_amount_cents", sa.Integer(), nullable=False),
        sa.Column("donor_message", sa.Text()),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_payment_order_items_order_id", "payment_order_items", ["order_id"])
    op.create_index("ix_payment_order_items_campaign_id", "payment_order_items", ["campaign_id"])

    op.create_table(
        "payment_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payment_orders.id"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False, server_default="ziraatpay"),
        sa.Column("session_token", sa.String(64), unique=True),
        sa.Column("pg_tran_id", sa.String(64)),
        sa.Column("response_code", sa.String(16)),
        sa.Column("response_message", sa.String(500)),
        sa.Column("card_last_4", sa.String(4)),
        sa.Column("card_brand", sa.String(32)),
        sa.Column("safe_response", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )
    for column in ("order_id", "session_token", "pg_tran_id"):
        op.create_index(f"ix_payment_attempts_{column}", "payment_attempts", [column])

    op.add_column("donations", sa.Column("payment_order_item_id", postgresql.UUID(as_uuid=True)))
    op.create_foreign_key(
        "fk_donations_payment_order_item",
        "donations",
        "payment_order_items",
        ["payment_order_item_id"],
        ["id"],
    )
    op.create_index(
        "ix_donations_payment_order_item_id",
        "donations",
        ["payment_order_item_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_donations_payment_order_item_id", table_name="donations")
    op.drop_constraint("fk_donations_payment_order_item", "donations", type_="foreignkey")
    op.drop_column("donations", "payment_order_item_id")
    op.drop_table("payment_attempts")
    op.drop_table("payment_order_items")
    op.drop_table("payment_orders")
    postgresql.ENUM(name="paymentorderstatus").drop(op.get_bind(), checkfirst=True)
