"""Orta package: kurban overhaul, beneficiaries & pledges, water well funding, kumbara, kumanya, tasks

Revision ID: c3d4e5f6a7b9
Revises: b2c3d4e5f6a8
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c3d4e5f6a7b9"
down_revision = "b2c3d4e5f6a8"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
ANIMAL_TYPE = postgresql.ENUM("COW", "SHEEP", name="kurbananimaltype", create_type=False)


def _id_org():
    return [
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False, index=True),
    ]


def _created():
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    # --- Kurban ---------------------------------------------------------------
    op.add_column("kurban_campaigns", sa.Column("donation_campaign_id", UUID, sa.ForeignKey("campaigns.id", ondelete="SET NULL"), unique=True))
    op.add_column("kurban_campaigns", sa.Column("animal_type", ANIMAL_TYPE, nullable=False, server_default="COW"))
    op.add_column("kurban_campaigns", sa.Column("country", sa.String(100)))
    op.add_column("kurban_campaigns", sa.Column("season_year", sa.Integer()))
    op.add_column("kurban_campaigns", sa.Column("animal_prefix", sa.String(10), nullable=False, server_default="K"))
    op.add_column("kurban_animals", sa.Column("country", sa.String(100)))
    op.add_column("kurban_animals", sa.Column("slaughtered_at", sa.DateTime(timezone=True)))
    op.add_column("kurban_shares", sa.Column("campaign_id", UUID, sa.ForeignKey("kurban_campaigns.id")))
    op.add_column("kurban_shares", sa.Column("donor_id", UUID, sa.ForeignKey("donors.id")))
    op.add_column("kurban_shares", sa.Column("on_behalf_of", sa.String(200)))
    op.add_column("kurban_shares", sa.Column("kurban_type", sa.String(16), nullable=False, server_default="vacip"))
    op.add_column("kurban_shares", sa.Column("notified_at", sa.DateTime(timezone=True)))
    op.alter_column("kurban_shares", "animal_id", nullable=True)
    op.alter_column("kurban_shares", "donation_id", nullable=True)
    op.alter_column("kurban_shares", "share_number", nullable=True)
    op.create_index("ix_kurban_shares_campaign_id", "kurban_shares", ["campaign_id"])
    op.create_index("ix_kurban_shares_donor_id", "kurban_shares", ["donor_id"])
    op.execute("""
        UPDATE kurban_shares s SET campaign_id = a.campaign_id
        FROM kurban_animals a WHERE s.animal_id = a.id AND s.campaign_id IS NULL
    """)
    op.execute("""
        UPDATE kurban_shares s SET donor_id = d.donor_id
        FROM donations d WHERE s.donation_id = d.id AND s.donor_id IS NULL
    """)

    # --- Campaign currency & exchange rates ---------------------------------------
    op.add_column("campaigns", sa.Column("currency", sa.String(3), nullable=False, server_default="TRY"))
    op.create_table(
        "fx_rates",
        sa.Column("currency", sa.String(3), primary_key=True),
        sa.Column("rate_try", sa.Numeric(14, 6), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- Water wells --------------------------------------------------------------
    op.alter_column("water_wells", "latitude", nullable=True)
    op.alter_column("water_wells", "longitude", nullable=True)
    op.add_column("water_wells", sa.Column("country", sa.String(100)))
    op.add_column("water_wells", sa.Column("description", sa.Text()))
    op.add_column("water_wells", sa.Column("funding_model", sa.String(16), nullable=False, server_default="standard"))
    op.add_column("water_wells", sa.Column("target_cents", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("water_wells", sa.Column("collected_cents", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("water_wells", sa.Column("share_count", sa.Integer()))
    op.add_column("water_wells", sa.Column("share_price_cents", sa.Integer()))
    op.add_column("water_wells", sa.Column("donation_campaign_id", UUID, sa.ForeignKey("campaigns.id", ondelete="SET NULL"), unique=True))

    # --- Beneficiaries & pledges ----------------------------------------------------
    op.create_table(
        "beneficiaries", *_id_org(),
        sa.Column("kind", sa.String(16), nullable=False, server_default="talebe", index=True),
        sa.Column("code", sa.String(32)),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100)),
        sa.Column("gender", sa.String(10)),
        sa.Column("birth_date", sa.Date()),
        sa.Column("country", sa.String(100)),
        sa.Column("city", sa.String(100)),
        sa.Column("school", sa.String(200)),
        sa.Column("guardian_name", sa.String(200)),
        sa.Column("guardian_phone", sa.String(32)),
        sa.Column("photo_url", sa.String(500)),
        sa.Column("description", sa.Text()),
        sa.Column("monthly_need_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(16), nullable=False, server_default="active", index=True),
        sa.Column("student_id", UUID, sa.ForeignKey("students.id", ondelete="SET NULL"), unique=True),
        sa.Column("orphan_id", UUID, sa.ForeignKey("orphans.id", ondelete="SET NULL"), unique=True),
        _created(),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "pledges", *_id_org(),
        sa.Column("kind", sa.String(16), nullable=False, server_default="sponsorship", index=True),
        sa.Column("donor_id", UUID, sa.ForeignKey("donors.id"), nullable=False, index=True),
        sa.Column("beneficiary_id", UUID, sa.ForeignKey("beneficiaries.id", ondelete="SET NULL"), index=True),
        sa.Column("water_well_id", UUID, sa.ForeignKey("water_wells.id", ondelete="SET NULL"), index=True),
        sa.Column("campaign_id", UUID, sa.ForeignKey("campaigns.id"), nullable=False, index=True),
        sa.Column("title", sa.String(300)),
        sa.Column("installment_amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="TRY"),
        sa.Column("installment_count", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active", index=True),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by_id", UUID, sa.ForeignKey("users.id")),
        _created(),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "pledge_installments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("pledge_id", UUID, sa.ForeignKey("pledges.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False, index=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending", index=True),
        sa.Column("donation_id", UUID, sa.ForeignKey("donations.id", ondelete="SET NULL"), index=True),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("pledge_id", "seq", name="uq_pledge_installment_seq"),
    )
    op.create_table(
        "water_well_shares", *_id_org(),
        sa.Column("water_well_id", UUID, sa.ForeignKey("water_wells.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("donor_id", UUID, sa.ForeignKey("donors.id"), index=True),
        sa.Column("donation_id", UUID, sa.ForeignKey("donations.id", ondelete="SET NULL"), index=True),
        sa.Column("share_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("on_behalf_of", sa.String(200)),
        _created(),
    )
    # Bring existing orphans and hafızlık students into the unified registry.
    op.execute("""
        INSERT INTO beneficiaries (id, organization_id, kind, first_name, last_name, gender, birth_date, country, city,
                                   photo_url, description, monthly_need_cents, status, orphan_id, created_at)
        SELECT gen_random_uuid(), organization_id, 'yetim', first_name, last_name, gender, birth_date, country, city,
               photo_url, description, monthly_sponsor_amount_cents, 'active', id, COALESCE(created_at, now())
        FROM orphans
    """)
    op.execute("""
        INSERT INTO beneficiaries (id, organization_id, kind, first_name, last_name, guardian_name, guardian_phone,
                                   status, student_id, created_at)
        SELECT gen_random_uuid(), organization_id, 'talebe', first_name, last_name, parent_name, parent_phone,
               CASE WHEN is_active THEN 'active' ELSE 'passive' END, id, COALESCE(created_at, now())
        FROM students
    """)

    # --- Regions, kumbara, kumanya ---------------------------------------------------
    op.create_table(
        "regions", *_id_org(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500)),
        sa.Column("responsible_user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
        sa.UniqueConstraint("organization_id", "name", name="uq_region_org_name"),
    )
    op.create_table(
        "money_boxes", *_id_org(),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("region_id", UUID, sa.ForeignKey("regions.id", ondelete="SET NULL"), index=True),
        sa.Column("location_name", sa.String(200), nullable=False),
        sa.Column("address", sa.Text()),
        sa.Column("city", sa.String(100)),
        sa.Column("district", sa.String(100)),
        sa.Column("contact_name", sa.String(200)),
        sa.Column("contact_phone", sa.String(32)),
        sa.Column("responsible_user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), index=True),
        sa.Column("campaign_id", UUID, sa.ForeignKey("campaigns.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(16), nullable=False, server_default="active", index=True),
        sa.Column("placed_at", sa.Date()),
        sa.Column("last_collected_at", sa.DateTime(timezone=True)),
        sa.Column("notes", sa.Text()),
        _created(),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "code", name="uq_money_box_org_code"),
    )
    op.create_table(
        "money_box_collections", *_id_org(),
        sa.Column("money_box_id", UUID, sa.ForeignKey("money_boxes.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="TRY"),
        sa.Column("collected_by_id", UUID, sa.ForeignKey("users.id")),
        sa.Column("donation_id", UUID, sa.ForeignKey("donations.id", ondelete="SET NULL")),
        sa.Column("notes", sa.Text()),
        _created(),
    )
    op.create_table(
        "aid_packages", *_id_org(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("contents", sa.Text()),
        sa.Column("unit_cost_cents", sa.Integer(), nullable=False),
        sa.Column("donation_campaign_id", UUID, sa.ForeignKey("campaigns.id", ondelete="SET NULL")),
        sa.Column("stock", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        _created(),
    )
    op.create_table(
        "aid_recipients", *_id_org(),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(32)),
        sa.Column("national_id", sa.String(20)),
        sa.Column("region_id", UUID, sa.ForeignKey("regions.id", ondelete="SET NULL"), index=True),
        sa.Column("address", sa.Text()),
        sa.Column("household_size", sa.Integer()),
        sa.Column("needs", sa.Text()),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        _created(),
    )
    op.create_table(
        "aid_distributions", *_id_org(),
        sa.Column("package_id", UUID, sa.ForeignKey("aid_packages.id"), nullable=False, index=True),
        sa.Column("recipient_id", UUID, sa.ForeignKey("aid_recipients.id", ondelete="SET NULL"), index=True),
        sa.Column("region_id", UUID, sa.ForeignKey("regions.id", ondelete="SET NULL"), index=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(16), nullable=False, server_default="planned"),
        sa.Column("planned_date", sa.Date()),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_by_id", UUID, sa.ForeignKey("users.id")),
        sa.Column("notes", sa.Text()),
        _created(),
    )

    # --- Tasks -------------------------------------------------------------------------
    op.create_table(
        "task_templates", *_id_org(),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("priority", sa.String(10), nullable=False, server_default="normal"),
        sa.Column("category", sa.String(60)),
        sa.Column("default_duration_days", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("checklist", postgresql.JSONB(), nullable=False, server_default="[]"),
        _created(),
    )
    op.create_table(
        "tasks", *_id_org(),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("priority", sa.String(10), nullable=False, server_default="normal", index=True),
        sa.Column("category", sa.String(60)),
        sa.Column("status", sa.String(16), nullable=False, server_default="todo", index=True),
        sa.Column("start_date", sa.Date()),
        sa.Column("due_date", sa.Date(), index=True),
        sa.Column("assigned_to_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), index=True),
        sa.Column("department_id", UUID, sa.ForeignKey("departments.id", ondelete="SET NULL"), index=True),
        sa.Column("parent_task_id", UUID, sa.ForeignKey("tasks.id", ondelete="CASCADE"), index=True),
        sa.Column("template_id", UUID, sa.ForeignKey("task_templates.id", ondelete="SET NULL")),
        sa.Column("donor_id", UUID, sa.ForeignKey("donors.id", ondelete="SET NULL")),
        sa.Column("checklist", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_by_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        _created(),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    for table in ("tasks", "task_templates", "aid_distributions", "aid_recipients", "aid_packages",
                  "money_box_collections", "money_boxes", "regions", "water_well_shares",
                  "pledge_installments", "pledges", "beneficiaries"):
        op.drop_table(table)
    for name in ("donation_campaign_id", "share_price_cents", "share_count", "collected_cents", "target_cents",
                 "funding_model", "description", "country"):
        op.drop_column("water_wells", name)
    op.drop_table("fx_rates")
    op.drop_column("campaigns", "currency")
    op.drop_index("ix_kurban_shares_donor_id", table_name="kurban_shares")
    op.drop_index("ix_kurban_shares_campaign_id", table_name="kurban_shares")
    # Shares that were never assigned cannot satisfy the old NOT NULL columns.
    op.execute("DELETE FROM kurban_shares WHERE animal_id IS NULL OR donation_id IS NULL")
    op.execute("UPDATE kurban_shares SET share_number = 1 WHERE share_number IS NULL")
    op.alter_column("kurban_shares", "share_number", nullable=False)
    op.alter_column("kurban_shares", "donation_id", nullable=False)
    op.alter_column("kurban_shares", "animal_id", nullable=False)
    for name in ("notified_at", "kurban_type", "on_behalf_of", "donor_id", "campaign_id"):
        op.drop_column("kurban_shares", name)
    op.drop_column("kurban_animals", "slaughtered_at")
    op.drop_column("kurban_animals", "country")
    for name in ("animal_prefix", "season_year", "country", "animal_type", "donation_campaign_id"):
        op.drop_column("kurban_campaigns", name)
