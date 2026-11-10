"""Poverty tracking: household profile, scoring and review fields; household members.

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "d1e2f3a4b5c6"
down_revision = "c0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name, column in (
        ("city", sa.String(100)), ("district", sa.String(100)), ("neighborhood", sa.String(120)), ("street", sa.String(160)),
        ("latitude", sa.Float()), ("longitude", sa.Float()),
        ("housing_status", sa.String(16)), ("heating_type", sa.String(16)),
        ("rent_cents", sa.Integer()), ("monthly_income_cents", sa.Integer()),
        ("monthly_expense_cents", sa.Integer()), ("debt_cents", sa.Integer()),
        ("degree_override", sa.String(16)), ("inspected_at", sa.DateTime(timezone=True)),
        ("inspection_note", sa.Text()), ("consent_version", sa.String(32)), ("updated_at", sa.DateTime(timezone=True)),
    ):
        op.add_column("aid_recipients", sa.Column(name, column))
    op.add_column("aid_recipients", sa.Column("poverty_reasons", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.add_column("aid_recipients", sa.Column("poverty_score", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("aid_recipients", sa.Column("review_status", sa.String(16), nullable=False, server_default="approved"))
    op.add_column("aid_recipients", sa.Column("source", sa.String(16), nullable=False, server_default="admin"))
    op.add_column("aid_recipients", sa.Column(
        "inspected_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")))
    for column in ("city", "district", "neighborhood", "poverty_score", "review_status"):
        op.create_index(f"ix_aid_recipients_{column}", "aid_recipients", [column])

    op.create_table(
        "household_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("recipient_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("aid_recipients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("relation", sa.String(16), nullable=False, server_default="other"),
        sa.Column("gender", sa.String(10)),
        sa.Column("birth_date", sa.Date()),
        sa.Column("is_disabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("has_chronic_illness", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_student", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("school", sa.String(200)),
        sa.Column("is_working", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("monthly_income_cents", sa.Integer()),
        sa.Column("clothing_size", sa.String(10)),
        sa.Column("shoe_size", sa.String(10)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_household_members_organization_id", "household_members", ["organization_id"])
    op.create_index("ix_household_members_recipient_id", "household_members", ["recipient_id"])
    op.add_column("organization_settings", sa.Column("poverty_line_cents", sa.Integer()))


def downgrade() -> None:
    op.drop_column("organization_settings", "poverty_line_cents")
    op.drop_table("household_members")
    for column in ("city", "district", "neighborhood", "poverty_score", "review_status"):
        op.drop_index(f"ix_aid_recipients_{column}", table_name="aid_recipients")
    for column in (
        "city", "district", "neighborhood", "street", "latitude", "longitude", "housing_status", "heating_type",
        "rent_cents", "monthly_income_cents", "monthly_expense_cents", "debt_cents", "poverty_reasons", "poverty_score",
        "degree_override", "review_status", "source", "inspected_by_id", "inspected_at", "inspection_note",
        "consent_version", "updated_at",
    ):
        op.drop_column("aid_recipients", column)
