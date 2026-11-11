"""Public website configuration of an organisation (shared theme, per-tenant data).

The website has one design with a few home page templates. Everything that
differs between organisations — name, logo, colours, template, hero, section
order, footer — is data stored on `Organization` and served by /public/site.
"""
import re
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.utils.cms import validate_image_url, validate_link
from app.utils.content import sanitize_public_text
from app.utils.i18n import clean_translations, localize

TEMPLATES = {
    "klasik": "Klasik — tam ekran slider ve altında hızlı bağış formu",
    "kategori": "Kategori — ortalanmış slider, bağış kategorileri ve renkli bantlar",
    "sade": "Sade — ferah, bölünmüş slider ve kampanya odaklı düzen",
}

SECTION_LABELS = {
    "stats": "İstatistikler",
    "categories": "Bağış kategorileri",
    "campaigns": "Kampanyalar",
    "zakat": "Zekat bandı / hesaplayıcı",
    "cta": "Çağrı bandı (ör. Askıda bağış)",
    "news": "Haberler & faaliyetler",
    "trust": "Güven ve iletişim bandı",
    "featured": "Öne çıkan kampanya (acil yardım vitrini)",
    "steps": "Nasıl bağış yapılır? (adımlar)",
    "gallery": "Galeri şeridi",
    "testimonials": "Teşekkür / referans mesajları",
}

DEFAULT_SECTIONS = {
    "klasik": ["stats", "campaigns", "featured", "steps", "news", "zakat", "gallery", "testimonials", "cta", "trust"],
    "kategori": ["categories", "stats", "campaigns", "featured", "cta", "steps", "news", "gallery", "testimonials", "zakat", "trust"],
    "sade": ["campaigns", "featured", "stats", "steps", "news", "gallery", "testimonials", "cta", "trust"],
}

# Section lists that used to be the defaults. A stored list equal to one of these was never
# customised, so it is read as today's default and such sites get the new sections too.
LEGACY_DEFAULT_SECTIONS = {
    "klasik": [["stats", "campaigns", "zakat", "news", "trust"]],
    "kategori": [["stats", "categories", "campaigns", "cta", "news", "zakat", "trust"]],
    "sade": [["campaigns", "news", "trust"]],
}

SITE_KEYS_KEPT = ("redirects",)

SOCIAL_NETWORKS = ("facebook", "instagram", "x", "youtube", "linkedin", "telegram")

# Flat keys of translatable site texts
SITE_I18N = (
    "tagline", "hero_badge", "hero_title", "hero_subtitle", "hero_cta_label",
    "cta_title", "cta_text", "cta_button_label", "footer_text",
)

_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

# Fonts self-hosted by the web app (next/font); keys must match apps/web/lib/site-fonts.ts.
FONTS = {
    "public-sans": "Public Sans", "inter": "Inter", "poppins": "Poppins", "montserrat": "Montserrat",
    "nunito": "Nunito", "open-sans": "Open Sans", "lora": "Lora", "merriweather": "Merriweather",
    "playfair": "Playfair Display", "roboto-slab": "Roboto Slab", "cairo": "Cairo", "amiri": "Amiri", "outfit": "Outfit",
}
RADII = ("none", "small", "medium", "large", "pill")
CONTAINERS = {"narrow": 1080, "normal": 1200, "wide": 1320, "full": 1440}
DEFAULT_DESIGN = {
    "body_font": "public-sans", "heading_font": "lora", "radius": "medium", "container": "normal",
    "page_color": "#FAFAF9", "text_color": "#111827", "heading_weight": "700", "heading_case": "normal",
}

# Ready-made looks: colours + design tokens applied together from the admin page.
THEME_KITS = [
    {"key": "klasik-yesil", "label": "Klasik Yeşil", "primary_color": "#0E7A5F", "accent_color": "#2FA884", "design": DEFAULT_DESIGN},
    {"key": "modern-lacivert", "label": "Modern Lacivert", "primary_color": "#1E3A8A", "accent_color": "#F59E0B",
     "design": {**DEFAULT_DESIGN, "body_font": "inter", "heading_font": "poppins", "radius": "large", "page_color": "#F8FAFC", "text_color": "#0F172A", "heading_weight": "800"}},
    {"key": "sicak-toprak", "label": "Sıcak Toprak", "primary_color": "#9A3412", "accent_color": "#D97706",
     "design": {**DEFAULT_DESIGN, "body_font": "nunito", "heading_font": "merriweather", "radius": "small", "page_color": "#FFFBF5", "text_color": "#292524"}},
    {"key": "zarif-bordo", "label": "Zarif Bordo", "primary_color": "#7F1D1D", "accent_color": "#B45309",
     "design": {**DEFAULT_DESIGN, "body_font": "open-sans", "heading_font": "playfair", "radius": "none", "container": "wide", "page_color": "#FFFFFF", "text_color": "#1C1917"}},
    {"key": "ferah-turkuaz", "label": "Ferah Turkuaz", "primary_color": "#0F766E", "accent_color": "#0EA5E9",
     "design": {**DEFAULT_DESIGN, "body_font": "montserrat", "heading_font": "montserrat", "radius": "pill", "page_color": "#F0FDFA", "text_color": "#134E4A", "heading_weight": "800", "heading_case": "uppercase"}},
    {"key": "gece-mavisi", "label": "Gece Mavisi", "primary_color": "#312E81", "accent_color": "#10B981",
     "design": {**DEFAULT_DESIGN, "body_font": "inter", "heading_font": "roboto-slab", "radius": "medium", "container": "wide", "page_color": "#F5F5F4", "text_color": "#1E1B4B"}},
    {"key": "arabi-altin", "label": "Arabî Altın", "primary_color": "#14532D", "accent_color": "#CA8A04",
     "design": {**DEFAULT_DESIGN, "body_font": "cairo", "heading_font": "amiri", "radius": "medium", "page_color": "#FEFCE8", "text_color": "#1A2E05"}},
    # Deep green + red accents, geometric sans, pill buttons (made for HAKDER's move from STK PRO).
    {"key": "hakder", "label": "Hayır Kapısı (yeşil)", "primary_color": "#136938", "accent_color": "#DC3545",
     "design": {**DEFAULT_DESIGN, "body_font": "outfit", "heading_font": "outfit", "radius": "pill", "container": "wide", "page_color": "#FFFFFF", "text_color": "#0B0B0C", "heading_weight": "700"}},
    # Hicret Derneği: deep emerald + warm antique brass-gold, Lora serif headings & Inter body.
    {"key": "hicret-vakif", "label": "Hicret Vakıf (zümrüt & altın)", "primary_color": "#0E7A5F", "accent_color": "#B47B1E",
     "design": {**DEFAULT_DESIGN, "body_font": "inter", "heading_font": "lora", "radius": "large", "container": "wide", "page_color": "#FBFAF6", "text_color": "#162923", "heading_weight": "700"}},
]


def _clean(value: Any, limit: int) -> Optional[str]:
    if value is None or not str(value).strip():
        return None
    return (sanitize_public_text(str(value)) or "").replace("\n", " ")[:limit] or None


class Hero(BaseModel):
    badge: Optional[str] = None
    title: Optional[str] = None
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    cta_label: Optional[str] = None
    cta_url: Optional[str] = None
    # Add slides for active campaigns (cover image, progress, donate button) after the cover
    slider: bool = True

    @field_validator("badge", "cta_label", mode="before")
    @classmethod
    def short(cls, v):
        return _clean(v, 60)

    @field_validator("title", mode="before")
    @classmethod
    def title_text(cls, v):
        return _clean(v, 140)

    @field_validator("subtitle", mode="before")
    @classmethod
    def subtitle_text(cls, v):
        return _clean(v, 400)

    @field_validator("image_url", mode="before")
    @classmethod
    def image(cls, v):
        return validate_image_url(v)

    @field_validator("cta_url", mode="before")
    @classmethod
    def link(cls, v):
        return validate_link(v) if v and str(v).strip() else None


class CtaBand(BaseModel):
    title: Optional[str] = None
    text: Optional[str] = None
    button_label: Optional[str] = None
    button_url: Optional[str] = None

    @field_validator("title", "button_label", mode="before")
    @classmethod
    def short(cls, v):
        return _clean(v, 80)

    @field_validator("text", mode="before")
    @classmethod
    def body(cls, v):
        return _clean(v, 300)

    @field_validator("button_url", mode="before")
    @classmethod
    def link(cls, v):
        return validate_link(v) if v and str(v).strip() else None


class Design(BaseModel):
    """Site-wide design tokens, rendered as CSS variables on every public page."""
    body_font: str = DEFAULT_DESIGN["body_font"]
    heading_font: str = DEFAULT_DESIGN["heading_font"]
    radius: Literal["none", "small", "medium", "large", "pill"] = "medium"
    container: Literal["narrow", "normal", "wide", "full"] = "normal"
    page_color: str = DEFAULT_DESIGN["page_color"]
    text_color: str = DEFAULT_DESIGN["text_color"]
    heading_weight: Literal["500", "600", "700", "800", "900"] = "700"
    heading_case: Literal["normal", "uppercase"] = "normal"

    @field_validator("body_font", "heading_font", mode="before")
    @classmethod
    def font(cls, v):
        if v not in FONTS:
            raise ValueError("Geçersiz yazı tipi")
        return v

    @field_validator("page_color", "text_color", mode="before")
    @classmethod
    def color(cls, v):
        text = str(v or "").strip()
        if not _HEX.fullmatch(text):
            raise ValueError("Renk #RRGGBB biçiminde olmalıdır")
        return text.upper()


def design_of(site: dict) -> dict:
    """Stored design merged over the defaults; invalid leftovers fall back to defaults."""
    stored = site.get("design") if isinstance(site.get("design"), dict) else {}
    try:
        return Design(**{**DEFAULT_DESIGN, **stored}).model_dump()
    except ValueError:
        return Design(**DEFAULT_DESIGN).model_dump()


class Testimonial(BaseModel):
    quote: str
    name: Optional[str] = None
    role: Optional[str] = None

    @field_validator("quote", mode="before")
    @classmethod
    def quote_text(cls, v):
        text = _clean(v, 400)
        if not text:
            raise ValueError("Mesaj boş olamaz")
        return text

    @field_validator("name", "role", mode="before")
    @classmethod
    def short(cls, v):
        return _clean(v, 80)


class SiteAppearance(BaseModel):
    """What an organisation admin may change about its website."""
    template: Literal["klasik", "kategori", "sade"] = "klasik"
    tagline: Optional[str] = None
    primary_color: str = "#059669"
    accent_color: str = "#0D9488"
    logo_url: Optional[str] = None
    logo_dark_url: Optional[str] = None
    favicon_url: Optional[str] = None
    hero: Hero = Field(default_factory=Hero)
    design: Design = Field(default_factory=Design)
    home_sections: List[str] = Field(default_factory=list)
    cta_band: CtaBand = Field(default_factory=CtaBand)
    testimonials: List[Testimonial] = Field(default_factory=list, max_length=12)
    footer_text: Optional[str] = None
    social_links: dict = Field(default_factory=dict)
    show_in_directory: bool = True
    translations: dict = Field(default_factory=dict)

    @field_validator("tagline", mode="before")
    @classmethod
    def tagline_text(cls, v):
        return _clean(v, 120)

    @field_validator("footer_text", mode="before")
    @classmethod
    def footer(cls, v):
        return _clean(v, 400)

    @field_validator("primary_color", "accent_color", mode="before")
    @classmethod
    def color(cls, v):
        text = str(v or "").strip()
        if not _HEX.fullmatch(text):
            raise ValueError("Renk #RRGGBB biçiminde olmalıdır")
        return text.upper()

    @field_validator("logo_url", "logo_dark_url", "favicon_url", mode="before")
    @classmethod
    def images(cls, v):
        return validate_image_url(v)

    @field_validator("home_sections")
    @classmethod
    def sections(cls, v: List[str]) -> List[str]:
        seen: list[str] = []
        for key in v:
            if key in SECTION_LABELS and key not in seen:
                seen.append(key)
        return seen

    @field_validator("social_links", mode="before")
    @classmethod
    def social(cls, v):
        if not isinstance(v, dict):
            return {}
        result = {}
        for network in SOCIAL_NETWORKS:
            url = str(v.get(network) or "").strip()
            if url:
                if not url.startswith("https://"):
                    raise ValueError(f"{network} bağlantısı https:// ile başlamalıdır")
                result[network] = url[:300]
        return result

    @field_validator("translations", mode="before")
    @classmethod
    def i18n(cls, v):
        return clean_translations(v, SITE_I18N, max_lengths={
            "tagline": 120, "hero_badge": 60, "hero_title": 140, "hero_subtitle": 400, "hero_cta_label": 60,
            "cta_title": 80, "cta_text": 300, "cta_button_label": 80, "footer_text": 400,
        })


def home_sections_of(org) -> list[str]:
    template = org.template if org.template in TEMPLATES else "klasik"
    return _sections((org.site or {}).get("home_sections"), template)


def _sections(stored, template: str) -> list[str]:
    if not stored or stored in LEGACY_DEFAULT_SECTIONS[template]:
        return list(DEFAULT_SECTIONS[template])
    return [key for key in stored if key in SECTION_LABELS]


def appearance_of(org) -> dict:
    """Current appearance as stored, with template defaults filled in (admin view)."""
    site = org.site or {}
    template = org.template if org.template in TEMPLATES else "klasik"
    return {
        "template": template,
        "tagline": org.tagline,
        "primary_color": org.theme_primary_color or "#059669",
        "accent_color": org.theme_accent_color or "#0D9488",
        "logo_url": org.logo_url,
        "logo_dark_url": org.logo_dark_url,
        "favicon_url": org.favicon_url,
        "hero": {"slider": True, **(site.get("hero") or {})},
        "design": design_of(site),
        "home_sections": _sections(site.get("home_sections"), template),
        "cta_band": site.get("cta_band") or {},
        "testimonials": site.get("testimonials") or [],
        "footer_text": site.get("footer_text"),
        "social_links": site.get("social_links") or {},
        "show_in_directory": site.get("show_in_directory", True),
        "translations": site.get("translations") or {},
    }


def apply_appearance(org, payload: SiteAppearance) -> None:
    org.template = payload.template
    org.tagline = payload.tagline
    org.theme_primary_color = payload.primary_color
    org.theme_accent_color = payload.accent_color
    org.logo_url = payload.logo_url
    org.logo_dark_url = payload.logo_dark_url
    org.favicon_url = payload.favicon_url
    # Keys this form does not own (redirect table, …) survive an appearance save.
    kept = {k: v for k, v in (org.site or {}).items() if k in SITE_KEYS_KEPT}
    org.site = {
        **kept,
        "hero": payload.hero.model_dump(exclude_none=True),
        "design": payload.design.model_dump(),
        "home_sections": payload.home_sections or DEFAULT_SECTIONS[payload.template],
        "cta_band": payload.cta_band.model_dump(exclude_none=True),
        "testimonials": [t.model_dump(exclude_none=True) for t in payload.testimonials],
        "footer_text": payload.footer_text,
        "social_links": payload.social_links,
        "show_in_directory": payload.show_in_directory,
        "translations": payload.translations,
    }


def public_site(org, settings_row, lang: Optional[str]) -> dict:
    """Everything the website needs to render an organisation, in the requested language."""
    data = appearance_of(org)
    flat = {
        "tagline": data["tagline"],
        "hero_badge": data["hero"].get("badge"),
        "hero_title": data["hero"].get("title"),
        "hero_subtitle": data["hero"].get("subtitle"),
        "hero_cta_label": data["hero"].get("cta_label"),
        "cta_title": data["cta_band"].get("title"),
        "cta_text": data["cta_band"].get("text"),
        "cta_button_label": data["cta_band"].get("button_label"),
        "footer_text": data["footer_text"],
    }
    localize(flat, data["translations"], lang, SITE_I18N)
    return {
        "slug": org.slug,
        "name": org.name,
        "lang": flat.pop("lang"),
        "template": data["template"],
        "tagline": flat["tagline"],
        "primary_color": data["primary_color"],
        "accent_color": data["accent_color"],
        "logo_url": data["logo_url"],
        "logo_dark_url": data["logo_dark_url"],
        "favicon_url": data["favicon_url"] or data["logo_url"],
        "design": data["design"],
        "hero": {
            "badge": flat["hero_badge"], "title": flat["hero_title"], "subtitle": flat["hero_subtitle"],
            "image_url": data["hero"].get("image_url"), "cta_label": flat["hero_cta_label"],
            "cta_url": data["hero"].get("cta_url"), "slider": data["hero"]["slider"] is not False,
        },
        "sections": data["home_sections"],
        "cta_band": {
            "title": flat["cta_title"], "text": flat["cta_text"], "button_label": flat["cta_button_label"],
            "button_url": data["cta_band"].get("button_url"),
        },
        "testimonials": data["testimonials"],
        "footer_text": flat["footer_text"],
        "social_links": data["social_links"],
        "languages": (settings_row.languages if settings_row else None) or ["tr"],
        "seo": {
            "title": settings_row.seo_title if settings_row else None,
            "description": settings_row.seo_description if settings_row else None,
            "keywords": settings_row.seo_keywords if settings_row else None,
        },
        "contact": {
            "phone": settings_row.contact_phone if settings_row else None,
            "email": settings_row.contact_email if settings_row else None,
            "address": settings_row.contact_address if settings_row else None,
        },
    }
