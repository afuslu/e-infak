"""Campaign types and STK PRO campaign fields; campaign tabs ("Kampanya Sekmeler")

Revision ID: cmp0stk000001
Revises: dnr0stk000001
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID

revision = "cmp0stk000001"
down_revision = "dnr0stk000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "campaign_tabs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                  nullable=False, index=True),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("campaign_tabs.id", ondelete="SET NULL"), index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(140), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("show_on_open", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("translations", JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "slug", name="uq_campaign_tab_org_slug"),
    )
    cols = [
        sa.Column("campaign_type", sa.String(20), nullable=False, server_default="standard"),
        sa.Column("display_name", sa.String(300)),
        sa.Column("country", sa.String(100)),
        sa.Column("reference_amounts", JSONB, nullable=False, server_default="{}"),
        sa.Column("fixed_amount", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("quantity_multiplier", sa.Integer),
        sa.Column("declaration_item", sa.String(120)),
        sa.Column("groups", ARRAY(sa.String), nullable=False, server_default="{}"),
        sa.Column("is_zakat", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("show_on_site", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("tab_id", UUID(as_uuid=True), sa.ForeignKey("campaign_tabs.id", ondelete="SET NULL"), index=True),
        sa.Column("redirect_mode", sa.String(8), nullable=False, server_default="own"),
        sa.Column("redirect_target", sa.String(500)),
        sa.Column("seo_title", sa.String(200)),
        sa.Column("seo_description", sa.String(400)),
        sa.Column("type_details", JSONB, nullable=False, server_default="{}"),
    ]
    for col in cols:
        op.add_column("campaigns", col)
    # Existing campaigns: kurban / su / zekat categories map to the STK PRO types and flags.
    op.execute("UPDATE campaigns SET campaign_type = 'kurban' WHERE category = 'KURBAN'")
    op.execute("UPDATE campaigns SET campaign_type = 'water_well' WHERE category = 'SU'")
    op.execute("UPDATE campaigns SET is_zakat = true WHERE category = 'ZEKAT'")


def downgrade() -> None:
    for name in ("type_details", "seo_description", "seo_title", "redirect_target", "redirect_mode", "tab_id",
                 "show_on_site", "is_zakat", "groups", "declaration_item", "quantity_multiplier", "fixed_amount",
                 "reference_amounts", "country", "display_name", "campaign_type"):
        op.drop_column("campaigns", name)
    op.drop_table("campaign_tabs")
