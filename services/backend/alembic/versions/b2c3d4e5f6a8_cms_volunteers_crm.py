"""Site CMS (pages, menu, gallery, rich posts), volunteers, donor reps, gift donations

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b2c3d4e5f6a8"
down_revision = "a1b2c3d4e5f7"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _base(name):
    return [
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "site_pages", *_base("site_pages"),
        sa.Column("slug", sa.String(160), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("cover_image_url", sa.String(500)),
        sa.Column("seo_title", sa.String(160)),
        sa.Column("seo_description", sa.String(320)),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "slug", name="uq_site_page_org_slug"),
    )
    op.create_index("ix_site_pages_organization_id", "site_pages", ["organization_id"])

    op.create_table(
        "site_menu_items", *_base("site_menu_items"),
        sa.Column("location", sa.String(16), nullable=False, server_default="header"),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("open_in_new_tab", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_site_menu_items_organization_id", "site_menu_items", ["organization_id"])

    op.create_table(
        "gallery_items", *_base("gallery_items"),
        sa.Column("kind", sa.String(8), nullable=False, server_default="photo"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("album", sa.String(120)),
        sa.Column("image_url", sa.String(500)),
        sa.Column("video_provider", sa.String(16)),
        sa.Column("video_id", sa.String(64)),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_gallery_items_organization_id", "gallery_items", ["organization_id"])

    op.create_table(
        "volunteer_applications", *_base("volunteer_applications"),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(32), nullable=False),
        sa.Column("email", sa.String(255)),
        sa.Column("city", sa.String(100)),
        sa.Column("areas", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("availability", sa.String(200)),
        sa.Column("message", sa.Text()),
        sa.Column("status", sa.String(16), nullable=False, server_default="new"),
        sa.Column("staff_notes", sa.Text()),
        sa.Column("consent_version", sa.String(32), nullable=False),
        sa.Column("ip_address", sa.String(50)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_volunteer_applications_organization_id", "volunteer_applications", ["organization_id"])
    op.create_index("ix_volunteer_applications_status", "volunteer_applications", ["status"])

    op.add_column("content_posts", sa.Column("kind", sa.String(16), nullable=False, server_default="haber"))
    op.add_column("content_posts", sa.Column("slug", sa.String(160)))
    op.add_column("content_posts", sa.Column("summary", sa.String(500)))
    op.add_column("content_posts", sa.Column("body", sa.Text()))
    op.add_column("content_posts", sa.Column("gallery_urls", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.add_column("content_posts", sa.Column("video_provider", sa.String(16)))
    op.add_column("content_posts", sa.Column("video_id", sa.String(64)))
    op.add_column("content_posts", sa.Column("seo_title", sa.String(160)))
    op.add_column("content_posts", sa.Column("seo_description", sa.String(320)))
    op.create_index("ix_content_posts_kind", "content_posts", ["kind"])
    op.create_index(
        "uq_content_posts_org_slug", "content_posts", ["organization_id", "slug"],
        unique=True, postgresql_where=sa.text("slug IS NOT NULL"),
    )

    for name, type_ in (
        ("whatsapp_number", sa.String(20)), ("whatsapp_message", sa.String(300)),
        ("live_chat_provider", sa.String(16)), ("live_chat_id", sa.String(80)),
        ("seo_title", sa.String(160)), ("seo_description", sa.String(320)), ("seo_keywords", sa.String(300)),
    ):
        op.add_column("organization_settings", sa.Column(name, type_))

    op.add_column("donors", sa.Column("assigned_user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")))
    op.create_index("ix_donors_assigned_user_id", "donors", ["assigned_user_id"])
    op.add_column("donations", sa.Column("on_behalf_of", sa.String(200)))


def downgrade() -> None:
    op.drop_column("donations", "on_behalf_of")
    op.drop_index("ix_donors_assigned_user_id", table_name="donors")
    op.drop_column("donors", "assigned_user_id")
    for name in ("seo_keywords", "seo_description", "seo_title", "live_chat_id", "live_chat_provider",
                 "whatsapp_message", "whatsapp_number"):
        op.drop_column("organization_settings", name)
    op.drop_index("uq_content_posts_org_slug", table_name="content_posts")
    op.drop_index("ix_content_posts_kind", table_name="content_posts")
    for name in ("seo_description", "seo_title", "video_id", "video_provider", "gallery_urls", "body",
                 "summary", "slug", "kind"):
        op.drop_column("content_posts", name)
    for table in ("volunteer_applications", "gallery_items", "site_menu_items", "site_pages"):
        op.drop_table(table)
