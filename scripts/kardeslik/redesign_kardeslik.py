#!/usr/bin/env python3
"""Card-style look for Kardeşlik Payı's site (layout inspired by vuslat.org.tr).

One-off tool like scripts/hakder/redesign_hakder.py (not shipped). It builds the header,
footer and home page from scratch, so it also works on an organisation that never used the
site builder: an announcement strip over a white header, a hero card (text left, picture
right) on a grey band, the quick donation form, donation cards, news, live figures, funded
projects with progress bars, the help areas, the zakat band, a volunteer call and a white
footer. The organisation keeps its own colours, logo, hero texts and pictures; campaigns,
news and figures are read live, nothing about the association is invented.

    docker exec -i einfak-backend python - --org kardeslik-payi < scripts/kardeslik/redesign_kardeslik.py            # drafts only
    docker exec -i einfak-backend python - --org kardeslik-payi --publish < scripts/kardeslik/redesign_kardeslik.py  # live
    ... --publish --demo   # local development only: also adds the two sample campaigns of scripts/seed_data.py

Every published page keeps its previous version in Sürümler, so the old look can be restored.
"""
from __future__ import annotations

import argparse
import asyncio
import copy
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

sys.path.insert(0, "/app")

from sqlalchemy import select  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.db import AsyncSessionLocal  # noqa: E402
from app.models.campaign import Campaign, CampaignCategory, CampaignStatus  # noqa: E402
from app.models.cms import GalleryItem, SitePage, SitePageRevision  # noqa: E402
from app.models.content_post import ContentPost  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.services.blocks import validate_blocks  # noqa: E402
from app.services.site import design_of  # noqa: E402
from app.services.templates import fresh_ids  # noqa: E402

NAVY, SLATE, MIST, TEAL, LINE = "#343F52", "#60697B", "#F6F7F9", "#2B8CA5", "#E9ECF1"
DESIGN = {"body_font": "nunito", "heading_font": "nunito", "radius": "medium", "container": "normal",
          "page_color": "#FFFFFF", "text_color": NAVY, "heading_weight": "700", "heading_case": "normal"}
BY = "tasarım-kart"
PAGES = {"home": ("__home__", "Ana sayfa"), "header": ("__header__", "Üst bölüm (header)"), "footer": ("__footer__", "Alt bölüm (footer)")}
_n = [0]

DEMO_REMAP = {
    "/demo/mosque.svg": "/images/kardeslik/kp-news3.png",
    "/demo/mosque.webp": "/images/kardeslik/kp-news3.png",
    "/demo/education.svg": "/images/kardeslik/egitim-bursu.jpg",
    "/demo/education.webp": "/images/kardeslik/egitim-bursu.jpg",
    "/demo/quran.svg": "/images/kardeslik/kp-slide-4.png",
    "/demo/quran.webp": "/images/kardeslik/kp-slide-4.png",
    "/demo/water.svg": "/images/kardeslik/su-kuyusu.jpg",
    "/demo/water.webp": "/images/kardeslik/su-kuyusu.jpg",
    "/demo/kurban.svg": "/images/kardeslik/kurban-bagisi.jpg",
    "/demo/kurban.webp": "/images/kardeslik/kurban-bagisi.jpg",
    "/demo/orphan.svg": "/images/kardeslik/yetim-sponsorlugu.jpg",
    "/demo/orphan.webp": "/images/kardeslik/yetim-sponsorlugu.jpg",
    "/demo/food.svg": "/images/kardeslik/gida-yardimi.jpg",
    "/demo/food.webp": "/images/kardeslik/gida-yardimi.jpg",
    "/demo/community.svg": "/images/kardeslik/kp-news1.png",
    "/demo/community.webp": "/images/kardeslik/kp-news1.png",
    "/demo/hands.svg": "/images/kardeslik/kp-fatura.png",
    "/demo/hands.webp": "/images/kardeslik/kp-fatura.png",
    "/demo/relief.svg": "/images/kardeslik/kp-gida.png",
    "/demo/relief.webp": "/images/kardeslik/kp-gida.png",
    "/demo/winter.svg": "/images/kardeslik/kp-slide-3.png",
    "/demo/winter.webp": "/images/kardeslik/kp-slide-3.png",
    "/demo/ramadan.svg": "/images/kardeslik/kp-hero.png",
    "/demo/ramadan.webp": "/images/kardeslik/kp-hero.png",
}


def remap_assets(obj: Any) -> tuple[Any, bool]:
    """Replace generic /demo/* placeholders with Kardeşlik Payı's curated photography."""
    changed = False
    if isinstance(obj, str):
        mapped = DEMO_REMAP.get(obj)
        return (mapped, True) if mapped else (obj, False)
    if isinstance(obj, list):
        out = []
        for item in obj:
            val, c = remap_assets(item)
            changed = changed or c
            out.append(val)
        return out, changed
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            val, c = remap_assets(v)
            changed = changed or c
            out[k] = val
        return out, changed
    return obj, False


def B(block_type: str, style: Optional[dict] = None, mobile: Optional[dict] = None, advanced: Optional[dict] = None,
      children: Optional[list] = None, p: Optional[dict] = None, **props) -> dict:
    _n[0] += 1
    block: dict[str, Any] = {"id": f"kp-{block_type.replace('_', '-')[:10]}-{_n[0]}", "type": block_type, "props": {**props, **(p or {})}}
    if style or mobile:
        block["style"] = {**({"desktop": style} if style else {}), **({"mobile": mobile} if mobile else {})}
    if advanced:
        block["advanced"] = advanced
    if children is not None:
        block["children"] = children
    return block


def section(children: list, bg: Optional[str] = None, top: int = 72, bottom: int = 72, **extra) -> dict:
    style = {"padding_top": top, "padding_bottom": bottom, **extra}
    if bg:
        style["bg_color"] = bg
    return B("section", style=style, mobile={"padding_top": 44, "padding_bottom": 44}, children=[c for c in children if c])


def heading(text: str, subtitle: Optional[str] = None, align: str = "center", level: str = "h2", kicker: Optional[str] = None) -> dict:
    props = {"text": text, "level": level}
    if subtitle:
        props["subtitle"] = subtitle
    if kicker:
        props["kicker"] = kicker
    return B("heading", style={"text_align": align}, **props)


# --- Header -------------------------------------------------------------------------------

def build_header(org) -> list:
    hero = (org.site or {}).get("hero") or {}
    desktop_only = {"hide_tablet": True, "hide_mobile": True}
    strip = B("announcement_bar", text=hero.get("title") or org.tagline or org.name, url="/kampanyalar", tone="brand", closable=True) \
        if (hero.get("title") or org.tagline) else None
    row = B("header_row", tone="light", height=84, sticky=True, shrink=True, border=True, center_align="left", children=[
        B("header_slot", children=[B("logo", show_name=True, show_tagline=False)]),  # the tagline collides with the phone menu button
        B("header_slot", children=[B("nav_menu", style={"font_size": 15, "font_weight": "700"}, source="header", mobile="drawer", drawer_donate=True, align="left")]),
        B("header_slot", children=[
            B("account_links", style={"font_size": 14}, layout="inline", show_portal=True, show_verify=False, advanced=desktop_only),
            B("cart_button"),
            B("donate_button", label="Bağış Yap", url="/bagis", size="md", heart=True, p={"style": "primary"}, advanced=desktop_only),
        ]),
    ])
    return [b for b in (strip, row) if b]


# --- Home ---------------------------------------------------------------------------------

AREAS = [  # the organisation's own help areas (its icon set in /images/kardeslik)
    ("gida", "Gıda"), ("egitim", "Eğitim"), ("fatura", "Fatura"), ("barinma", "Barınma"),
    ("saglik", "Sağlık"), ("asevi", "Aşevi"), ("zekat", "Zekât"), ("genel", "Genel bağış"),
]

KARDESLIK_SLIDES = [
    {
        "image_url": "/images/kardeslik/kp-slide-1.png",
        "badge": "SOFRA & AŞEVİ",
        "title": "Gönül sofralarında kardeşlik bereketi",
        "text": "Aşevi ve kumanya dağıtımlarımızla ihtiyaç sahiplerinin sofrasına sıcak aş ve umut taşıyoruz.",
        "button_label": "Bağış Yap",
        "button_url": "/bagis",
        "button2_label": "Kampanyaları İncele",
        "button2_url": "/kampanyalar",
        "align": "left",
        "overlay": 55,
    },
    {
        "image_url": "/images/kardeslik/kp-slide-2.png",
        "badge": "SU KUYUSU",
        "title": "Kurak topraklara temiz su ve hayat",
        "text": "Su kuyusu projelerimizle binlerce kardeşimizin temiz ve güvenli içme suyuna kavuşmasına vesile oluyoruz.",
        "button_label": "Su Kuyusuna Destek Ol",
        "button_url": "/kampanyalar",
        "button2_label": "Faaliyetlerimiz",
        "button2_url": "/sayfa/faaliyetlerimiz",
        "align": "left",
        "overlay": 55,
    },
    {
        "image_url": "/images/kardeslik/kp-slide-3.png",
        "badge": "ACİL YARDIM & BARINMA",
        "title": "Soğuk kış günlerinde sıcak bir yuva desteği",
        "text": "Battaniye, yakacak, çadır ve acil barınma destekleriyle zor şartlardaki kardeşlerimizin yanındayız.",
        "button_label": "Acil Yardım Bağışı",
        "button_url": "/bagis",
        "button2_label": "Projelerimiz",
        "button2_url": "/kampanyalar",
        "align": "left",
        "overlay": 55,
    },
    {
        "image_url": "/images/kardeslik/kp-slide-4.png",
        "badge": "EĞİTİM & TALEBE DESTEĞİ",
        "title": "İlim ve irfan yolculuğunda nesillere destek",
        "text": "Talebe bursları, Kur'an kursu ve medrese destekleriyle gençlerimizin eğitim hayatına omuz veriyoruz.",
        "button_label": "Eğitim Desteği Ver",
        "button_url": "/kampanyalar",
        "button2_label": "Hakkımızda",
        "button2_url": "/sayfa/hakkimizda",
        "align": "left",
        "overlay": 55,
    },
]


def story(image: str, alt: str, kicker: str, title: str, text: str, label: str, url: str, image_side: str = "left") -> dict:
    """Editorial photo paired with a structured content card."""
    picture = B("column", children=[B("image", style={"radius": 12, "shadow": "md"}, image_url=image, alt=alt, aspect="4/3")])
    card = B("column", style={"bg_color": "#FFFFFF", "radius": 14, "shadow": "sm", "padding_top": 32, "padding_bottom": 32, "padding_left": 32, "padding_right": 32},
             mobile={"padding_top": 22, "padding_bottom": 22, "padding_left": 20, "padding_right": 20}, children=[
        heading(title, align="left", level="h3", kicker=kicker),
        B("richtext", style={"margin_top": 12}, text=text),
        B("buttons", style={"margin_top": 20}, align="left", items=[{"label": label, "url": url, "style": "primary"}]),
    ])
    return B("columns", ratio="1-1", gap=36, valign="center", children=[picture, card] if image_side == "left" else [card, picture])


def tile(image: str, alt: str, kicker: str, title: str, text: str, label: str, url: str) -> dict:
    """Two-up showcase card with 16:9 photo, kicker, concise text and outline CTA."""
    return B("column", style={"bg_color": "#FFFFFF", "radius": 14, "shadow": "sm", "padding_bottom": 28, "hover_shadow": "lg"}, children=[
        B("image", image_url=image, alt=alt, aspect="16/9", link=url),
        B("heading", style={"text_align": "center", "padding_left": 24, "padding_right": 24, "margin_top": 16}, text=title, kicker=kicker, level="h3"),
        B("richtext", style={"text_align": "center", "padding_left": 28, "padding_right": 28, "margin_top": 8, "font_size": 15}, text=text),
        B("buttons", style={"margin_top": 18}, align="center", items=[{"label": label, "url": url, "style": "outline"}]),
    ])


def build_home(org) -> list:
    site = org.site or {}
    hero = site.get("hero") or {}
    cta = site.get("cta_band") or {}
    own_images = (org.logo_url or "").startswith("/images/kardeslik/") or org.slug == "kardeslik-payi"

    hero_block = (
        B("slider", slides=KARDESLIK_SLIDES, height="lg", autoplay=True, interval=6, effect="fade", arrows=True, dots=True)
        if own_images else
        B("section", style={"bg_color": MIST, "padding_top": 40, "padding_bottom": 40}, mobile={"padding_top": 20, "padding_bottom": 20}, children=[
            B("columns", style={"bg_color": "#FFFFFF", "radius": 14, "shadow": "sm", "padding_top": 28, "padding_bottom": 28, "padding_left": 28, "padding_right": 28},
              mobile={"padding_top": 18, "padding_bottom": 18, "padding_left": 18, "padding_right": 18}, ratio="1-1", gap=40, valign="center", children=[
                B("column", style={"padding_left": 20}, mobile={"padding_left": 0}, children=[
                    heading(hero.get("title") or org.name, hero.get("subtitle"), align="left", level="h1", kicker=hero.get("badge")),
                    B("buttons", style={"margin_top": 24}, align="left", items=[
                        {"label": "Kampanyaları incele", "url": "/kampanyalar", "style": "outline"},
                        {"label": hero.get("cta_label") or "Bağış Yap", "url": "/bagis", "style": "primary"},
                    ]),
                ]),
                B("column", children=[B("image", style={"radius": 10}, image_url=hero["image_url"], alt=org.name, aspect="4/3")] if hero.get("image_url") else []),
            ]),
        ])
    )

    showcase_band = section([
        story(
            "/images/kardeslik/kp-gida.png",
            "Yardım deposunda koliler hazırlayan gönüllüler",
            "KUMANYA & GIDA",
            "İhtiyaç sahiplerinin kapısına düzenli destek",
            "Gıda kolileri, un ve temel erzak paketlerini saha ekiplerimiz aracılığıyla ailelere ulaştırıyoruz.",
            "Gıda Yardımı Yap",
            "/kampanyalar",
            image_side="left",
        ),
        B("spacer", height=32),
        B("columns", ratio="1-1", gap=28, valign="stretch", children=[
            tile(
                "/images/kardeslik/kp-egitim.png",
                "Kütüphanede ders çalışan erkek öğrenciler",
                "EĞİTİM BURSU",
                "Talebelerimize burs ve yurt desteği",
                "İlköğretimden yükseköğretime kadar ilim yolundaki talebelerimizin eğitim giderlerine katkı sunuyoruz.",
                "Eğitime Destek Ol",
                "/kampanyalar",
            ),
            tile(
                "/images/kardeslik/kp-fatura.png",
                "Yardım kolisi ve tesbih ile emanet teslimi",
                "VEKÂLET & FATURA",
                "Zekât, fitre ve fatura destekleri",
                "Vekâleten emanet ettiğiniz destekleri borçlu ve ihtiyaç sahibi ailelere gizlilik ve özenle ulaştırıyoruz.",
                "Destek Alanları",
                "/bagis",
            ),
        ]),
    ], bg=MIST, top=64, bottom=64) if own_images else None

    return [b for b in [
        hero_block,
        section([B("quick_donation")], top=40, bottom=24),
        section([heading("Çalışmalarımıza destek olun", "Tutarı girin, sepete ekleyin; makbuzunuz size ulaşsın."),
                 B("spacer", height=16),
                 B("donation_cards", source="latest", limit=9, columns=3, layout="grid")], top=48),
        section([B("news", title="Faaliyetlerimiz", limit=6, layout="grid", links="haberler", all_label="Tümünü gör", all_url="/haberler")], top=0),
        showcase_band,
        section([heading(f"Rakamlarla {org.name}"), B("spacer", height=20), B("stats", mode="auto")], bg="#FFFFFF" if own_images else MIST, top=56, bottom=56),
        section([B("campaigns", title="Tüm bağış kampanyalarımız", source="featured", limit=18, layout="grid", columns=3,
                   show_progress=True, show_all_link=True)]),
        section([B("categories", kicker="BAĞIŞ TÜRLERİ", title="Tüm bağış ve infak kategorileri")], bg=MIST, top=48, bottom=48),
        section([B("features", title="Yardım alanlarımız", columns=4, look="card", align="center",
                   items=[{"image_url": f"/images/kardeslik/kp-ic-{key}.png", "title": label, "url": "/kampanyalar"} for key, label in AREAS])],
                bg="#FFFFFF") if own_images else None,
        section([B("gallery_strip", kicker="SAHADAN KARELER", title="Faaliyetlerimizden görüntüler", limit=6)],
                bg=MIST, top=56, bottom=56) if own_images else None,
        B("zakat_band"),
        B("cta_band", title=cta["title"], text=cta.get("text"), button_label=cta.get("button_label"), button_url=cta.get("button_url"))
        if cta.get("title") and cta.get("button_label") else None,
        section([B("columns", style={"bg_color": TEAL, "text_color": "#FFFFFF", "radius": 14, "padding_top": 44, "padding_bottom": 44, "padding_left": 48, "padding_right": 48},
                   mobile={"padding_top": 28, "padding_bottom": 28, "padding_left": 24, "padding_right": 24}, ratio="2-1", gap=32, valign="center", children=[
            B("column", children=[heading("Gönüllümüz olmak ister misiniz?", "Zamanınızı ve emeğinizi iyiliğe katın.", align="left")]),
            B("column", children=[B("buttons", align="right", items=[{"label": "Gönüllü ol", "url": "/gonullu", "style": "light"}])]),
        ])], top=56, bottom=56),
    ] if b]


# --- Footer -------------------------------------------------------------------------------

def build_footer(org) -> list:
    small = {"font_size": 15}
    return [B("section", style={"bg_color": "#FFFFFF", "text_color": SLATE, "padding_top": 56, "padding_bottom": 28, "border_width": 1, "border_color": LINE},
              mobile={"padding_top": 40, "padding_bottom": 24}, children=[
        B("columns", ratio="1-1-1-1", gap=40, valign="start", children=[
            B("column", children=[B("logo", show_about=True, light=False), B("currency_switcher", style={"margin_top": 16}, p={"style": "select"})]),
            B("column", children=[B("nav_menu", style=small, title="Kurumsal", source="header", layout="vertical", mobile="inline")]),
            B("column", children=[B("nav_menu", style=small, title="Bilgilendirme", source="footer", layout="vertical", mobile="inline")]),
            B("column", children=[B("contact_info", style=small, title="İletişim", layout="stacked", show_phone=True, show_email=True, show_address=True)]),
        ]),
        B("divider", style={"margin_top": 36, "margin_bottom": 20}),
        B("columns", ratio="2-1", gap=24, valign="center", stack_on="mobile", children=[
            B("column", children=[B("copyright", style={"text_align": "left", "font_size": 14}, show_powered=True)]),
            B("column", children=[B("social_icons", align="right", p={"style": "round"})]),
        ]),
    ])]


# --- Local sample data --------------------------------------------------------------------

DEMO_CAMPAIGNS = [  # comprehensive samples covering all 14 CampaignCategory types; never for production
    dict(slug="su-kuyusu-projesi", title="Su Kuyusu Projesi", summary="Afrika'da temiz su kuyuları açıyoruz",
         story="<p>Temiz suya erişimi olmayan bölgelerde derin sondajlı su kuyuları açarak binlerce insanın hayatını kolaylaştırıyoruz.</p>",
         category=CampaignCategory.SU, target_cents=75000000, collected_cents=42000000, display_order=1,
         cover_image_url="/images/kardeslik/su-kuyusu.jpg", suggested_amounts_cents=[10000, 25000, 50000, 100000]),
    dict(slug="mahmud-ustaosmanoglu-su-kuyusu", title="Hayrat Su Kuyusu Hisse Projesi", summary="Hisseli veya tam kuyu bağışıyla kalıcı su hayratı",
         story="<p>Su sıkıntısı çeken köylere güneş enerjili ve el pompalı kalıcı su kuyuları kazandırıyoruz.</p>",
         category=CampaignCategory.SU, target_cents=90000000, collected_cents=58000000, display_order=2,
         cover_image_url="/images/kardeslik/mahmud-ustaosmanoglu-hazretleri-ks-su-kuyusu-projesi.png", suggested_amounts_cents=[25000, 50000, 150000, 500000]),
    dict(slug="yetim-sponsorlugu", title="Yetim Sponsorluğu", summary="Yetim çocuklara aylık düzenli bakım ve eğitim desteği",
         story="<p>Ailelerini kaybetmiş yetim çocuklarımıza barınma, beslenme, kırtasiye ve eğitim desteği sağlıyoruz.</p>",
         category=CampaignCategory.YETIM, target_cents=120000000, collected_cents=65000000, display_order=3,
         cover_image_url="/images/kardeslik/yetim-sponsorlugu.jpg", suggested_amounts_cents=[10000, 25000, 40000, 80000]),
    dict(slug="gida-yardimi-kumanya", title="Gıda Yardımı & Kumanya", summary="İhtiyaç sahibi ailelere düzenli erzak ve kumanya paketi",
         story="<p>Hazırladığımız temel gıda kolilerini saha ekiplerimizle ihtiyaç sahibi hanelere ulaştırıyoruz.</p>",
         category=CampaignCategory.GIDA, target_cents=60000000, collected_cents=31000000, display_order=4,
         cover_image_url="/images/kardeslik/gida-yardimi.jpg", suggested_amounts_cents=[15000, 30000, 60000, 120000]),
    dict(slug="asevi-sicak-yemek", title="Aşevi & Sıcak Yemek İkramı", summary="Günlük sıcak aş dağıtımı ve kardeşlik sofraları",
         story="<p>Aşevlerimizde her gün taze hazırlanan sıcak yemekleri ihtiyaç sahipleri ve talebelerle paylaşıyoruz.</p>",
         category=CampaignCategory.GIDA, target_cents=55000000, collected_cents=34000000, display_order=5,
         cover_image_url="/images/kardeslik/kp-news1.png", suggested_amounts_cents=[10000, 20000, 50000, 100000]),
    dict(slug="egitim-bursu", title="Talebe Eğitim Bursu", summary="İlim yolundaki talebelere aylık burs ve kırtasiye desteği",
         story="<p>Ortaöğretim, lise ve yükseköğretim talebelerimizin aylık burs, kitap ve yurt ihtiyaçlarını karşılıyoruz.</p>",
         category=CampaignCategory.EGITIM, target_cents=85000000, collected_cents=48000000, display_order=6,
         cover_image_url="/images/kardeslik/egitim-bursu.jpg", suggested_amounts_cents=[10000, 25000, 50000, 100000]),
    dict(slug="hafizlik-ilim-destegi", title="Kur'an & Hafızlık Talebe Desteği", summary="Hafızlık ve İslami ilimler okuyan öğrencilere iaşe desteği",
         story="<p>Kur'an-ı Kerim hıfzı yapan gençlerimizin iaşe, Mushaf ve medrese eğitim giderlerine omuz veriyoruz.</p>",
         category=CampaignCategory.EGITIM, target_cents=70000000, collected_cents=41000000, display_order=7,
         cover_image_url="/images/kardeslik/kp-slide-4.png", suggested_amounts_cents=[15000, 30000, 75000]),
    dict(slug="kurban-bagisi", title="Vekalet Kurban Bağışı", summary="Vacip kurban hisselerinizi ihtiyaç sahiplerine ulaştırıyoruz",
         story="<p>Vekaletini verdiğiniz kurbanları İslami usullere göre kesip yurt içi ve yurt dışındaki kardeşlerimize ulaştırıyoruz.</p>",
         category=CampaignCategory.KURBAN, target_cents=95000000, collected_cents=51000000, display_order=8,
         cover_image_url="/images/kardeslik/kurban-bagisi.jpg", suggested_amounts_cents=[55000, 275000, 550000, 1100000]),
    dict(slug="adak-kurbani", title="Adak Kurbanı Bağışı", summary="Adak kurbanlarınız kesim bilgilendirmesiyle yerine ulaşsın",
         story="<p>Adak niyetiyle bağışladığınız küçükbaş kurbanlar aşevlerinde pişirilerek veya hisse olarak dağıtılır.</p>",
         category=CampaignCategory.ADAK, target_cents=65000000, collected_cents=29000000, display_order=9,
         cover_image_url="/images/kardeslik/kp-news2.png", suggested_amounts_cents=[100000, 550000, 1100000]),
    dict(slug="akika-kurbani", title="Akika & Şükür Kurbanı", summary="Yeni doğan evlatlar ve şükür niyetleri için vekalet kurban",
         story="<p>Akika ve şükür kurbanlarınızı kesim videosu eşliğinde mazlum coğrafyalardaki ailelere ikram ediyoruz.</p>",
         category=CampaignCategory.AKIKA, target_cents=60000000, collected_cents=26000000, display_order=10,
         cover_image_url="/images/kardeslik/kurban-bagisi.jpg", suggested_amounts_cents=[100000, 550000, 1100000]),
    dict(slug="cami-ve-medrese-insaati", title="Cami ve İbadethane İnşaatı", summary="İhtiyaç duyulan bölgelerde kalıcı cami ve mescit inşası",
         story="<p>Cemaatin huzurla ibadet edebileceği cami ve Kur'an eğitim sınıflarının yapımına tuğla hissesiyle destek olun.</p>",
         category=CampaignCategory.INSAAT, target_cents=250000000, collected_cents=142000000, display_order=11,
         cover_image_url="/images/kardeslik/haci-ali-elcin-camii-insaati.png", suggested_amounts_cents=[25000, 50000, 100000, 500000]),
    dict(slug="asevi-hizmet-binasi-insaati", title="Aşevi ve Hizmet Binası İnşaatı", summary="Günlük binlerce kişiye yemek çıkaracak aşevi tesisi",
         story="<p>Bölge halkına ve öğrencilere düzenli sıcak yemek ulaştıracak aşevi mutfağının kurulumu için destek bekliyoruz.</p>",
         category=CampaignCategory.INSAAT, target_cents=180000000, collected_cents=96000000, display_order=12,
         cover_image_url="/images/kardeslik/hakder-asevi-insaati.png", suggested_amounts_cents=[20000, 50000, 100000, 250000]),
    dict(slug="saglik-ve-kis-barinma-destegi", title="Sağlık & Kış Barınma Yardımı", summary="İlaç, tedavi, battaniye ve çadır acil yardım fonu",
         story="<p>Soğuk hava koşullarında ve kriz bölgelerinde temel sağlık, ısınma ve barınma ihtiyaçlarını karşılıyoruz.</p>",
         category=CampaignCategory.SAGLIK, target_cents=80000000, collected_cents=44000000, display_order=13,
         cover_image_url="/images/kardeslik/kp-slide-3.png", suggested_amounts_cents=[10000, 25000, 50000, 100000]),
    dict(slug="zekat-bagisi", title="Zekât Bağışı", summary="Zekât emanetleriniz şer'i esaslara uygun şekilde ulaştırılır",
         story="<p>Zekât fonumuz ihtiyaç sahibi ailelere, borçlulara ve ilim talebelerine doğrudan ve güvenle teslim edilir.</p>",
         category=CampaignCategory.ZEKAT, target_cents=150000000, collected_cents=89000000, display_order=14,
         cover_image_url="/images/kardeslik/kp-news3.png", suggested_amounts_cents=[50000, 100000, 250000, 500000]),
    dict(slug="fitre-bagisi", title="Fitre (Fıtır Sadakası)", summary="Bayram sevinci öncesi ihtiyaç sahiplerine fitre ulaştırın",
         story="<p>Fitre bağışlarınızı bayramdan önce gerçek ihtiyaç sahiplerinin temel gıda ve giyim giderleri için dağıtıyoruz.</p>",
         category=CampaignCategory.FITRE, target_cents=45000000, collected_cents=27000000, display_order=15,
         cover_image_url="/images/kardeslik/kp-gida.png", suggested_amounts_cents=[18000, 36000, 72000, 180000]),
    dict(slug="fidye-bagisi", title="Fidye Bağışı", summary="Oruç tutamayan kardeşlerimiz adına günlük doyurma bedeli",
         story="<p>Fidye emanetlerinizle her gün ihtiyaç sahibi kardeşlerimize sıcak öğün ve gıda desteği ulaştırıyoruz.</p>",
         category=CampaignCategory.FIDYE, target_cents=40000000, collected_cents=21000000, display_order=16,
         cover_image_url="/images/kardeslik/kp-hero.png", suggested_amounts_cents=[18000, 90000, 270000, 540000]),
    dict(slug="sadaka-ve-fatura-destegi", title="Sadaka & Askıda Fatura Desteği", summary="Dar gelirli ailelerin kira ve fatura yükünü hafifletin",
         story="<p>Sadaka bağışlarınızla dar gelirli hanelerin elektrik, doğalgaz, su faturası ve acil ihtiyaçlarını karşılıyoruz.</p>",
         category=CampaignCategory.SADAKA, target_cents=50000000, collected_cents=33000000, display_order=17,
         cover_image_url="/images/kardeslik/kp-fatura.png", suggested_amounts_cents=[5000, 10000, 25000, 50000]),
    dict(slug="genel-bagislar", title="Genel Bağış & Acil Yardım Fonu", summary="En acil yardım kalemlerinde değerlendirilen genel bağış havuzu",
         story="<p>Genel bağış fonumuz sahada öncelikli görülen gıda, barınma, eğitim ve acil yardım alanlarında kullanılır.</p>",
         category=CampaignCategory.GENEL, target_cents=100000000, collected_cents=62000000, display_order=18,
         cover_image_url="/images/kardeslik/genel-bagislar.png", suggested_amounts_cents=[10000, 25000, 50000, 100000]),
]

DEMO_POSTS = [
    dict(
        slug="afrika-temiz-su-kuyulari-acildi",
        kind="faaliyet",
        title="Afrika'da Yeni Temiz Su Kuyuları Hizmete Açıldı",
        summary="Bağışçılarımızın destekleriyle kurak köylerde açılan su kuyuları binlerce kardeşimize temiz su ulaştırıyor.",
        body=(
            "Saha ekiplerimizin koordinasyonuyla yürütülen su kuyusu projelerimiz kapsamında yeni kuyular bölge halkının kullanımına sunuldu.\n\n"
            "## Kalıcı ve Güvenli Erişim\n"
            "Derin sondaj ve dayanıklı el pompası sistemiyle inşa edilen kuyular uzun yıllar boyunca kesintisiz hizmet verecek şekilde planlandı.\n\n"
            "Destek veren tüm hayırseverlerimize şükranlarımızı sunuyoruz."
        ),
        image_url="/images/kardeslik/su-kuyusu.jpg",
        gallery_urls=["/images/kardeslik/su-kuyusu.jpg", "/images/kardeslik/kp-slide-2.png"],
        display_order=1,
    ),
    dict(
        slug="asevi-ve-sicak-yemek-ikrami",
        kind="faaliyet",
        title="Gönül Sofralarında Sıcak Yemek ve Kumanya Dağıtımı",
        summary="Aşevi kazanlarımızda her gün pişen sıcak yemekler ve hazırlanan erzak kolileri ihtiyaç sahiplerine ulaştırılıyor.",
        body=(
            "Kardeşlik Payı aşevi ve lojistik ekibimiz, yurt içi ve kriz bölgelerinde günlük sıcak yemek ikramlarını aralıksız sürdürüyor.\n\n"
            "## Düzenli Erzak Desteği\n"
            "Sıcak yemek ikramlarının yanı sıra temel gıda ürünlerinden oluşan kumanya kolileri belirlenen hanelere bizzat teslim ediliyor."
        ),
        image_url="/images/kardeslik/kp-news1.png",
        gallery_urls=["/images/kardeslik/kp-news1.png", "/images/kardeslik/kp-gida.png"],
        display_order=2,
    ),
    dict(
        slug="kis-aylarinda-barinma-ve-battaniye-destegi",
        kind="haber",
        title="Kış Yardımları ve Acil Barınma Desteği Sahada",
        summary="Soğuk hava koşullarından etkilenen bölgelere battaniye, kışlık kıyafet, yakacak ve çadır yardımları ulaştırıldı.",
        body=(
            "Kış mevsiminin ağır geçtiği yerleşim alanlarında acil barınma ve ısınma desteklerimiz hız kesmeden devam ediyor.\n\n"
            "## Öncelikli İhtiyaç Listesi\n"
            "Kalın battaniye, kışlık mont ve ısı yalıtımlı çadır ekipmanları saha görevlilerimiz tarafından dağıtıldı."
        ),
        image_url="/images/kardeslik/kp-slide-3.png",
        gallery_urls=["/images/kardeslik/kp-slide-3.png"],
        display_order=3,
    ),
    dict(
        slug="vekalet-kurban-hazirliklari-ve-dagitim",
        kind="haber",
        title="Vekalet Kurban Kesim ve Dağıtım Organizasyonu Başladı",
        summary="Vacip, adak, akika ve şükür kurbanı emanetleriniz veteriner kontrolü ve İslami usullerle yerine ulaştırılıyor.",
        body=(
            "Kurban organizasyonumuz kapsamında kesim noktalarındaki hazırlıklar ve saha tespit çalışmaları tamamlandı.\n\n"
            "## Şeffaf Bilgilendirme\n"
            "Vekalet sahipleri kesim tamamlandığında kısa mesaj ve görüntü kaydıyla bilgilendirilmektedir."
        ),
        image_url="/images/kardeslik/kp-news2.png",
        gallery_urls=["/images/kardeslik/kp-news2.png", "/images/kardeslik/kurban-bagisi.jpg"],
        display_order=4,
    ),
    dict(
        slug="talebe-burslari-ve-medrese-destegi",
        kind="faaliyet",
        title="Talebelerimize Burs, Kitap ve Yurt Desteği",
        summary="İlim ve hafızlık yolculuğundaki öğrencilerimizin aylık burs ve eğitim materyali giderlerine destek oluyoruz.",
        body=(
            "Eğitim komisyonumuzun değerlendirmesiyle destek kapsamına alınan öğrencilere yeni dönem burs ödemeleri başladı.\n\n"
            "## İlim Halkalarına Omuz Verin\n"
            "Kütüphane, kırtasiye ve barınma imkanlarının güçlendirilmesiyle gençlerimizin eğitimine odaklanmasını hedefliyoruz."
        ),
        image_url="/images/kardeslik/kp-egitim.png",
        gallery_urls=["/images/kardeslik/kp-egitim.png", "/images/kardeslik/kp-slide-4.png"],
        display_order=5,
    ),
    dict(
        slug="zekat-fitre-ve-sadaka-emanetleri",
        kind="blog",
        title="Zekât, Fitre ve Sadaka Emanetlerinde Güven Esasları",
        summary="Dini bağış kalemlerinin ayrı muhasebeleştirilmesi, şer'i hassasiyet ve doğrudan hak sahibine ulaştırma süreci.",
        body=(
            "Vakfımıza emanet edilen zekât, fitre, fidye ve sadaka bağışları ayrı hesaplarda takip edilmektedir.\n\n"
            "## Hak Sahibine Doğrudan Teslim\n"
            "Her bağış kalemi kendi fıkhi hükmüne uygun alanlarda, saha incelemesi yapılmış ihtiyaç sahiplerine ulaştırılır."
        ),
        image_url="/images/kardeslik/kp-news3.png",
        gallery_urls=["/images/kardeslik/kp-news3.png", "/images/kardeslik/kp-fatura.png"],
        display_order=6,
    ),
]

DEMO_GALLERY = [
    dict(kind="photo", title="Avluda Kardeşlik Sofrası", album="Aşevi & Sofralar", image_url="/images/kardeslik/kp-hero.png", display_order=1),
    dict(kind="photo", title="Temiz Su Kuyusu Sevinci", album="Su Kuyuları", image_url="/images/kardeslik/kp-slide-2.png", display_order=2),
    dict(kind="photo", title="Kış Acil Yardım Dağıtımı", album="Saha Faaliyetleri", image_url="/images/kardeslik/kp-slide-3.png", display_order=3),
    dict(kind="photo", title="Kur'an ve Hafızlık Eğitimi", album="Eğitim & İlim", image_url="/images/kardeslik/kp-slide-4.png", display_order=4),
    dict(kind="photo", title="Kumanya Kolisi Hazırlığı", album="Saha Faaliyetleri", image_url="/images/kardeslik/kp-gida.png", display_order=5),
    dict(kind="photo", title="Emanet ve Destek Teslimi", album="Saha Faaliyetleri", image_url="/images/kardeslik/kp-fatura.png", display_order=6),
]


async def add_demo_campaigns(db, org) -> None:
    existing_campaigns = set((await db.execute(select(Campaign.slug).where(Campaign.organization_id == org.id))).scalars())
    for data in DEMO_CAMPAIGNS:
        if data["slug"] not in existing_campaigns:
            db.add(Campaign(organization_id=org.id, status=CampaignStatus.ACTIVE, is_featured=True, **data))
            print(f"örnek kampanya eklendi: {data['title']}")

    existing_posts = set((await db.execute(select(ContentPost.slug).where(ContentPost.organization_id == org.id))).scalars())
    now = datetime.now(timezone.utc)
    for idx, post_data in enumerate(DEMO_POSTS):
        if post_data["slug"] not in existing_posts:
            db.add(ContentPost(
                organization_id=org.id,
                is_active=True,
                published_at=now - timedelta(days=idx),
                **post_data,
            ))
            print(f"örnek içerik eklendi: {post_data['title']}")

    existing_gallery = set((await db.execute(select(GalleryItem.image_url).where(GalleryItem.organization_id == org.id))).scalars())
    for g in DEMO_GALLERY:
        if g["image_url"] not in existing_gallery:
            db.add(GalleryItem(organization_id=org.id, is_active=True, **g))
            print(f"örnek galeri eklendi: {g['title']}")


# --- Apply --------------------------------------------------------------------------------

async def run(org_slug: str, publish: bool, demo: bool) -> None:
    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization).where(Organization.slug == org_slug))).scalar_one()
        if demo:
            await add_demo_campaigns(db, org)
        pages = (await db.execute(select(SitePage).where(SitePage.organization_id == org.id))).scalars().all()
        by_kind = {p.kind: p for p in pages if p.kind in PAGES}
        plan: list[tuple[SitePage, list, str]] = []
        for kind, blocks in {"header": build_header(org), "footer": build_footer(org), "home": build_home(org)}.items():
            page = by_kind.get(kind)
            if page is None:
                slug, title = PAGES[kind]
                page = SitePage(organization_id=org.id, slug=slug, title=title, body="", kind=kind, version=0, is_published=False)
                db.add(page)
                await db.flush()
            plan.append((page, blocks, kind))

        # Upgrade any /demo/* placeholders in internal pages to Kardeşlik Payı photography.
        for page in pages:
            if page.kind == "page" and page.blocks:
                remapped, changed = remap_assets(copy.deepcopy(page.blocks))
                if changed:
                    plan.append((page, remapped, page.kind))

        now = datetime.now(timezone.utc)
        for page, blocks, kind in plan:
            cleaned = validate_blocks(fresh_ids(blocks), kind)
            page.version = (page.version or 0) + 1
            if publish:
                if page.blocks:
                    # Keep the look being replaced as a version of its own, so it can always be restored.
                    db.add(SitePageRevision(page_id=page.id, organization_id=org.id, blocks=page.blocks, created_by=BY,
                                            note="Kart tasarımı öncesi", created_at=now - timedelta(seconds=5)))
                page.blocks, page.draft_blocks, page.is_published = cleaned, None, True
                page.published_at, page.published_by = now, BY
                db.add(SitePageRevision(page_id=page.id, organization_id=org.id, blocks=cleaned, created_by=BY, note="Kart tasarımı"))
            else:
                page.draft_blocks, page.draft_updated_at, page.draft_updated_by = cleaned, now, BY
            print(f"{'yayınlandı' if publish else 'taslak'}: {page.slug} ({len(cleaned)} üst blok)")
        if publish:
            # Fonts are site-wide, so they only change together with the published pages. Colours stay the organisation's own.
            print(f"önceki tasarım: {(org.site or {}).get('design')}")
            org.site = {**(org.site or {}), "design": design_of({"design": DESIGN})}
            print("tasarım: Nunito, beyaz zemin (renkler kurumun kendi renkleri)")
        else:
            print("tasarım değişmedi (yazı tipi yalnız --publish ile uygulanır)")
        await db.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", default="kardeslik-payi")
    parser.add_argument("--publish", action="store_true", help="taslak bırakmak yerine yayına al")
    parser.add_argument("--demo", action="store_true", help="yalnız yerel geliştirme: örnek kampanyaları ekle")
    args = parser.parse_args()
    asyncio.run(run(args.org, args.publish, args.demo))
