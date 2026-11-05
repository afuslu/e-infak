"""Packages, departments, custom staff roles and receipt issuer

Revision ID: a1b2c3d4e5f7
Revises: f6a7b8c9d0e1
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a1b2c3d4e5f7"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing tenants keep every module they already use.
    op.add_column("organizations", sa.Column("plan", sa.String(20), nullable=False, server_default="ileri"))
    op.add_column("organizations", sa.Column("enabled_addons", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.add_column("organizations", sa.Column("extra_user_seats", sa.Integer(), nullable=False, server_default="0"))

    op.create_table(
        "departments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "name", name="uq_department_org_name"),
    )
    op.create_index("ix_departments_organization_id", "departments", ["organization_id"])

    op.create_table(
        "staff_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500)),
        sa.Column("permissions", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "name", name="uq_staff_role_org_name"),
    )
    op.create_index("ix_staff_roles_organization_id", "staff_roles", ["organization_id"])

    op.add_column("users", sa.Column("department_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("departments.id", ondelete="SET NULL")))
    op.add_column("users", sa.Column("staff_role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("staff_roles.id", ondelete="SET NULL")))
    op.create_index("ix_users_department_id", "users", ["department_id"])
    op.create_index("ix_users_staff_role_id", "users", ["staff_role_id"])

    op.add_column("donations", sa.Column("issued_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")))
    op.create_index("ix_donations_issued_by_id", "donations", ["issued_by_id"])


def downgrade() -> None:
    op.drop_index("ix_donations_issued_by_id", table_name="donations")
    op.drop_column("donations", "issued_by_id")
    op.drop_index("ix_users_staff_role_id", table_name="users")
    op.drop_index("ix_users_department_id", table_name="users")
    op.drop_column("users", "staff_role_id")
    op.drop_column("users", "department_id")
    op.drop_index("ix_staff_roles_organization_id", table_name="staff_roles")
    op.drop_table("staff_roles")
    op.drop_index("ix_departments_organization_id", table_name="departments")
    op.drop_table("departments")
    op.drop_column("organizations", "extra_user_seats")
    op.drop_column("organizations", "enabled_addons")
    op.drop_column("organizations", "plan")
