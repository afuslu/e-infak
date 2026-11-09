"""Site builder blocks: the catalogue and its validation.

A page is a tree of blocks:
    {"id", "type", "props", "style": {"desktop"|"tablet"|"mobile": {...}},
     "advanced": {...}, "translations": {lang: {field: text}}, "children": [...]}

Everything a block may contain is declared here (field kinds, limits, choices).
The editor builds its forms from `catalog()` and every save goes through
`validate_blocks()`: unknown keys are dropped, values are type- and range-checked,
links/images/videos are allow-listed and text is stripped of markup. Nothing an
organisation enters can become script, HTML or free-form CSS.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from app.utils.cms import parse_video_url, validate_image_url, validate_link
from app.utils.content import sanitize_long_text, sanitize_public_text

MAX_BLOCKS = 300
MAX_DEPTH = 4
MAX_TREE_BYTES = 600_000
DEVICES = ("desktop", "tablet", "mobile")
LANGS = ("en", "ar", "de", "fr", "ru", "fa", "ur", "id", "ms", "bs", "sq", "ku")
_ID = re.compile(r"^[a-zA-Z0-9_-]{4,40}$")
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
_ANCHOR = re.compile(r"^[a-z0-9][a-z0-9-]{0,59}$")
_CSS_CLASS = re.compile(r"^[a-zA-Z0-9_ -]{0,80}$")


class BlockError(ValueError):
    """A block tree that cannot be stored; the message is safe to show."""


# --- Field kinds ----------------------------------------------------------------
# Each field: {"kind", "label", ...options}. Kinds: text, textarea, richtext, url,
# image, color, select, number, bool, campaign, campaigns, datetime, video, list.

def F(kind: str, label: str, **opts) -> dict:
    return {"kind": kind, "label": label, **opts}


# Page kinds a block may appear in. Header pages are rows of three slots; other
# kinds take content blocks. Fixed children (column, header_slot) name their parent.
PAGE_KINDS = ("home", "page", "header", "footer")
CONTENT_ZONES = ("home", "page", "footer")
SITE_ZONES = ("home", "page", "header", "footer")
TONES = {"": "Yok", "light": "Beyaz", "soft": "Açık ana renk", "brand": "Ana renk", "dark": "Koyu"}
# What a header slot may hold (besides the site elements below).
SLOT_CONTENT = ("buttons", "heading", "richtext", "spacer", "divider")

BUTTON_STYLES = {"primary": "Ana renk", "accent": "Vurgu rengi", "outline": "Çerçeveli", "light": "Açık", "link": "Bağlantı"}
ALIGN = {"left": "Sola", "center": "Ortaya", "right": "Sağa"}

BLOCKS: dict[str, dict] = {
    # Hero & slider
    "hero": {
        "label": "Kapak", "group": "Kapak & slider", "icon": "🖼️",
        "fields": {
            "variant": F("select", "Görünüm", choices={"klasik": "Büyük görsel + bağış formu", "kategori": "Büyük görsel + butonlar", "sade": "Sade, yan görselli"}, default="klasik"),
            "badge": F("text", "Üst etiket", max=80, translatable=True),
            "title": F("text", "Başlık", max=160, translatable=True, placeholder="Boşsa site kapak başlığı"),
            "subtitle": F("textarea", "Açıklama", max=400, translatable=True),
            "image_url": F("image", "Görsel"),
            "cta_label": F("text", "Buton yazısı", max=40, translatable=True),
            "cta_url": F("url", "Buton bağlantısı"),
            "show_form": F("bool", "Bağış formunu göster", default=True),
        },
    },
    "slider": {
        "label": "Slider", "group": "Kapak & slider", "icon": "🎞️",
        "fields": {
            "slides": F("list", "Slaytlar", max_items=12, min_items=1, item_label="title", fields={
                "image_url": F("image", "Görsel (bilgisayar)"),
                "mobile_image_url": F("image", "Görsel (telefon)"),
                "badge": F("text", "Üst etiket", max=80, translatable=True),
                "title": F("text", "Başlık", max=160, translatable=True),
                "text": F("textarea", "Açıklama", max=400, translatable=True),
                "button_label": F("text", "1. buton yazısı", max=40, translatable=True),
                "button_url": F("url", "1. buton bağlantısı"),
                "button2_label": F("text", "2. buton yazısı", max=40, translatable=True),
                "button2_url": F("url", "2. buton bağlantısı"),
                "campaign_id": F("campaign", "Kampanyaya bağla (bağış butonu ve tutar çubuğu)"),
                "align": F("select", "Metin konumu", choices=ALIGN, default="left"),
                "overlay": F("number", "Karartma (%)", min=0, max=90, default=45),
            }),
            "height": F("select", "Yükseklik", choices={"sm": "Alçak", "md": "Orta", "lg": "Yüksek", "screen": "Tam ekran"}, default="md"),
            "autoplay": F("bool", "Otomatik geçiş", default=True),
            "interval": F("number", "Geçiş süresi (sn)", min=2, max=20, default=6),
            "effect": F("select", "Geçiş efekti", choices={"slide": "Kaydır", "fade": "Solarak"}, default="slide"),
            "arrows": F("bool", "Oklar", default=True),
            "dots": F("bool", "Noktalar", default=True),
        },
    },
    # Donation
    "quick_donation": {
        "label": "Hızlı bağış formu", "group": "Bağış", "icon": "💳",
        "fields": {
            "campaign_id": F("campaign", "Kampanya", placeholder="Boşsa ilk aktif kampanya"),
            "title": F("text", "Başlık", max=120, translatable=True),
        },
    },
    "campaigns": {
        "label": "Kampanya listesi", "group": "Bağış", "icon": "🎯",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "source": F("select", "Hangi kampanyalar", choices={"latest": "En yeniler", "featured": "Öne çıkanlar", "ending": "Bitmek üzere olanlar", "selected": "Seçtiklerim", "category": "Bir kategori"}, default="latest"),
            "campaign_ids": F("campaigns", "Seçilen kampanyalar", show_if={"source": "selected"}),
            "category": F("text", "Kategori", max=40, show_if={"source": "category"}),
            "limit": F("number", "Adet", min=1, max=24, default=6),
            "layout": F("select", "Düzen", choices={"grid": "Izgara", "list": "Liste", "carousel": "Kaydırmalı"}, default="grid"),
            "columns": F("number", "Sütun (bilgisayar)", min=1, max=4, default=3),
            "show_progress": F("bool", "Toplanan tutarı göster", default=True),
            "show_all_link": F("bool", "\"Tümü\" bağlantısı", default=True),
        },
    },
    "campaign_card": {
        "label": "Tek kampanya", "group": "Bağış", "icon": "🎗️",
        "fields": {
            "campaign_id": F("campaign", "Kampanya", required=True),
            "layout": F("select", "Düzen", choices={"wide": "Geniş (görsel yanda)", "card": "Kart"}, default="wide"),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
        },
    },
    "categories": {
        "label": "Bağış kategorileri", "group": "Bağış", "icon": "🗂️",
        "fields": {"kicker": F("text", "Üst başlık", max=60, translatable=True), "title": F("text", "Başlık", max=120, translatable=True)},
    },
    "zakat_band": {
        "label": "Zekat bandı", "group": "Bağış", "icon": "🌙",
        "fields": {"title": F("text", "Başlık", max=120, translatable=True), "text": F("textarea", "Metin", max=300, translatable=True), "button_label": F("text", "Buton yazısı", max=40, translatable=True)},
    },
    # Banners
    "banner": {
        "label": "Banner", "group": "Banner", "icon": "🏷️",
        "fields": {
            "layout": F("select", "Tür", choices={"image": "Görselli", "color": "Renkli metin", "split": "Görsel + metin yan yana"}, default="image"),
            "image_url": F("image", "Görsel"),
            "mobile_image_url": F("image", "Telefon görseli"),
            "kicker": F("text", "Üst etiket", max=60, translatable=True),
            "title": F("text", "Başlık", max=160, translatable=True),
            "text": F("textarea", "Metin", max=500, translatable=True),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "button_url": F("url", "Buton bağlantısı"),
            "campaign_id": F("campaign", "Kampanyaya bağla (bağış butonu ve tutar çubuğu)"),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
        },
    },
    "cta_band": {
        "label": "Çağrı bandı", "group": "Banner", "icon": "📣",
        "fields": {"title": F("text", "Başlık", max=160, translatable=True, placeholder="Boşsa site çağrı bandı"), "text": F("textarea", "Metin", max=400, translatable=True), "button_label": F("text", "Buton yazısı", max=40, translatable=True), "button_url": F("url", "Buton bağlantısı")},
    },
    "notice": {
        "label": "Duyuru kutusu", "group": "Banner", "icon": "ℹ️",
        "fields": {"tone": F("select", "Tür", choices={"info": "Bilgi", "success": "Başarı", "warning": "Uyarı", "danger": "Önemli"}, default="info"), "title": F("text", "Başlık", max=120, translatable=True), "text": F("textarea", "Metin", max=600, translatable=True)},
    },
    # Text & media
    "heading": {
        "label": "Başlık", "group": "Metin & medya", "icon": "🔠",
        "fields": {"kicker": F("text", "Üst başlık", max=60, translatable=True), "text": F("text", "Başlık", max=200, translatable=True, required=True), "level": F("select", "Seviye", choices={"h1": "H1", "h2": "H2", "h3": "H3", "h4": "H4", "h5": "H5", "h6": "H6"}, default="h2"), "subtitle": F("textarea", "Alt metin", max=400, translatable=True)},
    },
    "richtext": {
        "label": "Metin", "group": "Metin & medya", "icon": "📝",
        "fields": {"text": F("richtext", "Metin", max=30000, translatable=True, help="Paragrafları boş satırla ayırın. \"## \" ara başlık, \"- \" madde, **kalın**.")},
    },
    "image": {
        "label": "Görsel", "group": "Metin & medya", "icon": "🖼",
        "fields": {"image_url": F("image", "Görsel", required=True), "alt": F("text", "Alternatif metin", max=200, translatable=True), "caption": F("text", "Alt yazı", max=200, translatable=True), "link": F("url", "Tıklanınca git"), "aspect": F("select", "Oran", choices={"auto": "Orijinal", "16/9": "16:9", "4/3": "4:3", "1/1": "Kare", "21/9": "Geniş"}, default="auto")},
    },
    "image_text": {
        "label": "Görsel + metin", "group": "Metin & medya", "icon": "📰",
        "fields": {"image_url": F("image", "Görsel"), "alt": F("text", "Alternatif metin", max=200, translatable=True), "image_side": F("select", "Görsel tarafı", choices={"left": "Solda", "right": "Sağda"}, default="left"), "kicker": F("text", "Üst başlık", max=60, translatable=True), "title": F("text", "Başlık", max=160, translatable=True), "text": F("richtext", "Metin", max=6000, translatable=True), "button_label": F("text", "Buton yazısı", max=40, translatable=True), "button_url": F("url", "Buton bağlantısı")},
    },
    "video": {
        "label": "Video", "group": "Metin & medya", "icon": "▶️",
        "fields": {"url": F("video", "YouTube veya Vimeo bağlantısı", required=True), "title": F("text", "Başlık", max=160, translatable=True)},
    },
    "buttons": {
        "label": "Butonlar", "group": "Metin & medya", "icon": "🔘",
        "fields": {"items": F("list", "Butonlar", max_items=6, min_items=1, item_label="label", fields={"label": F("text", "Yazı", max=40, translatable=True), "url": F("url", "Bağlantı"), "style": F("select", "Stil", choices=BUTTON_STYLES, default="primary"), "new_tab": F("bool", "Yeni sekmede aç")}), "align": F("select", "Hizalama", choices=ALIGN, default="left")},
    },
    # Trust
    "stats": {
        "label": "İstatistikler", "group": "Güven & etki", "icon": "📊",
        "fields": {"mode": F("select", "Veri", choices={"auto": "Otomatik (kampanyalardan)", "manual": "Elle"}, default="auto"), "items": F("list", "Sayılar", max_items=6, item_label="label", show_if={"mode": "manual"}, fields={"value": F("text", "Değer", max=20), "label": F("text", "Açıklama", max=60, translatable=True)})},
    },
    "faq": {
        "label": "Sık sorulan sorular", "group": "Etkileşim", "icon": "❓",
        "fields": {"title": F("text", "Başlık", max=120, translatable=True), "items": F("list", "Sorular", max_items=40, min_items=1, item_label="question", fields={"question": F("text", "Soru", max=200, translatable=True), "answer": F("richtext", "Cevap", max=3000, translatable=True)})},
    },
    "news": {
        "label": "Haberler", "group": "Haber & iletişim", "icon": "🗞️",
        "fields": {"kicker": F("text", "Üst başlık", max=60, translatable=True), "title": F("text", "Başlık", max=120, translatable=True), "limit": F("number", "Adet", min=1, max=12, default=3)},
    },
    "trust": {
        "label": "Güven bandı", "group": "Güven & etki", "icon": "🔒",
        "fields": {"title": F("text", "Başlık", max=120, translatable=True), "text": F("textarea", "Metin", max=300, translatable=True)},
    },
    # Layout
    "section": {
        "label": "Bölüm (kapsayıcı)", "group": "Düzen", "icon": "🧱", "container": True,
        "fields": {"tone": F("select", "Zemin", choices=TONES, default="", help="Tema renklerini izler; özel renk için Stil sekmesini kullanın")},
    },
    "columns": {
        "label": "Sütunlar", "group": "Düzen", "icon": "🏛️", "container": True, "child_type": "column",
        "zones": SITE_ZONES,
        "fields": {
            "ratio": F("select", "Sütun oranları", choices={"1-1": "1/2 + 1/2", "1-2": "1/3 + 2/3", "2-1": "2/3 + 1/3", "1-1-1": "3 eşit", "1-1-1-1": "4 eşit", "1-2-1": "1/4 + 1/2 + 1/4"}, default="1-1"),
            "gap": F("number", "Aralık (px)", min=0, max=96, default=24),
            "valign": F("select", "Dikey hizalama", choices={"start": "Üst", "center": "Orta", "end": "Alt", "stretch": "Uzat"}, default="start"),
            "stack_on": F("select", "Alt alta geçiş", choices={"tablet": "Tablet ve telefonda", "mobile": "Yalnızca telefonda", "never": "Hiçbir zaman"}, default="tablet"),
        },
    },
    "column": {
        "label": "Sütun", "group": "Düzen", "icon": "▥", "container": True, "hidden": True, "parent": "columns",
        "fields": {},
    },
    "spacer": {
        "label": "Boşluk", "group": "Düzen", "icon": "↕️",
        "fields": {"height": F("number", "Yükseklik (px)", min=4, max=400, default=48)},
    },
    "divider": {
        "label": "Ayraç", "group": "Düzen", "icon": "➖",
        "fields": {"line": F("select", "Çizgi", choices={"solid": "Düz", "dashed": "Kesikli", "dotted": "Noktalı"}, default="solid"), "color": F("color", "Renk"), "width": F("number", "Genişlik (%)", min=10, max=100, default=100)},
    },
}


# --- Header & footer ---------------------------------------------------------------

MENU_LINK_FIELDS = {
    "label": F("text", "Yazı", max=60),
    "url": F("url", "Bağlantı"),
    "group": F("text", "Sütun başlığı (mega menü)", max=40, help="Aynı başlığı taşıyan bağlantılar bir sütunda toplanır"),
    "new_tab": F("bool", "Yeni sekmede aç"),
}

SITE_BLOCKS: dict[str, dict] = {
    "header_row": {
        "label": "Header satırı", "group": "Header", "icon": "▤", "container": True,
        "child_type": "header_slot", "child_count": 3, "zones": ("header",),
        "fields": {
            "tone": F("select", "Zemin", choices={k: v for k, v in TONES.items() if k}, default="light"),
            "height": F("number", "Yükseklik", min=32, max=160, default=76, unit="px"),
            "sticky": F("bool", "Kaydırınca üstte sabit kalsın", default=False),
            "shrink": F("bool", "Sabitken küçülsün ve gölge alsın", default=True, show_if={"sticky": True}),
            "center_align": F("select", "Orta alan hizası", choices=ALIGN, default="center"),
            "border": F("bool", "Alt çizgi", default=True),
        },
    },
    "header_slot": {
        "label": "Header alanı", "group": "Header", "icon": "▭", "container": True, "hidden": True,
        "parent": "header_row", "zones": ("header",), "fields": {},
    },
    "logo": {
        "label": "Logo ve kurum adı", "group": "Site öğeleri", "icon": "🔰", "zones": SITE_ZONES,
        "fields": {
            "size": F("number", "Logo boyutu", min=24, max=160, default=44, unit="px"),
            "show_name": F("bool", "Kurum adını göster", default=True),
            "show_tagline": F("bool", "Sloganı göster", default=True),
            "light": F("bool", "Koyu zemin için açık renk logo/yazı", default=False),
            "show_about": F("bool", "Altında kurum tanıtım metni (Görünüm › alt bilgi metni)", default=False),
        },
    },
    "nav_menu": {
        "label": "Menü", "group": "Site öğeleri", "icon": "☰", "zones": SITE_ZONES,
        "fields": {
            "title": F("text", "Başlık (dikey menüde)", max=60, translatable=True),
            "source": F("select", "Bağlantılar", choices={"header": "Menü ekranı › üst menü", "footer": "Menü ekranı › alt menü", "custom": "Burada tanımla (alt menü ve mega menü)"}, default="header"),
            "items": F("list", "Menü öğeleri", max_items=12, item_label="label", show_if={"source": "custom"}, fields={
                "label": F("text", "Yazı", max=60, translatable=True),
                "url": F("url", "Bağlantı", help="Alt bağlantısı olan öğede boş bırakılabilir"),
                "new_tab": F("bool", "Yeni sekmede aç"),
                "mega": F("bool", "Mega menü (alt bağlantıları sütunlara böl)"),
                "children": F("list", "Alt bağlantılar", max_items=30, item_label="label", fields=MENU_LINK_FIELDS),
            }),
            "layout": F("select", "Yerleşim", choices={"horizontal": "Yatay", "vertical": "Dikey (alt bilgi)"}, default="horizontal"),
            "mobile": F("select", "Tablet ve telefonda", choices={"drawer": "☰ açılır menüye dönüşsün", "inline": "Olduğu gibi görünsün", "hidden": "Gizlensin"}, default="drawer"),
            "drawer_donate": F("bool", "Açılır menüde bağış butonu", default=True, show_if={"mobile": "drawer"}),
        },
    },
    "donate_button": {
        "label": "Bağış butonu", "group": "Site öğeleri", "icon": "💚", "zones": SITE_ZONES,
        "fields": {
            "label": F("text", "Yazı", max=40, translatable=True, placeholder="Bağış Yap"),
            "url": F("url", "Bağlantı", placeholder="/kampanyalar"),
            "style": F("select", "Görünüm", choices=BUTTON_STYLES, default="primary"),
            "size": F("select", "Boyut", choices={"sm": "Küçük", "md": "Orta", "lg": "Büyük"}, default="md"),
            "heart": F("bool", "♥ simgesi", default=False),
        },
    },
    "language_switcher": {
        "label": "Dil seçici", "group": "Site öğeleri", "icon": "🌐", "zones": SITE_ZONES,
        "fields": {}, "help": "Site Ayarları'nda birden fazla dil açıksa görünür",
    },
    "social_icons": {
        "label": "Sosyal medya", "group": "Site öğeleri", "icon": "📣", "zones": SITE_ZONES,
        "fields": {
            "style": F("select", "Görünüm", choices={"pill": "Kutucuk", "round": "Yuvarlak kısaltma", "text": "Yalnız yazı"}, default="pill"),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
        },
    },
    "contact_info": {
        "label": "İletişim bilgileri", "group": "Site öğeleri", "icon": "☎️", "zones": SITE_ZONES,
        "fields": {
            "title": F("text", "Başlık", max=60, translatable=True),
            "show_phone": F("bool", "Telefon", default=True),
            "show_email": F("bool", "E-posta", default=True),
            "show_address": F("bool", "Adres", default=False),
            "layout": F("select", "Yerleşim", choices={"inline": "Yan yana", "stacked": "Alt alta"}, default="inline"),
        },
    },
    "account_links": {
        "label": "Bağışçı girişi / makbuz", "group": "Site öğeleri", "icon": "👤", "zones": SITE_ZONES,
        "fields": {
            "show_portal": F("bool", "Bağışçı girişi", default=True),
            "show_verify": F("bool", "Makbuz doğrula", default=True),
            "layout": F("select", "Yerleşim", choices={"inline": "Yan yana", "stacked": "Alt alta"}, default="inline"),
        },
    },
    "copyright": {
        "label": "Telif satırı", "group": "Site öğeleri", "icon": "©️", "zones": ("footer",),
        "fields": {
            "text": F("text", "Metin", max=200, translatable=True, placeholder="Boşsa: © yıl Kurum adı"),
            "show_powered": F("bool", "\"E-İnfak altyapısıyla\" yazısı", default=True),
        },
    },
}
BLOCKS.update(SITE_BLOCKS)
HEADER_SLOT_CHILDREN = frozenset(SLOT_CONTENT) | frozenset(k for k, v in SITE_BLOCKS.items() if "header" in v["zones"] and not v.get("container"))


# --- Style & advanced settings ---------------------------------------------------

def _px(label, lo, hi):
    return F("number", label, min=lo, max=hi, unit="px")


STYLE_GROUPS: dict[str, dict[str, dict]] = {
    "Yazı": {
        "font_family": F("select", "Yazı tipi", choices={"": "Tema", "sans": "Gövde yazı tipi", "heading": "Başlık yazı tipi"}),
        "font_size": _px("Yazı boyutu", 8, 120),
        "font_weight": F("select", "Kalınlık", choices={"": "Varsayılan", "300": "İnce", "400": "Normal", "500": "Orta", "600": "Yarı kalın", "700": "Kalın", "800": "Çok kalın", "900": "Siyah"}),
        "line_height": F("number", "Satır aralığı", min=0.8, max=3, step=0.05),
        "letter_spacing": F("number", "Harf aralığı (px)", min=-5, max=20, step=0.5),
        "text_transform": F("select", "Harf", choices={"": "Normal", "uppercase": "BÜYÜK", "lowercase": "küçük", "capitalize": "Baş Harfler"}),
        "text_color": F("color", "Yazı rengi"),
        "text_align": F("select", "Hizalama", choices={"": "Varsayılan", **ALIGN, "justify": "İki yana"}),
    },
    "Arka plan": {
        "bg_color": F("color", "Arka plan rengi"),
        "bg_gradient_from": F("color", "Renk geçişi: başlangıç"),
        "bg_gradient_to": F("color", "Renk geçişi: bitiş"),
        "bg_gradient_angle": F("number", "Renk geçişi açısı", min=0, max=360, unit="°"),
        "bg_image": F("image", "Arka plan görseli"),
        "bg_size": F("select", "Görsel boyutu", choices={"": "Kapla", "contain": "Sığdır", "auto": "Orijinal"}),
        "bg_position": F("select", "Görsel konumu", choices={"": "Orta", "top": "Üst", "bottom": "Alt", "left": "Sol", "right": "Sağ"}),
        "bg_fixed": F("bool", "Sabit arka plan (paralaks)"),
        "overlay_color": F("color", "Karartma rengi"),
        "overlay_opacity": F("number", "Karartma (%)", min=0, max=100),
    },
    "Boşluk & boyut": {
        "padding_top": _px("İç boşluk üst", 0, 400), "padding_bottom": _px("İç boşluk alt", 0, 400),
        "padding_left": _px("İç boşluk sol", 0, 200), "padding_right": _px("İç boşluk sağ", 0, 200),
        "margin_top": _px("Dış boşluk üst", -200, 400), "margin_bottom": _px("Dış boşluk alt", -200, 400),
        "width": F("select", "Genişlik", choices={"": "Normal (site genişliği)", "narrow": "Dar", "wide": "Geniş", "full": "Tam ekran"}),
        "max_width": _px("En fazla genişlik", 0, 2400),
        "min_height": _px("En az yükseklik", 0, 2000),
        "content_valign": F("select", "İçerik dikey hizalama", choices={"": "Üst", "center": "Orta", "end": "Alt"}),
    },
    "Kenarlık & gölge": {
        "border_width": _px("Kenarlık kalınlığı", 0, 20),
        "border_style": F("select", "Kenarlık stili", choices={"": "Düz", "dashed": "Kesikli", "dotted": "Noktalı"}),
        "border_color": F("color", "Kenarlık rengi"),
        "radius": _px("Köşe yuvarlığı", 0, 200),
        "shadow": F("select", "Gölge", choices={"": "Yok", "sm": "Hafif", "md": "Orta", "lg": "Belirgin", "xl": "Çok belirgin"}),
        "hover_shadow": F("select", "Üzerine gelince gölge", choices={"": "Değişmesin", "md": "Orta", "lg": "Belirgin", "xl": "Çok belirgin"}),
        "hover_scale": F("number", "Üzerine gelince büyüme (%)", min=90, max=120),
    },
}
STYLE_FIELDS: dict[str, dict] = {k: v for group in STYLE_GROUPS.values() for k, v in group.items()}

ADVANCED_FIELDS: dict[str, dict] = {
    "animation": F("select", "Giriş animasyonu", choices={"": "Yok", "fade": "Belir", "slide-up": "Aşağıdan kay", "slide-left": "Sağdan kay", "slide-right": "Soldan kay", "zoom": "Büyüyerek"}),
    "animation_delay": F("number", "Animasyon gecikmesi (ms)", min=0, max=3000, step=50),
    "animation_duration": F("number", "Animasyon süresi (ms)", min=100, max=3000, step=50),
    "hide_desktop": F("bool", "Bilgisayarda gizle"),
    "hide_tablet": F("bool", "Tablette gizle"),
    "hide_mobile": F("bool", "Telefonda gizle"),
    "starts_at": F("datetime", "Yayın başlangıcı"),
    "ends_at": F("datetime", "Yayın bitişi"),
    "langs": F("select", "Yalnızca bu dilde göster", choices={"": "Tüm diller", "tr": "Türkçe", "en": "English", "ar": "العربية"}),
    "anchor": F("text", "Bağlantı çıpası (#)", max=60, pattern="anchor"),
    "aria_label": F("text", "Erişilebilirlik etiketi", max=120),
    "css_class": F("text", "CSS sınıfı", max=80, pattern="css_class"),
}


def catalog() -> dict:
    return {
        "blocks": {k: {key: v for key, v in spec.items()} for k, spec in BLOCKS.items()},
        "style_groups": STYLE_GROUPS,
        "advanced": ADVANCED_FIELDS,
        "devices": list(DEVICES),
        "langs": list(LANGS),
        "limits": {"blocks": MAX_BLOCKS, "depth": MAX_DEPTH},
        "content_zones": list(CONTENT_ZONES),
        "header_slot_children": sorted(HEADER_SLOT_CHILDREN),
    }


# --- Validation -----------------------------------------------------------------

def _value(spec: dict, raw: Any, where: str) -> Any:
    """One field value, cleaned, or None when empty. Raises BlockError when invalid."""
    kind = spec["kind"]
    if raw is None or raw == "" or raw == []:
        if spec.get("required"):
            raise BlockError(f"{where}: {spec['label']} zorunlu")
        return None
    try:
        if kind in ("text", "textarea"):
            text = sanitize_public_text(str(raw)) or ""
            if kind == "text":
                text = text.replace("\n", " ")
            text = text[: spec.get("max", 500)]
            pattern = spec.get("pattern")
            if pattern == "anchor" and text and not _ANCHOR.fullmatch(text):
                raise BlockError(f"{where}: çıpa yalnız küçük harf, rakam ve tire içerebilir")
            if pattern == "css_class" and text and not _CSS_CLASS.fullmatch(text):
                raise BlockError(f"{where}: CSS sınıfı geçersiz")
            return text or None
        if kind == "richtext":
            return (sanitize_long_text(str(raw), spec.get("max", 30000)) or None)
        if kind == "url":
            return validate_link(str(raw))[:500]
        if kind == "image":
            return validate_image_url(str(raw))
        if kind == "video":
            if isinstance(raw, dict):  # already-saved value {"provider", "id", "url"}
                raw = raw.get("url") or ""
            provider, video_id = parse_video_url(str(raw))
            return {"provider": provider, "id": video_id, "url": str(raw).strip()[:300]}
        if kind == "color":
            value = str(raw).strip()
            if not _HEX.fullmatch(value):
                raise BlockError(f"{where}: {spec['label']} #RRGGBB biçiminde olmalı")
            return value.upper()
        if kind == "select":
            value = str(raw)
            if value not in spec["choices"]:
                raise BlockError(f"{where}: {spec['label']} için geçersiz seçim")
            return value or None
        if kind == "number":
            value = float(raw)
            if value != value:  # NaN
                raise ValueError
            value = min(max(value, spec.get("min", value)), spec.get("max", value))
            return int(value) if value == int(value) and spec.get("step", 1) >= 1 else round(value, 3)
        if kind == "bool":
            return bool(raw) if isinstance(raw, bool) else str(raw).lower() in ("1", "true", "on", "yes")
        if kind == "campaign":
            return str(UUID(str(raw)))
        if kind == "campaigns":
            if not isinstance(raw, list):
                raise ValueError
            return [str(UUID(str(v))) for v in raw][:48]
        if kind == "datetime":
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).isoformat()
        if kind == "list":
            if not isinstance(raw, list):
                raise ValueError
            items = []
            for index, item in enumerate(raw[: spec.get("max_items", 20)]):
                if not isinstance(item, dict):
                    continue
                items.append(_fields(spec["fields"], item, f"{where} › {index + 1}"))
            if len(items) < spec.get("min_items", 0):
                raise BlockError(f"{where}: en az {spec['min_items']} öğe gerekli")
            return items
    except BlockError:
        raise
    except (TypeError, ValueError) as exc:
        raise BlockError(f"{where}: {spec['label']} geçersiz ({exc})") from exc
    raise BlockError(f"{where}: bilinmeyen alan türü")


def _fields(specs: dict, raw: dict, where: str) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    out = {}
    for key, spec in specs.items():
        value = _value(spec, raw.get(key), where)
        if value is not None:
            out[key] = value
    return out


def _translations(specs: dict, raw: Any, where: str) -> dict:
    """Per-language overrides of translatable text fields (top level and list items by index)."""
    if not isinstance(raw, dict):
        return {}
    out = {}
    for lang, values in raw.items():
        if lang not in LANGS or not isinstance(values, dict):
            continue
        cleaned = {}
        for key, value in values.items():
            spec = specs.get(key)
            if spec and spec.get("translatable") and spec["kind"] in ("text", "textarea", "richtext"):
                cleaned_value = _value({**spec, "required": False}, value, where)
                if cleaned_value:
                    cleaned[key] = cleaned_value
            elif spec and spec["kind"] == "list" and isinstance(value, list):
                items = []
                for item in value[: spec.get("max_items", 20)]:
                    item = item if isinstance(item, dict) else {}
                    items.append({k: _value({**s, "required": False}, item.get(k), where)
                                  for k, s in spec["fields"].items()
                                  if s.get("translatable") and item.get(k)})
                if any(items):
                    cleaned[key] = items
        if cleaned:
            out[lang] = cleaned
    return out


def _style(raw: Any, where: str) -> dict:
    if not isinstance(raw, dict):
        return {}
    out = {}
    for device in DEVICES:
        values = _fields(STYLE_FIELDS, raw.get(device) or {}, f"{where} › stil")
        if values:
            out[device] = values
    return out


def _block(raw: Any, depth: int, counter: list[int], seen: set[str], parent_type: Optional[str], kind: str = "page") -> dict:
    if not isinstance(raw, dict):
        raise BlockError("Geçersiz blok")
    counter[0] += 1
    if counter[0] > MAX_BLOCKS:
        raise BlockError(f"Bir sayfada en fazla {MAX_BLOCKS} blok olabilir")
    block_type = raw.get("type")
    spec = BLOCKS.get(block_type)
    if not spec:
        raise BlockError(f"Bilinmeyen blok türü: {block_type}")
    if spec.get("parent") and parent_type != spec["parent"]:
        raise BlockError(f"{spec['label']} yalnızca {BLOCKS[spec['parent']]['label']} bloğunun içinde olabilir")
    if kind == "header":
        if parent_type is None and block_type != "header_row":
            raise BlockError("Header yalnızca Header satırlarından oluşur; öğeleri satırların alanlarına ekleyin")
        if parent_type == "header_slot" and block_type not in HEADER_SLOT_CHILDREN:
            raise BlockError(f"{spec['label']} header içinde kullanılamaz")
    elif kind not in spec.get("zones", CONTENT_ZONES):
        raise BlockError(f"{spec['label']} bu sayfada kullanılamaz")
    block_id = str(raw.get("id") or "")
    if not _ID.fullmatch(block_id) or block_id in seen:
        raise BlockError("Blok kimliği geçersiz veya tekrar ediyor")
    seen.add(block_id)
    where = spec["label"]
    block = {
        "id": block_id,
        "type": block_type,
        "props": _fields(spec["fields"], raw.get("props") or {}, where),
        "style": _style(raw.get("style"), where),
        "advanced": _fields(ADVANCED_FIELDS, raw.get("advanced") or {}, f"{where} › gelişmiş"),
    }
    translations = _translations(spec["fields"], raw.get("translations"), where)
    if translations:
        block["translations"] = translations
    if spec.get("container"):
        if depth >= MAX_DEPTH:
            raise BlockError(f"Bloklar en fazla {MAX_DEPTH} seviye iç içe olabilir")
        children = raw.get("children") or []
        if not isinstance(children, list):
            raise BlockError("Geçersiz alt bloklar")
        if spec.get("child_type"):
            expected = spec.get("child_count") or len((block["props"].get("ratio") or "1-1").split("-"))
            children = [c for c in children if isinstance(c, dict) and c.get("type") == spec["child_type"]]
            while len(children) < expected:
                children.append({"id": f"{block_id[:30]}-c{len(children)}", "type": spec["child_type"], "children": []})
            children = children[:expected]
        block["children"] = [_block(child, depth + 1, counter, seen, block_type, kind) for child in children]
    return block


def validate_blocks(raw: Any, kind: str = "page") -> list[dict]:
    if kind not in PAGE_KINDS:
        raise BlockError("Bilinmeyen sayfa türü")
    if not isinstance(raw, list):
        raise BlockError("Sayfa içeriği bir blok listesi olmalı")
    if len(json.dumps(raw, ensure_ascii=False)) > MAX_TREE_BYTES:
        raise BlockError("Sayfa çok büyük; bazı blokları ayrı sayfalara taşıyın")
    counter, seen = [0], set()
    return [_block(item, 1, counter, seen, None, kind) for item in raw]


def default_home_blocks(template: str) -> list[dict]:
    """Home page exactly as the template draws it today (texts come from site settings)."""
    from app.services.site import DEFAULT_SECTIONS

    variant = template if template in ("klasik", "kategori", "sade") else "klasik"
    blocks = [{"id": "home-hero", "type": "hero", "props": {"variant": variant, "show_form": True}}]
    if variant != "klasik":
        blocks.append({"id": "home-form", "type": "quick_donation", "props": {},
                       "style": {"desktop": {"width": "narrow", "padding_top": 48}}})
    mapping = {"stats": "stats", "categories": "categories", "campaigns": "campaigns", "zakat": "zakat_band",
               "cta": "cta_band", "news": "news", "trust": "trust"}
    return blocks + [{"id": f"home-{key}", "type": mapping[key], "props": {}} for key in DEFAULT_SECTIONS[variant]]


def home_blocks_for(org) -> list[dict]:
    """Default home blocks following the organisation's current section order."""
    blocks = default_home_blocks(org.template)
    sections = (org.site or {}).get("home_sections")
    if not sections:
        return blocks
    mapping = {"stats": "stats", "categories": "categories", "campaigns": "campaigns", "zakat": "zakat_band",
               "cta": "cta_band", "news": "news", "trust": "trust"}
    head = [b for b in blocks if b["type"] in ("hero", "quick_donation")]
    return head + [{"id": f"home-{key}", "type": mapping[key], "props": {}} for key in sections if key in mapping]


def page_blocks_from_body(title: str, body: Optional[str]) -> list[dict]:
    """A legacy page (title + text) as blocks."""
    blocks = [{"id": "page-title", "type": "heading", "props": {"text": title or "Sayfa", "level": "h1"},
               "style": {"desktop": {"width": "narrow", "padding_top": 48}}}]
    if body:
        blocks.append({"id": "page-body", "type": "richtext", "props": {"text": body},
                       "style": {"desktop": {"width": "narrow", "padding_bottom": 48}}})
    return blocks


def _row(row_id: str, props: dict, slots: list[list[dict]], **extra) -> dict:
    return {"id": row_id, "type": "header_row", "props": props, **extra, "children": [
        {"id": f"{row_id}-{name}", "type": "header_slot", "children": items}
        for name, items in zip(("left", "center", "right"), slots)
    ]}


def default_header_blocks() -> list[dict]:
    """Today's fixed header as blocks: contact bar + logo, menu, language and donate button."""
    tablet_down = {"hide_tablet": True, "hide_mobile": True}
    return [
        _row("hdr-top", {"tone": "dark", "height": 40, "border": False}, [
            [{"id": "hdr-contact", "type": "contact_info", "props": {"layout": "inline"}}],
            [],
            [{"id": "hdr-account", "type": "account_links", "props": {"layout": "inline"}}],
        ], style={"desktop": {"font_size": 13}}, advanced={"hide_mobile": True}),
        _row("hdr-main", {"tone": "light", "height": 76, "sticky": True, "shrink": True, "center_align": "right"}, [
            [{"id": "hdr-logo", "type": "logo", "props": {}}],
            [{"id": "hdr-menu", "type": "nav_menu", "props": {"source": "header", "mobile": "drawer", "drawer_donate": True}}],
            [{"id": "hdr-lang", "type": "language_switcher", "props": {}, "advanced": tablet_down},
             {"id": "hdr-donate", "type": "donate_button", "props": {"style": "primary"}, "advanced": tablet_down}],
        ]),
    ]


def default_footer_blocks() -> list[dict]:
    """Today's fixed footer as blocks: about + social, footer menu, contact, copyright."""
    return [{
        "id": "ftr-main", "type": "section", "props": {"tone": "dark"},
        "style": {"desktop": {"padding_top": 56, "padding_bottom": 16, "margin_top": 64}},
        "children": [
            {"id": "ftr-cols", "type": "columns", "props": {"ratio": "1-1-1", "gap": 40}, "children": [
                {"id": "ftr-col1", "type": "column", "children": [
                    {"id": "ftr-logo", "type": "logo", "props": {"light": True, "show_about": True}},
                    {"id": "ftr-social", "type": "social_icons", "props": {"style": "pill"}},
                ]},
                {"id": "ftr-col2", "type": "column", "children": [
                    {"id": "ftr-menu", "type": "nav_menu", "props": {"source": "footer", "layout": "vertical", "mobile": "inline"}},
                ]},
                {"id": "ftr-col3", "type": "column", "children": [
                    {"id": "ftr-contact", "type": "contact_info", "props": {"layout": "stacked", "show_address": True}},
                    {"id": "ftr-account", "type": "account_links", "props": {"layout": "inline"}},
                ]},
            ]},
            {"id": "ftr-copy", "type": "copyright", "props": {"show_powered": True}, "style": {"desktop": {"margin_top": 40}}},
        ],
    }]
