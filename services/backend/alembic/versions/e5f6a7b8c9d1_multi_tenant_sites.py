"""Multi-tenant websites: subdomains, custom domains, shared-theme site settings

Revision ID: e5f6a7b8c9d1
Revises: d4e5f6a7b8c0
"""
import json
import re
import secrets

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e5f6a7b8c9d1"
down_revision = "d4e5f6a7b8c0"
branch_labels = None
depends_on = None

# Texts that were hard-coded in HicretHome.tsx / KardeslikHome.tsx until now.
EXISTING_SITES = {
    "hicret-dernegi": {
        "template": "klasik",
        "tagline": "Eskişehir",
        "primary": "#1E7A34",
        "accent": "#6CB33F",
        "logo": "/images/hicret/logo.jpeg",
        "site": {
            "hero": {
                "badge": "İLİMLE YETİŞEN NESİLLER",
                "title": "Hafızlıktan Arapça'ya, gönül eğitiminin adresi.",
                "subtitle": "Kurum tarafından yayınlanan doğrulanmış yardım kampanyalarını inceleyin; seçtiğiniz projeye banka sayfasında güvenle destek olun.",
                "image_url": "/images/hicret/hicret-hero.png",
                "cta_label": "Bağış Yap",
            },
            "home_sections": ["stats", "campaigns", "zakat", "news", "trust"],
            "cta_band": {},
            "footer_text": "Eskişehir merkezli, yurt içi ve yurt dışında insani yardım çalışmaları yürüten dernek.",
            "social_links": {},
            "show_in_directory": True,
            "translations": {},
        },
    },
    "kardeslik-payi": {
        "template": "kategori",
        "tagline": "Birlikte daha güçlüyüz",
        "primary": "#C2181B",
        "accent": "#E2423C",
        "logo": "/images/kardeslik/logo.jpeg",
        "site": {
            "hero": {
                "badge": "KOMŞUDAN BAŞLAYAN İYİLİK",
                "title": "Bu topraklarda kimse yalnız kalmasın.",
                "subtitle": "Kurum tarafından yayınlanan doğrulanmış yardım kampanyalarını inceleyin; seçtiğiniz projeye güvenli biçimde destek olun.",
                "image_url": "/images/kardeslik/kp-hero.png",
                "cta_label": "Kardeşlik Payı Ver",
            },
            "home_sections": ["stats", "categories", "campaigns", "cta", "news", "zakat", "trust"],
            "cta_band": {
                "title": "Askıda Kardeşlik Payı",
                "text": "Banka tokenlı tahsilat yetkisi açılana kadar aylık güvenli ödeme bağlantısı ile desteğinizi sürdürebilirsiniz.",
                "button_label": "Aylık Ödeme Bağlantısı",
                "button_url": "/kampanyalar",
            },
            "footer_text": "Doğrulanmış kampanyaları ve kurum bilgilerini yayınlayan yardımlaşma derneği.",
            "social_links": {},
            "show_in_directory": True,
            "translations": {},
        },
    },
}

_LABEL = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")


def upgrade() -> None:
    op.add_column("organizations", sa.Column("subdomain", sa.String(63)))
    op.create_index("ix_organizations_subdomain", "organizations", ["subdomain"], unique=True)
    op.add_column("organizations", sa.Column("template", sa.String(16), nullable=False, server_default="klasik"))
    op.add_column("organizations", sa.Column("tagline", sa.String(120)))
    op.add_column("organizations", sa.Column("favicon_url", sa.String(500)))
    op.add_column("organizations", sa.Column("site", postgresql.JSONB(), nullable=False, server_default="{}"))

    op.create_table(
        "organization_domains",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("domain", sa.String(253), nullable=False, unique=True, index=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending", index=True),
        sa.Column("verification_token", sa.String(64), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("verified_at", sa.DateTime(timezone=True)),
        sa.Column("last_check_error", sa.String(300)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    conn = op.get_bind()
    orgs = conn.execute(sa.text("SELECT id, slug, primary_domain FROM organizations")).fetchall()
    for org_id, slug, primary_domain in orgs:
        if _LABEL.fullmatch(slug or ""):
            conn.execute(sa.text("UPDATE organizations SET subdomain = :s WHERE id = :id"), {"s": slug, "id": org_id})
        domain = (primary_domain or "").strip().lower()
        # Existing production domains were already served; keep them active.
        if domain and "." in domain and not domain.endswith((".e-infak.org", ".example.com", ".test", ".local")):
            conn.execute(sa.text("""
                INSERT INTO organization_domains (id, organization_id, domain, status, verification_token, is_primary, verified_at)
                VALUES (gen_random_uuid(), :org, :domain, 'active', :token, true, now())
                ON CONFLICT (domain) DO NOTHING
            """), {"org": org_id, "domain": domain, "token": secrets.token_hex(16)})
        preset = EXISTING_SITES.get(slug)
        if preset:
            conn.execute(sa.text("""
                UPDATE organizations SET template = :template, tagline = :tagline, theme_primary_color = :primary,
                    theme_accent_color = :accent, logo_url = COALESCE(:logo, logo_url), site = CAST(:site AS jsonb)
                WHERE id = :id
            """), {"template": preset["template"], "tagline": preset["tagline"], "primary": preset["primary"],
                   "accent": preset["accent"], "logo": preset["logo"], "site": json.dumps(preset["site"]), "id": org_id})


def downgrade() -> None:
    op.drop_table("organization_domains")
    op.drop_index("ix_organizations_subdomain", table_name="organizations")
    for name in ("site", "favicon_url", "tagline", "template", "subdomain"):
        op.drop_column("organizations", name)
