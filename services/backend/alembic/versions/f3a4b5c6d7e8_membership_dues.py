"""Association membership and dues.

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f3a4b5c6d7e8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    uuid = postgresql.UUID(as_uuid=True)
    op.create_table(
        "members",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("donor_id", uuid, sa.ForeignKey("donors.id"), nullable=False),
        sa.Column("member_no", sa.String(30), nullable=False),
        sa.Column("member_type", sa.String(16), nullable=False, server_default="asil"),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("joined_on", sa.Date()),
        sa.Column("left_on", sa.Date()),
        sa.Column("dues_cents", sa.Integer()),
        sa.Column("dues_period", sa.String(8)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "member_no", name="uq_member_org_no"),
    )
    for column in ("organization_id", "donor_id", "status"):
        op.create_index(f"ix_members_{column}", "members", [column])
    op.create_table(
        "member_dues",
        sa.Column("id", uuid, primary_key=True),
        sa.Column("organization_id", uuid, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("member_id", uuid, sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
        sa.Column("donation_id", uuid, sa.ForeignKey("donations.id", ondelete="SET NULL")),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("waived_reason", sa.String(300)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("member_id", "period", name="uq_member_due_period"),
    )
    for column in ("organization_id", "member_id", "due_date", "status", "donation_id"):
        op.create_index(f"ix_member_dues_{column}", "member_dues", [column])
    op.add_column("organization_settings", sa.Column("member_dues_cents", sa.Integer()))
    op.add_column("organization_settings", sa.Column("member_dues_period", sa.String(8)))
    op.add_column("organization_settings", sa.Column(
        "member_dues_campaign_id", uuid, sa.ForeignKey("campaigns.id", ondelete="SET NULL")))


def downgrade() -> None:
    for column in ("member_dues_campaign_id", "member_dues_period", "member_dues_cents"):
        op.drop_column("organization_settings", column)
    op.drop_table("member_dues")
    op.drop_table("members")
