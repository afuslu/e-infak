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
LANG_NAMES = {"tr": "Türkçe", "en": "English", "ar": "العربية", "de": "Deutsch", "fr": "Français", "ru": "Русский",
              "fa": "فارسی", "ur": "اردو", "id": "Bahasa Indonesia", "ms": "Bahasa Melayu", "bs": "Bosanski",
              "sq": "Shqip", "ku": "Kurdî"}
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
TONES = {"": "Yok", "light": "Beyaz", "soft": "Açık ana renk", "brand": "Ana renk", "accent": "Vurgu rengi", "dark": "Koyu"}
# What a header slot may hold (besides the site elements below).
SLOT_CONTENT = ("buttons", "heading", "richtext", "spacer", "divider")

BUTTON_STYLES = {
    "primary": "Ana renk",
    "accent": "Vurgu rengi",
    "danger": "Acil / Kırmızı",
    "gradient": "Renk geçişli (Gradient)",
    "soft": "Yumuşak ton",
    "outline": "Çerçeveli",
    "glass": "Cam efektli (Glass)",
    "dark": "Koyu",
    "light": "Açık",
    "link": "Bağlantı",
}
ALIGN = {"left": "Sola", "center": "Ortaya", "right": "Sağa"}

BLOCKS: dict[str, dict] = {
    # Hero & slider
    "hero": {
        "label": "Kapak", "group": "Kapak & slider", "icon": "🖼️",
        "fields": {
            "variant": F("select", "Görünüm", choices={
                "vuslat": "Vitrin kartı + thumbnail (Vuslat tarzı)",
                "klasik": "Büyük görsel + bağış formu",
                "kategori": "Büyük görsel + butonlar",
                "sade": "Sade, yan görselli",
                "glass": "Cam kutulu tam görsel",
                "centered": "Ortalı geniş kapak",
                "split_form": "Kapak içi hızlı bağış formlu (Split)",
                "video_hero": "Video arka planlı sinematik kapak",
                "bento_hero": "Bento mozaik kapak (sol metin + sağ kutular)",
                "split_floating": "Yüzen istatistik rozetli kapak",
                "minimal_typo": "Tipografi odaklı editorial kapak",
                "duotone": "Marka renkli modern kapak (Duotone)",
                "coverflow": "3D Coverflow kampanya kapağı",
                "peek": "Sinematik yan taşmalı kapak (Peek)",
            }, default="klasik"),
            "badge": F("text", "Üst etiket", max=80, translatable=True),
            "title": F("text", "Başlık", max=160, translatable=True, placeholder="Boşsa site kapak başlığı"),
            "subtitle": F("textarea", "Açıklama", max=400, translatable=True),
            "image_url": F("image", "Görsel"),
            "mobile_image_url": F("image", "Görsel (telefon)"),
            "video_url": F("video", "Arka plan videosu (MP4 / YouTube)"),
            "cta_label": F("text", "Buton yazısı", max=40, translatable=True),
            "cta_url": F("url", "Buton bağlantısı"),
            "quick_amounts": F("text", "Hızlı tutar butonları (virgülle)", max=60, placeholder="100, 250, 500"),
            "countdown_to": F("datetime", "Geri sayım hedef tarihi"),
            "stat_value": F("text", "Yüzen rozet değeri (ör. 12.400+)", max=24),
            "stat_label": F("text", "Yüzen rozet yazısı (ör. Mutlu Bağışçı)", max=60, translatable=True),
            "align": F("select", "Metin konumu", choices=ALIGN, default="left"),
            "overlay": F("number", "Karartma (%)", min=0, max=90, default=35),
            "height": F("select", "Yükseklik", choices={"": "Varsayılan", "sm": "Alçak", "md": "Orta", "lg": "Yüksek", "screen": "Tam ekran", "poster": "Afiş oranı (16:5)"}, default=""),
            "mobile_height": F("select", "Telefon yüksekliği", choices={"auto": "Otomatik", "sm": "Kısa", "md": "Orta", "lg": "Uzun"}, default="auto"),
            "effect": F("select", "Geçiş efekti", choices={"": "Varsayılan", "slide": "Kaydır", "fade": "Solarak", "zoom": "Yakınlaşarak (Ken Burns)", "flip": "Yükselerek", "parallax": "Parallax", "blur": "Bulanık geçiş"}, default=""),
            "nav": F("select", "Alt gezinme", choices={"": "Varsayılan", "dots": "Noktalar", "thumbs": "Küçük görseller", "tabs": "Başlık sekmeleri", "numbers": "Sayısal sayaç", "progress": "İlerleme çubuğu"}, default=""),
            "arrow_style": F("select", "Ok stili", choices={"round": "Yuvarlak", "square": "Kare", "minimal": "Minimalist", "ghost": "Çerçevesiz"}, default="round"),
            "show_form": F("bool", "Bağış formunu göster", default=True),
            # Slides after the cover (1st slide = the fields above). A slide linked to a
            # campaign falls back to that campaign's image, title and summary for empty fields.
            "slides": F("list", "Ek slaytlar (kapaktan sonra)", max_items=12, item_label="title", fields={
                "campaign_id": F("campaign", "Kampanyaya bağla (boş alanlar kampanyadan dolar)"),
                "image_url": F("image", "Görsel (bilgisayar)"),
                "mobile_image_url": F("image", "Görsel (telefon)"),
                "video_url": F("video", "Arka plan videosu (MP4)"),
                "badge": F("text", "Üst etiket", max=80, translatable=True),
                "title": F("text", "Başlık", max=160, translatable=True),
                "text": F("textarea", "Açıklama", max=400, translatable=True),
                "button_label": F("text", "1. buton yazısı", max=40, translatable=True),
                "button_url": F("url", "1. buton bağlantısı"),
                "button2_label": F("text", "2. buton yazısı", max=40, translatable=True),
                "button2_url": F("url", "2. buton bağlantısı"),
                "quick_amounts": F("text", "Hızlı tutarlar (virgülle)", max=60),
                "countdown_to": F("datetime", "Geri sayım tarihi"),
            }),
            "slider": F("bool", "Ek slayt yoksa görselli aktif kampanyaları otomatik ekle", default=True),
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
                "video_url": F("video", "Arka plan videosu (MP4 / YouTube)"),
                "countdown_to": F("datetime", "Geri sayım hedef tarihi"),
                "quick_amounts": F("text", "Hızlı tutar butonları (virgülle)", max=60, placeholder="100, 250, 500"),
                "align": F("select", "Metin konumu", choices=ALIGN, default="left"),
                "overlay": F("number", "Karartma (%)", min=0, max=90, default=45),
                "bg_color": F("color", "Slayt arka plan rengi (bölünmüş / kart)"),
                "image_pos": F("select", "Görsel yönü (bölünmüş / kart)", choices={"right": "Sağda", "left": "Solda"}, default="right"),
            }),
            "layout": F("select", "Görünüm", choices={
                "overlay": "Tam genişlik (yazı görsel üstünde)",
                "split": "Bölünmüş (açık zemin)",
                "card": "Vitrin kartı (Vuslat tarzı: sol metin, sağ görsel)",
                "glass": "Cam kart (görsel üstünde buzlu kutu)",
                "minimal": "Sade alt şerit (ince bilgi bandı)",
                "stacked": "Katmanlı (üst görsel + alt bilgi kartı)",
                "coverflow": "3D Coverflow vitrini",
                "peek": "Ortada odaklı (yanlar taşmalı)",
                "bento": "Bento vitrin (ana slayt + sağ mini kartlar)",
                "vertical_thumbs": "Dikey küçük resimli vitrin",
                "dual_sync": "Çift yönlü senkron (Dual-Sync Split)",
                "magazine": "Editoryal dergi vitrini",
                "duotone": "Marka renkli modern kapak",
                "video_hero": "Video arka planlı kapak",
            }, default="card"),
            "height": F("select", "Yükseklik", choices={"sm": "Alçak", "md": "Orta", "lg": "Yüksek", "screen": "Tam ekran", "poster": "Afiş oranı (görsel kırpılmaz, 16:5)"}, default="lg"),
            "mobile_height": F("select", "Telefon yüksekliği", choices={"auto": "Otomatik", "sm": "Kısa", "md": "Orta", "lg": "Uzun"}, default="auto"),
            "autoplay": F("bool", "Otomatik geçiş", default=True),
            "show_pause": F("bool", "Oynat / Duraklat butonu göster", default=True),
            "interval": F("number", "Geçiş süresi (sn)", min=2, max=20, default=6),
            "effect": F("select", "Geçiş efekti", choices={
                "slide": "Kaydır",
                "fade": "Solarak",
                "zoom": "Yakınlaşarak (Ken Burns)",
                "kenburns_slow": "Sinematik yavaş Ken Burns",
                "flip": "Yükselerek",
                "parallax": "Derinlikli kayma (Parallax)",
                "cards": "Kart destesi",
                "cube": "3D Küp dönüşü",
                "curtain": "Perde açılışı (Curtain)",
                "blur": "Bulanık geçiş",
                "vertical": "Dikey kaydırma",
            }, default="fade"),
            "arrows": F("bool", "Oklar", default=True),
            "arrow_style": F("select", "Ok stili", choices={"round": "Yuvarlak", "square": "Kare", "minimal": "Minimalist", "ghost": "Çerçevesiz"}, default="round", show_if={"arrows": True}),
            "dots": F("bool", "Alt gezinme", default=True),
            "nav": F("select", "Alt gezinme türü", choices={
                "dots": "Noktalar",
                "thumbs": "Küçük görseller (thumbnail)",
                "tabs": "Başlık sekmeleri",
                "numbers": "Sayısal sayaç (01 / 04)",
                "progress": "İlerleme çubuğu",
                "ring": "Dairesel zamanlayıcı halkası",
            }, default="thumbs"),
        },
    },
    "carousel": {
        "label": "Çoklu kart carousel", "group": "Kapak & slider", "icon": "🎠",
        "help": "Yan yana birden fazla kartı kaydıran carousel; projeler, hizmetler, hikayeler veya görseller için.",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=160, translatable=True),
            "subtitle": F("textarea", "Alt açıklama", max=300, translatable=True),
            "items": F("list", "Kartlar", max_items=24, min_items=1, item_label="title", fields={
                "image_url": F("image", "Görsel"),
                "mobile_image_url": F("image", "Görsel (telefon)"),
                "video_url": F("video", "Video (MP4 / YouTube)"),
                "badge": F("text", "Etiket", max=40, translatable=True),
                "title": F("text", "Başlık", max=120, translatable=True),
                "subtitle": F("text", "Alt bilgi / Unvan", max=100, translatable=True),
                "text": F("textarea", "Açıklama", max=300, translatable=True),
                "rating": F("number", "Puan (1-5 yıldız)", min=0, max=5),
                "button_label": F("text", "Buton yazısı", max=40, translatable=True),
                "button_url": F("url", "Buton bağlantısı"),
                "campaign_id": F("campaign", "Kampanyaya bağla (isteğe bağlı)"),
            }),
            "look": F("select", "Kart görünümü", choices={
                "card": "Klasik kart",
                "overlay": "Görsel üstünde yazı",
                "minimal": "Sade (çerçevesiz)",
                "featured": "Büyük odaklı kart",
                "pill": "Yatay (sol görsel, sağ metin)",
                "glass": "Cam kart (Glassmorphism)",
                "testimonial": "Yorum / Referans (yıldızlı)",
                "logo": "Logo / Partner şeridi",
                "coverflow": "3D Coverflow",
                "center": "Ortadaki büyük (Center-Mode)",
                "deck": "Kart destesi (Stacked Deck)",
                "ticker": "Sürekli akan şerit (Marquee)",
                "multirow": "2 satırlı kaydırmalı",
            }, default="card"),
            "columns": F("number", "Aynı anda görünen (bilgisayar)", min=1, max=5, default=3),
            "mobile_columns": F("select", "Mobilde görünen", choices={"1": "1 kart", "2": "2 kart"}, default="1"),
            "gap": F("select", "Kart aralığı", choices={"sm": "Dar", "md": "Orta", "lg": "Geniş"}, default="md"),
            "aspect": F("select", "Görsel oranı", choices={"16/9": "16:9", "4/3": "4:3", "1/1": "Kare", "3/4": "Dikey"}, default="4/3"),
            "autoplay": F("bool", "Otomatik kaydır", default=True),
            "show_pause": F("bool", "Oynat / Duraklat butonu", default=True),
            "loop": F("bool", "Sonsuz döngü", default=True),
            "interval": F("number", "Geçiş süresi (sn)", min=2, max=20, default=5, show_if={"autoplay": True}),
            "speed": F("number", "Akan şerit hızı (sn)", min=5, max=60, default=20),
            "pause_on_hover": F("bool", "Üzerine gelince duraklat", default=True),
            "arrows": F("bool", "Oklar", default=True),
            "arrow_pos": F("select", "Ok konumu", choices={"sides": "Yanlarda yüzen", "bottom": "Altta sağda"}, default="sides", show_if={"arrows": True}),
            "arrow_style": F("select", "Ok stili", choices={"round": "Yuvarlak", "square": "Kare", "minimal": "Minimalist"}, default="round", show_if={"arrows": True}),
            "dots": F("bool", "Alt gezinme", default=True),
            "nav": F("select", "Alt gezinme türü", choices={
                "dots": "Noktalar",
                "progress": "İlerleme çubuğu",
                "numbers": "Sayısal sayaç (01 / 04)",
                "none": "Yok",
            }, default="dots"),
        },
    },
    # Donation
    "quick_donation": {
        "label": "Hızlı bağış formu", "group": "Bağış", "icon": "💳",
        "fields": {
            "campaign_id": F("campaign", "Kampanya", placeholder="Boşsa ilk aktif kampanya"),
            "title": F("text", "Başlık", max=120, translatable=True),
            "look": F("select", "Görünüm", choices={
                "card": "Kart kutu (2 adımlı)",
                "band": "Geniş renkli bant",
                "compact": "Sade kompakt",
                "split": "Bölünmüş (sol kampanya özeti, sağ form)",
                "inline": "Yatay tek satır hızlı şerit",
                "glass": "Cam efektli modern form (Glass)",
                "single_step": "Tek adımlı hızlı form",
            }, default="card"),
            "suggested_amounts": F("text", "Özel tutar butonları (virgülle)", max=80, placeholder="150, 300, 500, 1000"),
            "amount_labels": F("text", "Tutar etki etiketleri (tutar:etiket)", max=180, placeholder="150:1 İftar, 300:1 Kumanya, 1000:Su Hissesi", translatable=True),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "allow_campaign_select": F("bool", "Form içinden kampanya seçtir", default=False),
            "show_progress": F("bool", "Kampanya ilerleme çubuğunu göster", default=False),
            "show_frequency": F("bool", "Tek seferlik / Düzenli hatırlatma sekmesi", default=False),
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
            "layout": F("select", "Düzen", choices={
                "grid": "Izgara",
                "list": "Liste (geniş kartlar)",
                "carousel": "Kaydırmalı",
                "bento": "Bento vitrin (ilk kart büyük)",
                "rows": "Kompakt satır listesi",
                "masonry": "Akışkan çok sütun (Masonry)",
            }, default="grid"),
            "card_style": F("select", "Kart stili", choices={
                "classic": "Klasik",
                "compact": "Kompakt",
                "bordered": "Çerçeveli",
                "overlay": "Görsel üstünde yazı (Overlay)",
                "minimal": "Sade editoryal (Çerçevesiz)",
                "glass": "Cam efektli (Glass)",
            }, default="classic"),
            "autoplay": F("bool", "Otomatik kaydır", default=True, show_if={"layout": "carousel"}),
            "arrows": F("bool", "Oklar", default=True, show_if={"layout": "carousel"}),
            "dots": F("bool", "Alt gezinme", default=True, show_if={"layout": "carousel"}),
            "nav": F("select", "Alt gezinme türü", choices={"dots": "Noktalar", "progress": "İlerleme çubuğu", "numbers": "Sayısal sayaç"}, default="dots", show_if={"layout": "carousel"}),
            "columns": F("number", "Sütun (bilgisayar)", min=1, max=4, default=3),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "show_filters": F("bool", "Kategori filtre sekmeleri göster", default=False),
            "show_quick_amounts": F("bool", "Kart üzerinde hızlı tutar butonları", default=False),
            "show_days_left": F("bool", "Kalan gün / hedef rozetleri", default=True),
            "show_progress": F("bool", "Toplanan tutarı göster", default=True),
            "show_all_link": F("bool", "\"Tümü\" bağlantısı", default=True),
        },
    },
    "campaign_card": {
        "label": "Tek kampanya", "group": "Bağış", "icon": "🎗️",
        "fields": {
            "campaign_id": F("campaign", "Kampanya (boşsa öne çıkan gösterilir)"),
            "layout": F("select", "Düzen", choices={
                "wide": "Geniş (bölünmüş kart)",
                "card": "Dikey kart",
                "overlay": "Görsel üstü yazılı banner (Overlay)",
                "glass": "Cam efektli vitrin (Glass)",
                "strip": "Kompakt yatay şerit",
                "urgent": "Acil yardım vurgulu vitrin",
            }, default="wide"),
            "image_side": F("select", "Görsel yönü", choices={"left": "Solda", "right": "Sağda"}, default="left", show_if={"layout": "wide"}),
            "kicker": F("text", "Üst rozet", max=40, translatable=True),
            "title": F("text", "Özel başlık (isteğe bağlı)", max=120, translatable=True),
            "summary": F("textarea", "Özel açıklama (isteğe bağlı)", max=300, translatable=True),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "show_progress": F("bool", "İlerleme çubuğunu göster", default=True),
            "show_quick_amounts": F("bool", "Hızlı tutar butonlarını göster", default=True),
            "show_details_button": F("bool", "\"Detayları Gör\" butonu", default=True),
            "fallback_featured": F("bool", "Kampanya seçilmezse öne çıkanı göster", default=True),
        },
    },
    "categories": {
        "label": "Bağış kategorileri", "group": "Bağış", "icon": "🗂️",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "subtitle": F("textarea", "Alt açıklama", max=300, translatable=True),
            "look": F("select", "Görünüm", choices={
                "grid": "İkonlu kutular",
                "cards": "Büyük vitrin kartları",
                "pills": "Yatay hap butonlar",
                "photo": "Görselli / Fotoğraflı kartlar",
                "bento": "Bento mozaik (ilk kart büyük)",
                "compact": "Kompakt yatay satırlar",
                "carousel": "Kaydırmalı şerit (Carousel)",
                "glass": "Cam efektli koyu vitrin",
            }, default="grid"),
            "columns": F("number", "Sütun (bilgisayar)", min=2, max=5, default=4),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "show_description": F("bool", "Açıklamaları göster", default=True),
            "show_all_link": F("bool", "\"Tümü\" bağlantısı", default=False),
            "items": F("list", "Özel kategoriler (boşsa sistem kategorileri kullanılır)", max_items=16, item_label="title", fields={
                "icon": F("text", "İkon (emoji)", max=12, default="🤲"),
                "image_url": F("image", "Görsel (fotoğraflı/büyük kart için)"),
                "badge": F("text", "Rozet", max=30, translatable=True),
                "title": F("text", "Başlık", max=80, required=True, translatable=True),
                "description": F("textarea", "Açıklama", max=200, translatable=True),
                "url": F("url", "Özel bağlantı"),
                "campaign_id": F("campaign", "Kampanyaya bağla"),
            }),
        },
    },
    "featured_campaign": {
        "label": "Acil kampanya vitrini", "group": "Bağış", "icon": "🚨",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "campaign_id": F("campaign", "Kampanya", placeholder="Boşsa öne çıkan ilk kampanya"),
            "look": F("select", "Görünüm", choices={
                "split": "50/50 Bölünmüş vitrin",
                "overlay": "Tam ekran acil banner (Overlay)",
                "alert_bar": "İnce acil uyarı bandı",
                "glass": "Cam efektli acil kart",
                "countdown": "Geri sayımlı kriz vitrini",
                "donate_box": "Sağda hızlı bağış kutulu vitrin",
            }, default="split"),
            "image_side": F("select", "Görsel yönü", choices={"left": "Solda", "right": "Sağda"}, default="left"),
            "title": F("text", "Özel başlık (isteğe bağlı)", max=140, translatable=True),
            "summary": F("textarea", "Özel açıklama (isteğe bağlı)", max=350, translatable=True),
            "video_url": F("video", "Video (MP4 / YouTube)"),
            "countdown_to": F("datetime", "Geri sayım hedef tarihi (boşsa kampanya bitiş tarihi)"),
            "quick_amounts": F("text", "Hızlı tutar butonları (virgülle)", max=80, placeholder="150, 300, 500, 1000"),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "show_progress": F("bool", "İlerleme çubuğunu göster", default=True),
            "show_countdown": F("bool", "Geri sayım sayacını göster", default=True),
            "show_details_button": F("bool", "\"Detayları Gör\" butonu", default=True),
        },
    },
    "zakat_band": {
        "label": "Zekat bandı", "group": "Bağış", "icon": "🌙",
        "fields": {
            "kicker": F("text", "Üst etiket", max=60, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "text": F("textarea", "Metin", max=300, translatable=True),
            "nisab_note": F("text", "Nisap bilgisi", max=120, translatable=True, help="Örn. 85 gr altın / 595 gr gümüş nisap eşiği"),
            "button_label": F("text", "1. buton yazısı", max=40, translatable=True),
            "button_url": F("url", "1. buton bağlantısı", default="/zekat-hesapla"),
            "button2_label": F("text", "2. buton yazısı", max=40, translatable=True),
            "button2_url": F("url", "2. buton bağlantısı", default="/bagis?kategori=zekat"),
            "image_url": F("image", "Arka plan görseli", help="Fotoğraf veya iki sütunlu görünümde kullanılır"),
            "quick_amounts": F("text", "Örnek varlık tutarları", default="50000,100000,250000,500000", help="Hesaplayıcı görünümünde virgülle ayrılmış tutarlar"),
            "look": F("select", "Görünüm", choices={
                "band": "Renkli şerit",
                "card": "Beyaz kart",
                "split": "İki sütun",
                "calculator": "İnteraktif mini hesaplayıcı",
                "nisab_cards": "Nisap & varlık kartları",
                "photo": "Fotoğraf arka planlı",
                "glass": "Cam efektli (Glassmorphism)",
                "strip": "İnce hatırlatma çubuğu",
            }, default="band"),
        },
    },
    "donation_cards": {
        "label": "Bağış kartları (tutar + sepete ekle)", "group": "Bağış", "icon": "🛒",
        "help": "Her kartta tutar, para birimi, niyet, adet/hisse ve süre seçilip sepete eklenir.",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "source": F("select", "Hangi kampanyalar", choices={
                "selected": "Seçtiklerim (aşağıdaki sırayla)",
                "tabs": "Sekmeler (kampanya etiketine göre)",
                "category": "Kategoriye göre",
                "featured": "Öne çıkanlar",
                "latest": "En yeniler",
            }, default="selected"),
            "campaign_ids": F("campaigns", "Seçilen kampanyalar", show_if={"source": "selected"}),
            "category_slug": F("text", "Kategori kodu", max=60, show_if={"source": "category"}, help="Örn. kurban, su-kuyusu, egitim, acil-yardim"),
            "tabs": F("list", "Sekmeler", max_items=12, item_label="label", show_if={"source": "tabs"}, fields={
                "label": F("text", "Sekme adı", max=40, translatable=True),
                "tag": F("text", "Kampanya etiketi", max=40, help="Bu etiketi taşıyan kampanyalar sekmede listelenir"),
            }),
            "limit": F("number", "En fazla kart", min=1, max=48, default=12),
            "layout": F("select", "Düzen", choices={
                "grid": "Izgara",
                "carousel": "Kaydırmalı",
                "list": "Yatay liste (satır)",
                "compact": "Kompakt hızlı katalog",
                "overlay": "Görsel üstü (Overlay)",
                "featured_first": "İlk kart geniş + altı ızgara",
            }, default="grid"),
            "card_style": F("select", "Kart stili", choices={
                "classic": "Klasik",
                "minimal": "Sade",
                "highlight": "Vurgulu",
                "bordered": "Üst şeritli",
                "glass": "Cam efektli",
            }, default="classic"),
            "autoplay": F("bool", "Otomatik kaydır", default=True, show_if={"layout": "carousel"}),
            "columns": F("number", "Sütun (bilgisayar)", min=2, max=4, default=3),
            "currency_switcher": F("bool", "Kartların üstünde TL / USD / EUR seçici", default=False),
            "show_progress": F("bool", "Hedef ilerleme çubuğunu göster", default=False),
            "show_summary": F("bool", "Kısa açıklamayı göster", default=False),
            "allow_recurring": F("bool", "Tek Seferlik / Aylık seçici", default=False),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True, placeholder="Bağış Yap"),
            "cta_label": F("text", "Alt buton yazısı", max=40, translatable=True, placeholder="Tüm Kampanyaları Gör"),
            "cta_url": F("url", "Alt buton bağlantısı", default="/kampanyalar"),
            "cards": F("list", "Kart ayarları (kampanya başına, isteğe bağlı)", max_items=48, item_label="note", fields={
                "campaign_id": F("campaign", "Kampanya"),
                "note": F("text", "Sabit bilgi (ör. Keçi · Afrika)", max=80, translatable=True),
                "unit_amount": F("number", "Sabit tutar (kampanya para biriminde; boşsa bağışçı yazar)", min=0, max=10_000_000, step=0.01),
                "quantity": F("select", "Miktar seçimi", choices={"": "Yok", "adet": "Adet", "hisse": "Hisse"}, default=""),
                "max_quantity": F("number", "En fazla adet/hisse", min=1, max=100, default=21),
                "niyet": F("text", "Niyet seçenekleri (virgülle)", max=200, help="ör. Adak, Akika, Şükür, Nafile, Sadaka, Şifa"),
                "durations": F("text", "Süre seçenekleri, ay (virgülle; tutar aylıktır)", max=60, help="ör. 12, 18, 24, 36"),
                "shares_total": F("number", "Toplam hisse (hisse çubuğu)", min=0, max=100_000),
                "shares_taken": F("number", "Alınan hisse (boşsa toplanan tutardan hesaplanır)", min=0, max=100_000),
                "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            }),
        },
    },
    # Banners
    "banner": {
        "label": "Banner", "group": "Banner", "icon": "🏷️",
        "fields": {
            "layout": F("select", "Tür", choices={
                "image": "Görselli",
                "color": "Renkli metin",
                "split": "Görsel + metin yan yana",
                "gradient": "Renk geçişli (Gradient)",
                "glass": "Görsel üstü cam kutu",
                "boxed": "Kutu / Yuvarlatılmış vitrin",
                "video": "Video arka planlı",
                "stats_banner": "İstatistik / rozet vurgulu",
                "minimal": "Minimal çerçeveli",
                "poster": "Tıklanabilir afiş (Poster)",
            }, default="image"),
            "tone": F("select", "Renk tonu", choices={
                "brand": "Ana renk",
                "dark": "Koyu",
                "red": "Acil / Kırmızı",
                "accent": "Vurgu rengi",
                "light": "Açık",
            }, default="brand"),
            "height": F("select", "Yükseklik", choices={"sm": "Kompakt", "md": "Orta", "lg": "Geniş"}, default="md"),
            "reverse": F("bool", "Görseli sağa al", default=False, show_if={"layout": "split"}),
            "image_url": F("image", "Görsel"),
            "mobile_image_url": F("image", "Telefon görseli"),
            "video_url": F("url", "Video URL (MP4 / WebM)", show_if={"layout": "video"}),
            "kicker": F("text", "Üst etiket", max=60, translatable=True),
            "title": F("text", "Başlık", max=160, translatable=True),
            "text": F("textarea", "Metin", max=500, translatable=True),
            "stat_value": F("text", "Vurgu sayısı (ör. 120.000+)", max=30, show_if={"layout": "stats_banner"}),
            "stat_label": F("text", "Vurgu açıklaması", max=80, translatable=True, show_if={"layout": "stats_banner"}),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "button_url": F("url", "Buton bağlantısı"),
            "button2_label": F("text", "2. buton yazısı", max=40, translatable=True),
            "button2_url": F("url", "2. buton bağlantısı"),
            "campaign_id": F("campaign", "Kampanyaya bağla (bağış butonu ve tutar çubuğu)"),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
        },
    },
    "cta_band": {
        "label": "Çağrı bandı", "group": "Banner", "icon": "📣",
        "fields": {
            "kicker": F("text", "Üst etiket", max=60, translatable=True),
            "title": F("text", "Başlık", max=160, translatable=True, placeholder="Boşsa site çağrı bandı"),
            "text": F("textarea", "Metin", max=400, translatable=True),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "button_url": F("url", "Buton bağlantısı"),
            "button2_label": F("text", "2. buton yazısı", max=40, translatable=True),
            "button2_url": F("url", "2. buton bağlantısı"),
            "image_url": F("image", "Arka plan / yan görsel"),
            "trust_note": F("text", "Güven notu", max=120, translatable=True, help="Örn. %100 şeffaf · Güvenli 3D Ödeme"),
            "quick_amounts": F("text", "Hızlı tutarlar (virgülle)", max=80, default="250,500,1000", show_if={"look": "quick_amounts"}),
            "look": F("select", "Görünüm", choices={
                "brand": "Ana renk",
                "dark": "Koyu",
                "soft": "Açık ton",
                "bordered": "Çerçeveli",
                "centered": "Ortalı çift butonlu",
                "glass": "Cam efektli (Glass)",
                "split": "Görselli iki sütun",
                "strip": "İnce hatırlatma çubuğu",
                "quick_amounts": "Hızlı tutar çipli",
            }, default="brand"),
        },
    },
    "notice": {
        "label": "Duyuru kutusu", "group": "Banner", "icon": "ℹ️",
        "fields": {
            "tone": F("select", "Tür", choices={
                "info": "Bilgi",
                "success": "Başarı",
                "warning": "Uyarı",
                "danger": "Önemli",
                "brand": "Ana renk",
                "neutral": "Nötr",
            }, default="info"),
            "look": F("select", "Görünüm", choices={
                "soft": "Yumuşak renkli",
                "accent_left": "Sol kalın şeritli",
                "solid": "Dolgulu yüksek kontrast",
                "outline": "Çerçeveli",
                "official": "Resmi duyuru (rozet + buton)",
            }, default="soft"),
            "icon": F("text", "Simge (emoji, boşsa otomatik)", max=8),
            "badge": F("text", "Rozet / Tarih", max=40, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "text": F("textarea", "Metin", max=600, translatable=True),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "button_url": F("url", "Buton bağlantısı"),
            "closable": F("bool", "Kapatılabilir (×)", default=False),
        },
    },
    "announcement_bar": {
        "label": "Duyuru çubuğu (kapatılabilir)", "group": "Banner", "icon": "📢", "zones": SITE_ZONES,
        "help": "Header'ın en üstüne de konabilir; ziyaretçi kapatınca seçilen süre boyunca gizli kalır.",
        "fields": {
            "look": F("select", "Görünüm", choices={
                "solid": "Klasik tek satır",
                "pill_cta": "Rozet + ayrı buton",
                "gradient": "Gradyan geçişli",
                "countdown": "Geri sayımlı şerit",
                "rotator": "Çoklu dönen duyuru",
            }, default="solid"),
            "badge": F("text", "Rozet (ör. ACİL, YENİ)", max=24, translatable=True),
            "text": F("text", "Duyuru", max=160, translatable=True, required=True),
            "url": F("url", "Tıklanınca git"),
            "button_label": F("text", "Buton yazısı (isteğe bağlı)", max=32, translatable=True),
            "end_date": F("text", "Geri sayım bitiş (YYYY-AA-GG)", max=32, show_if={"look": "countdown"}, help="Örn. 2027-06-15"),
            "items": F("list", "Dönen duyurular", max_items=10, item_label="text", show_if={"look": "rotator"}, fields={
                "badge": F("text", "Rozet", max=20, translatable=True),
                "text": F("text", "Metin", max=160, translatable=True),
                "url": F("url", "Bağlantı"),
            }),
            "tone": F("select", "Renk", choices={"danger": "Kırmızı", "rose": "Gül kırmızısı", "brand": "Ana renk", "accent": "Vurgu rengi", "dark": "Koyu", "warning": "Sarı"}, default="danger"),
            "icon": F("text", "Simge (emoji, isteğe bağlı)", max=4),
            "sticky": F("bool", "Üstte sabit kalsın", default=False),
            "closable": F("bool", "Kapatma düğmesi (×)", default=True),
            "hide_days": F("number", "Kapatınca kaç gün gizlensin (0 = oturum boyu)", min=0, max=60, default=1, show_if={"closable": True}),
        },
    },
    # Text & media
    "heading": {
        "label": "Başlık", "group": "Metin & medya", "icon": "🔠",
        "fields": {
            "look": F("select", "Görünüm", choices={
                "plain": "Klasik düz",
                "underline": "Altı vurgu çizgili",
                "side_bar": "Sol kalın şeritli",
                "badge": "Hap rozetli üst etiket",
                "gradient": "Renk geçişli (Gradient)",
                "split_action": "Sağda aksiyon linkli",
                "divider": "İki yanı çizgili",
            }, default="plain"),
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "text": F("text", "Başlık", max=200, translatable=True, required=True),
            "level": F("select", "Seviye", choices={"h1": "H1", "h2": "H2", "h3": "H3", "h4": "H4", "h5": "H5", "h6": "H6"}, default="h2"),
            "subtitle": F("textarea", "Alt metin", max=400, translatable=True),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
            "link_label": F("text", "Sağ link yazısı", max=40, translatable=True, show_if={"look": "split_action"}),
            "link_url": F("url", "Sağ link bağlantısı", show_if={"look": "split_action"}),
        },
    },
    "richtext": {
        "label": "Metin", "group": "Metin & medya", "icon": "📝",
        "fields": {
            "look": F("select", "Görünüm", choices={
                "plain": "Standart düz",
                "article": "Makale (dar okuma sütunu)",
                "two_col": "2 sütunlu dergi",
                "card": "Kart içinde",
                "lead": "Büyük giriş metni",
                "bordered": "Sol çizgili vurgu",
            }, default="plain"),
            "text": F("richtext", "Metin", max=30000, translatable=True, help="Paragrafları boş satırla ayırın. \"## \" / \"### \" ara başlık, \"- \" madde, \"> \" alıntı, \"---\" çizgi, **kalın**."),
            "width": F("select", "Genişlik", choices={"full": "Tam genişlik", "narrow": "Okuma genişliği (dar)"}, default="full"),
            "size": F("select", "Yazı boyutu", choices={"sm": "Küçük", "md": "Orta", "lg": "Büyük"}, default="md"),
            "dropcap": F("bool", "İlk harfi büyüt (Drop cap)", default=False),
        },
    },
    "image": {
        "label": "Görsel", "group": "Metin & medya", "icon": "🖼",
        "fields": {
            "look": F("select", "Görünüm", choices={
                "rounded": "Yuvarlatılmış",
                "full_bleed": "Tam genişlik (kenarsız)",
                "framed": "Çerçeveli kart",
                "circle": "Dairesel",
                "overlay": "Görsel üstü yazılı",
                "shadow": "Gölgeli vitrin",
            }, default="rounded"),
            "image_url": F("image", "Görsel", required=True),
            "mobile_image_url": F("image", "Görsel (telefon)"),
            "alt": F("text", "Alternatif metin", max=200, translatable=True),
            "badge": F("text", "Rozet (isteğe bağlı)", max=40, translatable=True),
            "caption": F("text", "Alt yazı", max=200, translatable=True),
            "link": F("url", "Tıklanınca git"),
            "aspect": F("select", "Oran", choices={
                "auto": "Orijinal", "16/9": "16:9", "4/3": "4:3", "3/2": "3:2", "3/4": "3:4 (Dikey)", "1/1": "Kare", "21/9": "Geniş",
            }, default="auto"),
            "width": F("select", "Genişlik", choices={
                "full": "Tam genişlik", "lg": "Büyük (max 900px)", "md": "Orta (max 640px)", "sm": "Küçük (max 400px)",
            }, default="full"),
            "align": F("select", "Hizalama", choices=ALIGN, default="center"),
        },
    },
    "image_text": {
        "label": "Görsel + metin", "group": "Metin & medya", "icon": "📰",
        "fields": {
            "image_url": F("image", "Görsel"),
            "mobile_image_url": F("image", "Görsel (telefon)"), "alt": F("text", "Alternatif metin", max=200, translatable=True),
            "image_side": F("select", "Görsel tarafı", choices={"left": "Solda", "right": "Sağda"}, default="left"),
            "look": F("select", "Görünüm", choices={
                "plain": "Sade",
                "card": "Kart içinde",
                "overlap": "Çerçeveli / taşan",
                "full_bleed": "Tam kenarlı split",
                "badge_card": "Yüzen etki rozetli",
                "dark": "Koyu vitrin",
            }, default="plain"),
            "ratio": F("select", "Sütun oranı", choices={"50/50": "50 / 50 (Eşit)", "40/60": "40 / 60 (Metin geniş)", "60/40": "60 / 40 (Görsel geniş)"}, default="50/50"),
            "aspect": F("select", "Görsel oranı", choices={"auto": "Orijinal", "16/9": "16:9", "4/3": "4:3", "1/1": "Kare"}, default="auto"),
            "stat_value": F("text", "Etki sayısı (ör. 15.000+)", max=30, show_if={"look": "badge_card"}),
            "stat_label": F("text", "Etki açıklaması", max=80, translatable=True, show_if={"look": "badge_card"}),
            "kicker": F("text", "Üst başlık", max=60, translatable=True), "title": F("text", "Başlık", max=160, translatable=True),
            "text": F("richtext", "Metin", max=6000, translatable=True),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True), "button_url": F("url", "Buton bağlantısı"),
            "button2_label": F("text", "2. buton yazısı", max=40, translatable=True), "button2_url": F("url", "2. buton bağlantısı"),
        },
    },
    "video": {
        "label": "Video", "group": "Metin & medya", "icon": "▶️",
        "fields": {
            "look": F("select", "Görünüm", choices={
                "plain": "Klasik",
                "cinema": "Koyu sinema vitrini",
                "poster_play": "Özel kapak + oynat butonu",
                "split": "Video + metin yan yana",
                "card": "Kart içinde",
                "vertical": "Dikey (Shorts / Reels)",
            }, default="plain"),
            "url": F("video", "YouTube veya Vimeo bağlantısı"),
            "mp4_url": F("url", "Doğrudan MP4 video URL (isteğe bağlı)"),
            "poster_url": F("image", "Özel kapak görseli (Poster)"),
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "badge": F("text", "Rozet (ör. VİDEO ARŞİVİ)", max=40, translatable=True),
            "title": F("text", "Başlık", max=160, translatable=True),
            "text": F("textarea", "Açıklama", max=500, translatable=True),
            "aspect": F("select", "Oran", choices={"16/9": "16:9 (Yatay)", "4/3": "4:3", "21/9": "21:9 (Sinema)", "9/16": "9:16 (Dikey)"}, default="16/9"),
            "width": F("select", "Genişlik", choices={"full": "Tam genişlik", "lg": "Büyük (max 900px)", "md": "Orta (max 640px)"}, default="full"),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "button_url": F("url", "Buton bağlantısı"),
        },
    },
    "buttons": {
        "label": "Butonlar", "group": "Metin & medya", "icon": "🔘",
        "fields": {
            "items": F("list", "Butonlar", max_items=6, min_items=1, item_label="label", fields={
                "icon": F("text", "Simge (emoji)", max=4),
                "label": F("text", "Yazı", max=40, translatable=True),
                "url": F("url", "Bağlantı"),
                "style": F("select", "Stil", choices=BUTTON_STYLES, default="primary"),
                "new_tab": F("bool", "Yeni sekmede aç"),
            }),
            "layout": F("select", "Dizilim", choices={"row": "Yan yana", "stack": "Alt alta"}, default="row"),
            "size": F("select", "Boyut", choices={"sm": "Küçük", "md": "Orta", "lg": "Büyük"}, default="md"),
            "shape": F("select", "Köşe şekli", choices={"rounded": "Yuvarlatılmış", "pill": "Hap (Tam yuvarlak)", "square": "Kare"}, default="rounded"),
            "full_width": F("bool", "Tam genişlik", default=False),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
            "mobile_align": F("select", "Mobilde hizalama", choices={"": "Bilgisayarla aynı", "left": "Sola", "center": "Ortala", "right": "Sağa"}, default=""),
        },
    },
    # Trust
    "stats": {
        "label": "İstatistikler", "group": "Güven & etki", "icon": "📊",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "text": F("textarea", "Açıklama", max=300, translatable=True),
            "mode": F("select", "Veri", choices={"auto": "Otomatik (kampanyalardan)", "manual": "Elle"}, default="auto"),
            "items": F("list", "Sayılar", max_items=6, item_label="label", show_if={"mode": "manual"}, fields={
                "value": F("text", "Değer", max=20), "label": F("text", "Açıklama", max=60, translatable=True),
                "icon_url": F("image", "Simge görseli"),
            }),
            "variant": F("select", "Görünüm", choices={"": "Tema", "card": "Beyaz kutu (simgeli, sayarak artan)", "gradient": "Renk geçişli kutular", "ring": "Dairesel ilerleme halkaları"}, default=""),
        },
    },
    "steps": {
        "label": "Nasıl bağış yapılır?", "group": "Güven & etki", "icon": "🪜",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "text": F("textarea", "Açıklama", max=400, translatable=True),
            "image_url": F("image", "Görsel (Split görünümü için)"),
            "look": F("select", "Görünüm", choices={
                "grid": "Yatay adımlar",
                "vertical": "Dikey çizelge",
                "cards": "Kutulu kartlar",
                "channels": "Bağış kanalları / yöntemleri",
                "split": "Sol tanıtım & görsel + sağ adımlar",
                "compact_bar": "Kompakt adım şeridi",
                "dark_cards": "Koyu zemin adımlar",
            }, default="grid"),
            "items": F("list", "Adımlar (boşsa hazır 4 adım)", max_items=6, item_label="title", fields={
                "icon": F("text", "Simge (emoji)", max=4),
                "badge": F("text", "Rozet (ör. En hızlı)", max=24, translatable=True),
                "title": F("text", "Başlık", max=60, translatable=True),
                "text": F("textarea", "Açıklama", max=220, translatable=True),
                "url": F("url", "Tıklanınca git"),
                "link_label": F("text", "Bağlantı metni", max=32, translatable=True),
            }),
            "button_label": F("text", "Alt buton metni", max=40, translatable=True),
            "button_url": F("url", "Alt buton linki"),
        },
    },
    "testimonials": {
        "label": "Teşekkür mesajları", "group": "Güven & etki", "icon": "💬",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "text": F("textarea", "Açıklama", max=400, translatable=True),
            "summary_badge": F("text", "Özet puan rozeti (ör. 4.9/5 · 1.200+ Bağışçı)", max=60, translatable=True),
            "look": F("select", "Görünüm", choices={
                "carousel": "Kaydırmalı (Carousel)",
                "grid": "Izgara kartlar",
                "featured_grid": "Öne çıkan + kompakt kartlar",
                "marquee": "Sürekli akan şerit (Marquee)",
                "quote": "Büyük odaklı alıntı",
                "masonry": "Asimetrik duvar (Masonry)",
                "spotlight": "Koyu vitrin alıntısı",
            }, default="carousel"),
            "autoplay": F("bool", "Otomatik kaydır", default=True, show_if={"look": "carousel"}),
            "items": F("list", "Mesajlar (boşsa Görünüm ayarlarındakiler)", max_items=12, item_label="name", fields={
                "image_url": F("image", "Profil fotoğrafı (isteğe bağlı)"),
                "rating": F("number", "Puan (1-5 yıldız)", min=0, max=5, default=5),
                "badge": F("text", "Kampanya / doğrulama rozeti", max=32, translatable=True),
                "quote": F("textarea", "Mesaj", max=400, translatable=True),
                "name": F("text", "İsim", max=80),
                "role": F("text", "Unvan / şehir", max=80, translatable=True),
                "date": F("text", "Tarih", max=24),
            }),
        },
    },
    "faq": {
        "label": "Sık sorulan sorular", "group": "Etkileşim", "icon": "❓",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "text": F("textarea", "Açıklama", max=300, translatable=True),
            "look": F("select", "Görünüm", choices={
                "accordion": "Akordeon",
                "two_col": "2 sütunlu açık kartlar",
                "minimal": "Sade çizgili liste",
                "cards": "Çerçeveli kutu kartlar",
                "searchable": "Aramalı SSS",
                "categorized": "Kategorili / sekmeli SSS",
                "split": "Sol destek CTA + sağ akordeon",
                "dark_cards": "Koyu zemin SSS",
            }, default="accordion"),
            "open_first": F("bool", "İlk soru açık başlasın", default=False),
            "items": F("list", "Sorular", max_items=40, min_items=1, item_label="question", fields={
                "category": F("text", "Kategori (sekmeler için)", max=40, translatable=True),
                "question": F("text", "Soru", max=200, translatable=True),
                "answer": F("richtext", "Cevap", max=3000, translatable=True),
            }),
            "button_label": F("text", "Destek butonu metni", max=40, translatable=True),
            "button_url": F("url", "Destek butonu linki"),
        },
    },
    "news": {
        "label": "Haberler", "group": "Haber & iletişim", "icon": "🗞️",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "text": F("textarea", "Açıklama", max=300, translatable=True),
            "look": F("select", "Görünüm", choices={
                "cards": "Klasik kartlar",
                "magazine": "Dergi (1 manşet + yan liste)",
                "list": "Yatay haber listesi",
                "overlay": "Görsel üstü başlık kartları",
                "compact": "Kompakt duyuru akışı",
            }, default="cards"),
            "limit": F("number", "Adet", min=1, max=12, default=3),
            "columns": F("number", "Sütun (ızgara için)", min=2, max=4, default=3),
            "layout": F("select", "Düzen", choices={"auto": "4'ten fazlaysa kaydırmalı", "grid": "Izgara", "carousel": "Kaydırmalı"}, default="auto"),
            "show_date": F("bool", "Tarihi göster", default=True),
            "show_summary": F("bool", "Özeti göster", default=True),
            "links": F("select", "Haber adresleri", choices={"haberler": "/haberler/haber-adi", "root": "/haber-adi (eski site adresleri)"}, default="haberler"),
            "all_label": F("text", "\"Tümü\" bağlantı yazısı", max=40, translatable=True),
            "all_url": F("url", "\"Tümü\" bağlantısı", placeholder="/haberler"),
        },
    },
    "contact_form": {
        "label": "Mesaj formu", "group": "Haber & iletişim", "icon": "✉️",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=160, translatable=True),
            "text": F("textarea", "Açıklama", max=400, translatable=True),
            "look": F("select", "Görünüm", choices={
                "split_dark": "Solda koyu panel + sağda form",
                "centered": "Ortalı tek kart form",
                "split_info": "Sol iletişim bilgileri + sağda form",
                "minimal": "Sade / açık zemin form",
                "callback": "Hızlı geri arama formu (Sizi arayalım)",
            }, default="split_dark"),
            "image_url": F("image", "Yan görsel", show_if={"look": "split_dark"}),
            "badge_value": F("text", "Görsel rozeti: değer (ör. 70k)", max=12, show_if={"look": "split_dark"}),
            "badge_text": F("text", "Görsel rozeti: yazı", max=60, translatable=True, show_if={"look": "split_dark"}),
            "contact_phone": F("text", "İletişim telefonu (boşsa site ayarı)", max=40, show_if={"look": "split_info"}),
            "contact_email": F("text", "İletişim e-postası (boşsa site ayarı)", max=120, show_if={"look": "split_info"}),
            "contact_address": F("textarea", "Adres (boşsa site ayarı)", max=240, translatable=True, show_if={"look": "split_info"}),
            "working_hours": F("text", "Çalışma saatleri", max=100, translatable=True, show_if={"look": "split_info"}),
            "subjects": F("text", "Konu seçenekleri (virgülle ayırın)", max=300, translatable=True),
            "ask_email": F("bool", "E-posta sorulsun", default=True),
            "kvkk_text": F("text", "KVKK / onay metni (isteğe bağlı)", max=220, translatable=True),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "success_text": F("text", "Gönderim sonrası mesaj", max=220, translatable=True),
        },
    },
    "gallery_strip": {
        "label": "Galeri şeridi", "group": "Haber & iletişim", "icon": "📷",
        "help": "Galeri sayfanızdaki fotoğraf ve videoları otomatik olarak sergiler.",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "text": F("textarea", "Açıklama", max=300, translatable=True),
            "look": F("select", "Görünüm", choices={
                "marquee": "Akan şerit (tek sıra)",
                "dual_marquee": "Çift sıra ters akan duvar",
                "carousel": "Oklarla kaydırmalı şerit",
                "filmstrip": "Tam genişlik film şeridi",
                "grid": "Kompakt ızgara bandı",
                "polaroid": "Polaroid albüm kartları",
            }, default="marquee"),
            "aspect": F("select", "Görsel oranı", choices={
                "4/3": "4:3 Yatay",
                "1/1": "1:1 Kare",
                "16/9": "16:9 Geniş",
                "3/4": "3:4 Dikey",
                "mixed": "Karışık oranlar",
            }, default="4/3"),
            "speed": F("select", "Akış hızı", choices={
                "slow": "Yavaş",
                "normal": "Normal",
                "fast": "Hızlı",
            }, default="normal", show_if={"look": ["marquee", "dual_marquee", "filmstrip"]}),
            "album": F("text", "Albüm filtresi (boşsa tümü)", max=80, translatable=True),
            "limit": F("number", "Adet", min=1, max=24, default=10),
            "caption_mode": F("select", "Başlık görünümü", choices={
                "hover": "Üzerine gelince",
                "always": "Her zaman görünür",
                "none": "Gizli",
            }, default="hover"),
            "show_album": F("bool", "Albüm etiketini göster", default=False),
            "include_videos": F("bool", "Videoları da dahil et", default=False),
            "click_action": F("select", "Tıklama davranışı", choices={
                "lightbox": "Büyüt (Lightbox)",
                "gallery": "Galeri sayfasına git",
            }, default="lightbox"),
            "show_all_link": F("bool", "'Tüm galeri' bağlantısını göster", default=True),
            "all_label": F("text", "Bağlantı metni", max=40, translatable=True, show_if={"show_all_link": True}),
            "all_url": F("url", "Bağlantı adresi (boşsa /galeri)", show_if={"show_all_link": True}),
        },
    },
    "trust": {
        "label": "Güven bandı", "group": "Güven & etki", "icon": "🔒",
        "fields": {
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=120, translatable=True),
            "text": F("textarea", "Metin", max=300, translatable=True),
            "look": F("select", "Görünüm", choices={
                "plain": "Klasik 3'lü bilgi bandı",
                "strip": "Kompakt güven şeridi",
                "cards": "Kutulu güven kartları",
                "seals": "Ödeme & sertifika mühürleri",
                "dark_band": "Koyu kurumsal güven bandı",
                "split_guarantee": "Büyük güvence + 2x2 maddeler",
            }, default="plain"),
            "show_contact": F("bool", "Adres ve iletişim bilgilerini otomatik ekle", default=True),
            "show_payment_badges": F("bool", "Ödeme / SSL mühürlerini göster", default=False),
            "items": F("list", "Özel güven maddeleri (boşsa otomatik)", max_items=8, item_label="title", fields={
                "icon": F("text", "Simge (emoji)", max=4),
                "badge": F("text", "Rozet (ör. 256-Bit)", max=24, translatable=True),
                "title": F("text", "Başlık", max=80, translatable=True),
                "text": F("textarea", "Açıklama", max=220, translatable=True),
                "url": F("url", "Doğrulama / detay linki"),
            }),
            "button_label": F("text", "Alt buton metni", max=40, translatable=True),
            "button_url": F("url", "Alt buton linki"),
        },
    },
    # Layout
    "section": {
        "label": "Bölüm (kapsayıcı)", "group": "Düzen", "icon": "🧱", "container": True,
        "help": "İçine başlık, metin, sütunlar veya başka bloklar yerleştirebileceğiniz bölüm kapsayıcısı.",
        "fields": {
            "look": F("select", "Görünüm", choices={
                "plain": "Düz bölüm",
                "card": "Yüzen kart (gölgeli kutu)",
                "bordered": "Çerçeveli kutu",
                "glass": "Cam / buzlu kutu",
                "gradient": "Gradyan vurgulu bölüm",
                "pattern": "Desenli kurumsal bölüm",
            }, default="plain"),
            "tone": F("select", "Zemin", choices=TONES, default="", help="Tema renklerini izler; özel renk için Stil sekmesini kullanın"),
            "width": F("select", "İçerik genişliği", choices={
                "boxed": "Standart konteyner",
                "narrow": "Dar (okuma alanı)",
                "wide": "Geniş vitrin",
                "full": "Tam genişlik",
            }, default="boxed"),
            "padding_y": F("select", "Dikey iç boşluk", choices={
                "none": "Yok",
                "compact": "Kompakt",
                "normal": "Normal",
                "spacious": "Geniş",
            }, default="normal"),
            "gap": F("number", "Bloklar arası boşluk", min=0, max=64, default=16, unit="px"),
            "min_height": F("select", "En az yükseklik", choices={
                "auto": "Otomatik",
                "sm": "Küçük (280px)",
                "md": "Orta (420px)",
                "lg": "Büyük (560px)",
            }, default="auto"),
            "valign": F("select", "Dikey hizalama", choices={"start": "Üst", "center": "Orta", "end": "Alt"}, default="start", show_if={"min_height": ["sm", "md", "lg"]}),
            "shape_top": F("select", "Üst şekil ayırıcı", choices={"none": "Yok", "wave": "Dalga", "curve": "Eğri", "slant": "Çapraz"}, default="none"),
            "shape_bottom": F("select", "Alt şekil ayırıcı", choices={"none": "Yok", "wave": "Dalga", "curve": "Eğri", "slant": "Çapraz"}, default="none"),
        },
    },
    "columns": {
        "label": "Sütunlar", "group": "Düzen", "icon": "🏛️", "container": True, "child_type": "column",
        "zones": SITE_ZONES,
        "fields": {
            "ratio": F("select", "Sütun oranları", choices={
                "1-1": "1/2 + 1/2",
                "1-2": "1/3 + 2/3",
                "2-1": "2/3 + 1/3",
                "1-3": "1/4 + 3/4",
                "3-1": "3/4 + 1/4",
                "2-3": "2/5 + 3/5",
                "3-2": "3/5 + 2/5",
                "1-1-1": "3 eşit",
                "1-2-1": "1/4 + 1/2 + 1/4",
                "2-1-1": "1/2 + 1/4 + 1/4",
                "1-1-2": "1/4 + 1/4 + 1/2",
                "1-1-1-1": "4 eşit",
                "1-1-1-1-1": "5 eşit",
                "1-1-1-1-1-1": "6 eşit",
            }, default="1-1"),
            "card_style": F("select", "Sütun görünümü", choices={
                "plain": "Düz",
                "cards": "Gölgeli kartlar",
                "bordered": "Çerçeveli kutular",
                "divided": "Aralarında dikey çizgi",
            }, default="plain"),
            "gap": F("number", "Aralık (px)", min=0, max=96, default=24),
            "valign": F("select", "Dikey hizalama", choices={"start": "Üst", "center": "Orta", "end": "Alt", "stretch": "Uzat"}, default="start"),
            "stack_on": F("select", "Alt alta geçiş", choices={"tablet": "Tablet ve telefonda", "mobile": "Yalnızca telefonda", "never": "Hiçbir zaman"}, default="tablet"),
            "reverse_mobile": F("bool", "Mobilde sırayı ters çevir (sağdaki üstte)", default=False),
        },
    },
    "column": {
        "label": "Sütun", "group": "Düzen", "icon": "▥", "container": True, "hidden": True, "parent": "columns",
        "fields": {
            "look": F("select", "Sütun kutu görünümü", choices={
                "inherit": "Varsayılan",
                "card": "Beyaz kart",
                "soft": "Açık ana renk",
                "bordered": "Çerçeveli",
                "dark": "Koyu kutu",
            }, default="inherit"),
            "padding": F("select", "İç boşluk", choices={
                "none": "Yok",
                "sm": "Küçük",
                "md": "Orta",
                "lg": "Geniş",
            }, default="none"),
            "gap": F("number", "Bloklar arası dikey boşluk", min=0, max=64, default=12, unit="px"),
            "valign": F("select", "İçerik dikey hizası", choices={"start": "Üst", "center": "Orta", "end": "Alt"}, default="start"),
        },
    },
    "spacer": {
        "label": "Boşluk", "group": "Düzen", "icon": "↕️",
        "fields": {
            "mode": F("select", "Yön / Tür", choices={
                "vertical": "Dikey boşluk",
                "horizontal": "Yatay boşluk (satır içi)",
                "flex": "Esnek itici boşluk (Header/satır)",
            }, default="vertical"),
            "size": F("select", "Hazır boyut", choices={
                "custom": "Özel (px)",
                "xs": "Çok küçük (16px)",
                "sm": "Küçük (32px)",
                "md": "Orta (48px)",
                "lg": "Büyük (80px)",
                "xl": "Çok büyük (120px)",
            }, default="custom", show_if={"mode": "vertical"}),
            "height": F("number", "Yükseklik (px)", min=4, max=400, default=48, show_if={"mode": "vertical", "size": "custom"}),
            "height_tablet": F("number", "Tablet yüksekliği (isteğe bağlı)", min=0, max=400, unit="px", show_if={"mode": "vertical", "size": "custom"}),
            "height_mobile": F("number", "Telefon yüksekliği (isteğe bağlı)", min=0, max=400, unit="px", show_if={"mode": "vertical", "size": "custom"}),
            "width": F("number", "Genişlik (px)", min=4, max=400, default=24, show_if={"mode": "horizontal"}),
            "visibility": F("select", "Görünürlük", choices={
                "all": "Her cihazda",
                "desktop": "Yalnızca bilgisayar ve tablet",
                "mobile": "Yalnızca telefon",
            }, default="all"),
        },
    },
    "divider": {
        "label": "Ayraç", "group": "Düzen", "icon": "➖",
        "fields": {
            "look": F("select", "Ayraç türü", choices={
                "line": "Çizgi (düz / kesikli / noktalı)",
                "double": "Çift çizgi",
                "gradient": "Soluklaşan gradyan",
                "text": "Ortada yazılı ayraç",
                "icon": "Ortada simgeli ayraç",
                "dots": "Üç nokta (• • •)",
                "wave": "Dalga çizgisi",
                "accent_bar": "Kısa kalın vurgu çubuğu",
            }, default="line"),
            "line": F("select", "Çizgi stili", choices={"solid": "Düz", "dashed": "Kesikli", "dotted": "Noktalı"}, default="solid", show_if={"look": "line"}),
            "label": F("text", "Ortadaki yazı", max=60, translatable=True, show_if={"look": "text"}),
            "icon": F("text", "Simge (emoji veya ✦)", max=8, default="✦", show_if={"look": "icon"}),
            "color": F("color", "Renk"),
            "thickness": F("number", "Kalınlık (px)", min=1, max=8, default=1, show_if={"look": ["line", "double", "gradient", "accent_bar"]}),
            "width": F("number", "Genişlik (%)", min=10, max=100, default=100),
            "align": F("select", "Hizalama", choices=ALIGN, default="center"),
            "padding_y": F("select", "Dikey boşluk", choices={"none": "Yok", "sm": "Küçük", "md": "Orta", "lg": "Geniş"}, default="sm"),
            "full_width": F("bool", "Kenardan kenara tam genişlik", default=False),
        },
    },
}


# --- Header & footer ---------------------------------------------------------------

MENU_LINK_FIELDS = {
    "label": F("text", "Yazı", max=60),
    "url": F("url", "Bağlantı"),
    "group": F("text", "Sütun başlığı (mega menü)", max=40, help="Aynı başlığı taşıyan bağlantılar bir sütunda toplanır"),
    "badge": F("text", "Rozet (ör. Yeni)", max=16, translatable=True),
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
            "layout": F("select", "Yerleşim", choices={"horizontal": "Yatay (logo solda)", "stacked": "Dikey (logo üstte, ortalı)"}, default="horizontal"),
            "shape": F("select", "Logo şekli", choices={
                "contain": "Orijinal / şeffaf zemin",
                "rounded": "Yumuşak köşeli kutu",
                "circle": "Yuvarlak çerçeve",
            }, default="contain"),
            "size": F("number", "Logo boyutu", min=24, max=160, default=44, unit="px"),
            "wide": F("bool", "Yatay geniş logo (oranı korunur, boyut = yükseklik)", default=False),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
            "show_name": F("bool", "Kurum adını göster", default=True),
            "name_size": F("select", "Kurum adı boyutu", choices={"sm": "Küçük", "md": "Orta", "lg": "Büyük", "xl": "Çok büyük"}, default="md", show_if={"show_name": True}),
            "custom_name": F("text", "Özel kurum adı (boşsa site ayarı)", max=100, translatable=True, show_if={"show_name": True}),
            "show_tagline": F("bool", "Sloganı göster", default=True, show_if={"show_name": True}),
            "custom_tagline": F("text", "Özel slogan (boşsa site ayarı)", max=140, translatable=True, show_if={"show_name": True, "show_tagline": True}),
            "light": F("bool", "Koyu zemin için açık renk logo/yazı", default=False),
            "show_about": F("bool", "Altında kurum tanıtım metni (Görünüm › alt bilgi metni)", default=False),
            "url": F("url", "Bağlantı (boşsa ana sayfa /)"),
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
                "badge": F("text", "Rozet (ör. Yeni)", max=16, translatable=True),
                "new_tab": F("bool", "Yeni sekmede aç"),
                "mega": F("bool", "Mega menü (alt bağlantıları sütunlara böl)"),
                "children": F("list", "Alt bağlantılar", max_items=30, item_label="label", fields=MENU_LINK_FIELDS),
            }),
            "layout": F("select", "Yerleşim", choices={"horizontal": "Yatay", "vertical": "Dikey (alt bilgi)"}, default="horizontal"),
            "look": F("select", "Görünüm (yatay)", choices={
                "plain": "Sade metin",
                "underline": "Altı çizgili vurgu",
                "pills": "Yuvarlak hap (hover)",
                "boxed": "Kutu zemin (hover)",
                "divided": "Dikey ayraçlı",
            }, default="plain", show_if={"layout": "horizontal"}),
            "vertical_look": F("select", "Düzen (dikey)", choices={
                "list": "Tek sütun liste",
                "two_col": "2 sütunlu liste",
                "inline_dots": "Nokta ayraçlı tek satır (·)",
            }, default="list", show_if={"layout": "vertical"}),
            "size": F("select", "Yazı boyutu", choices={"sm": "Küçük", "md": "Orta", "lg": "Büyük"}, default="md"),
            "gap": F("select", "Öğeler arası boşluk", choices={"tight": "Sıkı", "normal": "Normal", "wide": "Geniş"}, default="normal", show_if={"layout": "horizontal"}),
            "align": F("select", "Hizalama (yatay)", choices=ALIGN, default="left", show_if={"layout": "horizontal"}),
            "mobile": F("select", "Tablet ve telefonda", choices={"drawer": "☰ açılır menüye dönüşsün", "inline": "Olduğu gibi görünsün", "hidden": "Gizlensin"}, default="drawer"),
            "drawer_donate": F("bool", "Açılır menüde bağış butonu", default=True, show_if={"mobile": "drawer"}),
        },
    },
    "donate_button": {
        "label": "Bağış butonu", "group": "Site öğeleri", "icon": "💚", "zones": SITE_ZONES,
        "fields": {
            "label": F("text", "Yazı", max=40, translatable=True, placeholder="Bağış Yap"),
            "url": F("url", "Bağlantı", placeholder="/kampanyalar"),
            "new_tab": F("bool", "Yeni sekmede aç", default=False),
            "style": F("select", "Görünüm", choices=BUTTON_STYLES, default="primary"),
            "size": F("select", "Boyut", choices={"sm": "Küçük", "md": "Orta", "lg": "Büyük"}, default="md"),
            "shape": F("select", "Köşe şekli", choices={"rounded": "Yumuşak köşeli", "pill": "Yuvarlak hap", "square": "Keskin köşeli"}, default="rounded"),
            "icon": F("select", "Simge", choices={
                "none": "Yok",
                "heart": "♥ Kalp",
                "pulse_heart": "♥ Nabız atan kalp (dikkat çekici)",
                "hand": "🤝 Destek eli",
                "sparkle": "✦ Yıldız",
                "shield": "🛡️ Güvenli bağış",
                "arrow": "→ Sağda ok",
            }, default="none"),
            "heart": F("bool", "♥ simgesi (eski ayar)", default=False),
            "badge": F("text", "Küçük rozet (ör. Acil, ₺500)", max=20, translatable=True),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
            "full_width": F("bool", "Tam genişlik", default=False),
        },
    },
    "language_switcher": {
        "label": "Dil seçici", "group": "Site öğeleri", "icon": "🌐", "zones": SITE_ZONES,
        "help": "Site Ayarları'nda birden fazla dil açıksa görünür",
        "fields": {
            "look": F("select", "Görünüm", choices={
                "select": "Klasik açılır liste",
                "dropdown": "Özel açılır menü (Dropdown)",
                "buttons": "Yan yana dil düğmeleri",
                "list": "Bağlantı listesi",
            }, default="select"),
            "label_mode": F("select", "Etiket biçimi", choices={
                "name": "Dil adı (Türkçe / English)",
                "code": "Kısa kod (TR / EN)",
                "flag_name": "Bayrak + Dil adı",
                "flag_code": "Bayrak + Kısa kod",
            }, default="name"),
            "show_icon": F("bool", "🌐 Küre simgesini göster", default=False, show_if={"look": ["dropdown", "select"]}),
            "size": F("select", "Boyut", choices={"sm": "Küçük", "md": "Orta"}, default="sm"),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
        },
    },
    "currency_switcher": {
        "label": "Para birimi seçici (TL / USD / EUR)", "group": "Site öğeleri", "icon": "💱", "zones": SITE_ZONES,
        "help": "Bağış kartlarındaki tutarlar ve sepet seçilen para birimiyle gösterilir (güncel TCMB kuru).",
        "fields": {
            "style": F("select", "Görünüm", choices={
                "buttons": "Yan yana düğmeler",
                "dropdown": "Özel açılır menü (Dropdown)",
                "select": "Klasik açılır liste",
                "list": "Sade bağlantı satırı (·)",
            }, default="buttons"),
            "label_mode": F("select", "Etiket biçimi", choices={
                "auto": "Otomatik (telefonda kısa, bilgisayarda tam)",
                "short": "Kısa kod (₺ TL / $ USD / € EUR)",
                "full": "Tam ad (₺ Türk Lirası / $ Dolar)",
                "symbol": "Yalnızca simge (₺ / $ / €)",
            }, default="auto"),
            "size": F("select", "Boyut", choices={"sm": "Küçük", "md": "Orta"}, default="md"),
            "light": F("bool", "Koyu zemin için açık renk", default=False),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
            "show_rate": F("bool", "Güncel kuru yanında göster", default=False),
        },
    },
    "cart_button": {
        "label": "Bağış sepeti", "group": "Site öğeleri", "icon": "🛒", "zones": SITE_ZONES,
        "fields": {
            "label": F("text", "Yazı", max=30, translatable=True, placeholder="Sepetim"),
            "show_label": F("bool", "Yazıyı göster", default=False),
            "url": F("url", "Sepet sayfası", placeholder="/bagis/sepetim"),
            "look": F("select", "Görünüm", choices={
                "icon": "Sade simge",
                "pill": "Yuvarlak hap buton",
                "boxed": "Çerçeveli kutu",
                "solid": "Dolgulu vurgu butonu",
            }, default="icon"),
            "icon": F("select", "Simge türü", choices={
                "cart": "🛒 Alışveriş / Bağış sepeti",
                "bag": "🛍️ Bağış çantası",
                "heart": "♥ İyilik kalbi",
                "gift": "🎁 Yardım paketi",
            }, default="cart"),
            "show_total": F("bool", "Sepet toplam tutarını göster", default=False),
            "show_zero": F("bool", "Sepet boşken 0 sayacını göster", default=False),
            "hide_empty": F("bool", "Sepet boşken butonu gizle", default=False),
            "size": F("select", "Boyut", choices={"sm": "Küçük", "md": "Orta", "lg": "Büyük"}, default="md"),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
        },
    },
    "social_icons": {
        "label": "Sosyal medya", "group": "Site öğeleri", "icon": "📣", "zones": SITE_ZONES,
        "fields": {
            "title": F("text", "Başlık (isteğe bağlı)", max=60, translatable=True),
            "style": F("select", "Görünüm", choices={
                "round": "Yuvarlak ikonlar",
                "square": "Kare ikonlar",
                "icons": "Sade vektör ikonlar",
                "pill": "İkon + isim kutucuğu",
                "text": "Yalnızca yazı",
            }, default="pill"),
            "colored": F("bool", "Marka renklerini kullan", default=False),
            "size": F("select", "Boyut", choices={"sm": "Küçük", "md": "Orta", "lg": "Büyük"}, default="md"),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
            "items": F("list", "Özel bağlantılar (boşsa site ayarlarından)", max_items=12, item_label="network", fields={
                "network": F("select", "Platform", choices={
                    "instagram": "Instagram",
                    "facebook": "Facebook",
                    "x": "X (Twitter)",
                    "youtube": "YouTube",
                    "whatsapp": "WhatsApp",
                    "telegram": "Telegram",
                    "linkedin": "LinkedIn",
                    "tiktok": "TikTok",
                    "threads": "Threads",
                    "pinterest": "Pinterest",
                }, default="instagram"),
                "url": F("url", "Bağlantı"),
            }),
        },
    },
    "contact_info": {
        "label": "İletişim bilgileri", "group": "Site öğeleri", "icon": "☎️", "zones": SITE_ZONES,
        "fields": {
            "title": F("text", "Başlık", max=60, translatable=True),
            "look": F("select", "Görünüm", choices={
                "plain": "Sade metin",
                "cards": "Kartlı ızgara (iletişim sayfası)",
                "bordered": "Çerçeveli bilgi kutusu",
                "pills": "Yuvarlak hap rozetler",
            }, default="plain"),
            "layout": F("select", "Yerleşim", choices={"inline": "Yan yana", "stacked": "Alt alta"}, default="inline", show_if={"look": ["plain", "pills", "bordered"]}),
            "show_icons": F("bool", "Simgeleri göster", default=True),
            "show_phone": F("bool", "Telefon", default=True),
            "show_email": F("bool", "E-posta", default=True),
            "show_address": F("bool", "Adres", default=False),
            "working_hours": F("text", "Çalışma saatleri", max=80, translatable=True, placeholder="Hafta içi 09:00 - 18:00"),
            "whatsapp": F("text", "WhatsApp hattı", max=30, placeholder="+90 555 000 00 00"),
            "map_url": F("url", "Harita / Yol tarifi linki"),
            "custom_phone": F("text", "Özel telefon (boşsa site ayarı)", max=40),
            "custom_email": F("text", "Özel e-posta (boşsa site ayarı)", max=120),
            "custom_address": F("textarea", "Özel adres (boşsa site ayarı)", max=240, translatable=True),
            "size": F("select", "Yazı boyutu", choices={"sm": "Küçük", "md": "Orta", "lg": "Büyük"}, default="sm"),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
        },
    },
    "account_links": {
        "label": "Bağışçı girişi / makbuz", "group": "Site öğeleri", "icon": "👤", "zones": SITE_ZONES,
        "fields": {
            "title": F("text", "Başlık (isteğe bağlı)", max=60, translatable=True),
            "look": F("select", "Görünüm", choices={
                "links": "Sade metin bağlantıları",
                "buttons": "Butonlar (giriş + doğrulama)",
                "pills": "Yuvarlak hap rozetler",
                "divided": "Nokta ayraçlı kompakt (·)",
            }, default="links"),
            "show_icons": F("bool", "Simgeleri göster", default=False),
            "show_portal": F("bool", "Bağışçı girişi", default=True),
            "portal_label": F("text", "Giriş yazısı (boşsa varsayılan)", max=40, translatable=True, show_if={"show_portal": True}),
            "show_verify": F("bool", "Makbuz doğrula", default=True),
            "verify_label": F("text", "Makbuz yazısı (boşsa varsayılan)", max=40, translatable=True, show_if={"show_verify": True}),
            "show_volunteer": F("bool", "Gönüllü Ol bağlantısı ekle", default=False),
            "layout": F("select", "Yerleşim", choices={"inline": "Yan yana", "stacked": "Alt alta"}, default="inline"),
            "size": F("select", "Boyut", choices={"sm": "Küçük", "md": "Orta"}, default="md"),
            "align": F("select", "Hizalama", choices=ALIGN, default="left"),
        },
    },
    "mobile_tab_bar": {
        "label": "Telefon alt çubuğu", "group": "Site öğeleri", "icon": "📱", "zones": ("footer",),
        "help": "Yalnız telefonda, ekranın altında sabit duran kısayollar (ör. Anasayfa, Hesap No, Bağış Yap, Sepetim).",
        "fields": {
            "items": F("list", "Kısayollar", max_items=5, min_items=1, item_label="label", fields={
                "label": F("text", "Yazı", max=20, translatable=True),
                "url": F("url", "Bağlantı"),
                "icon": F("select", "Simge", choices={"home": "Ev", "user": "Kişi", "bank": "Banka", "heart": "Kalp", "cart": "Sepet", "phone": "Telefon", "menu": "Menü"}, default="home"),
                "highlight": F("bool", "Vurgulu (beyaz zemin)"),
            }),
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


# --- More content blocks -------------------------------------------------------------

def _head(**extra) -> dict:
    """Kicker + title shared by most content blocks."""
    return {"kicker": F("text", "Üst başlık", max=60, translatable=True), "title": F("text", "Başlık", max=160, translatable=True), **extra}


BAND_TONES = {"brand": "Ana renk", "accent": "Vurgu rengi", "dark": "Koyu", "soft": "Açık ana renk", "light": "Beyaz"}

EXTRA_BLOCKS: dict[str, dict] = {
    "features": {
        "label": "İkonlu özellikler", "group": "Metin & medya", "icon": "✨",
        "fields": _head(
            text=F("textarea", "Açıklama", max=400, translatable=True),
            items=F("list", "Özellikler", max_items=12, min_items=1, item_label="title", fields={
                "icon": F("text", "Simge (emoji)", max=4),
                "image_url": F("image", "Simge yerine görsel"),
                "badge": F("text", "Rozet (isteğe bağlı)", max=24, translatable=True),
                "title": F("text", "Başlık", max=80, translatable=True),
                "text": F("textarea", "Açıklama", max=300, translatable=True),
                "url": F("url", "Tıklanınca git"),
                "link_label": F("text", "Bağlantı metni", max=40, translatable=True),
            }),
            columns=F("number", "Sütun (bilgisayar)", min=1, max=4, default=3),
            look=F("select", "Görünüm", choices={
                "card": "Kart",
                "plain": "Sade",
                "bordered": "Çerçeveli",
                "icon_left": "Simge solda",
                "numbered": "Numaralı adımlar (01, 02...)",
                "bento": "Bento kutular",
                "left_accent": "Sol şeritli vurgu",
                "dark_cards": "Koyu zemin kartlar",
                "split": "Sol başlık + sağ kartlar (Split)",
                "checklist": "Onay listesi (✓)",
                "compact_strip": "Kompakt güven şeridi",
            }, default="card"),
            icon_style=F("select", "Simge kutusu", choices={"rounded": "Yumuşak kare", "circle": "Daire", "minimal": "Sade (kutusuz)"}, default="rounded"),
            align=F("select", "Hizalama", choices={"left": "Sola", "center": "Ortaya"}, default="center"),
            button_label=F("text", "Alt buton metni", max=40, translatable=True),
            button_url=F("url", "Alt buton linki"),
        ),
    },
    "counters": {
        "label": "Sayaçlar (animasyonlu)", "group": "Güven & etki", "icon": "🔢",
        "help": "Sayılar ekrana gelince sıfırdan yukarı sayar.",
        "fields": _head(
            text=F("textarea", "Açıklama", max=400, translatable=True),
            items=F("list", "Sayılar", max_items=8, min_items=1, item_label="label", fields={
                "icon": F("text", "Simge (emoji)", max=4),
                "value": F("number", "Sayı", min=0, max=999999999, default=100),
                "prefix": F("text", "Ön ek", max=6),
                "suffix": F("text", "Son ek (ör. +, k, ₺)", max=8),
                "label": F("text", "Açıklama", max=60, translatable=True),
                "note": F("text", "Alt not (ör. Son 12 ayda)", max=60, translatable=True),
                "trend": F("text", "Değişim / rozet (ör. +%18)", max=32, translatable=True),
            }),
            look=F("select", "Görünüm", choices={
                "plain": "Sade",
                "cards": "Kartlar",
                "band": "Renkli bant",
                "divided": "Dikey ayırıcılı şerit",
                "split": "Sol metin + sağ 2x2 istatistik",
                "left_accent": "Sol çizgili KPI kartları",
                "dark_cards": "Koyu zemin kartlar",
                "rings": "Dairesel oran halkaları (%)",
            }, default="plain"),
            button_label=F("text", "Alt buton metni", max=40, translatable=True),
            button_url=F("url", "Alt buton linki"),
        ),
    },
    "progress_bars": {
        "label": "Hedef çubukları", "group": "Güven & etki", "icon": "📶",
        "fields": _head(
            text=F("textarea", "Açıklama", max=400, translatable=True),
            items=F("list", "Çubuklar", max_items=10, min_items=1, item_label="label", fields={
                "icon": F("text", "Simge (emoji)", max=4),
                "badge": F("text", "Rozet (ör. Acil)", max=24, translatable=True),
                "label": F("text", "Başlık", max=80, translatable=True),
                "percent": F("number", "Yüzde", min=0, max=100, default=60),
                "note": F("text", "Sağdaki not (ör. 320 / 500 koli)", max=60, translatable=True),
                "url": F("url", "Hedef linki"),
                "link_label": F("text", "Bağlantı metni", max=32, translatable=True),
            }),
            look=F("select", "Görünüm", choices={
                "bars": "Klasik çubuklar",
                "cards": "Kartlı hedefler",
                "split": "Sol özet + sağ çubuklar (Split)",
                "radial": "Dairesel hedef halkaları (%)",
                "milestones": "Aşamalı / duraklı çubuklar",
                "dark_cards": "Koyu zemin kartlar",
            }, default="bars"),
            columns=F("number", "Sütun (kart / halka)", min=1, max=3, default=3),
            button_label=F("text", "Alt buton metni", max=40, translatable=True),
            button_url=F("url", "Alt buton linki"),
        ),
    },
    "team": {
        "label": "Ekip / yönetim kurulu", "group": "Metin & medya", "icon": "👥",
        "fields": _head(
            items=F("list", "Kişiler", max_items=24, min_items=1, item_label="name", fields={
                "image_url": F("image", "Fotoğraf"),
                "badge": F("text", "Kurul / rozet", max=32, translatable=True),
                "name": F("text", "Ad soyad", max=80),
                "role": F("text", "Görev", max=80, translatable=True),
                "text": F("textarea", "Kısa tanıtım", max=500, translatable=True),
                "email": F("text", "E-posta", max=120),
                "url": F("url", "Profil / LinkedIn linki"),
            }),
            columns=F("number", "Sütun (bilgisayar)", min=1, max=5, default=4),
            shape=F("select", "Fotoğraf", choices={"round": "Yuvarlak", "square": "Köşeli"}, default="round"),
            look=F("select", "Görünüm", choices={
                "plain": "Sade",
                "card": "Gölgeli kart",
                "compact": "Yatay kompakt",
                "featured_lead": "Başkan vurgulu + kurul",
                "portrait_overlay": "Tam boy portre (overlay)",
                "detailed_list": "Detaylı biyografi listesi",
                "dark_cards": "Koyu zemin kartlar",
            }, default="plain"),
        ),
    },
    "logos": {
        "label": "Logo şeridi (iş ortakları)", "group": "Güven & etki", "icon": "🏷️",
        "fields": _head(
            text=F("textarea", "Açıklama", max=300, translatable=True),
            items=F("list", "Logolar", max_items=24, min_items=1, item_label="name", fields={
                "image_url": F("image", "Logo"),
                "name": F("text", "Kurum adı", max=80),
                "badge": F("text", "Alt etiket (ör. Resmi Partner)", max=32, translatable=True),
                "url": F("url", "Bağlantı"),
            }),
            look=F("select", "Görünüm", choices={
                "strip": "Sade yatay şerit / kayan",
                "cards": "Kutulu logo ızgarası",
                "divided": "Çizgili matris (Divided grid)",
                "split": "Sol başlık & CTA + sağ logolar",
                "dark_band": "Koyu zemin logo bandı",
            }, default="strip"),
            columns=F("number", "Sütun (ızgara için)", min=2, max=6, default=4),
            size=F("number", "Logo yüksekliği", min=24, max=120, default=56, unit="px"),
            marquee=F("bool", "Kendiliğinden kaysın", default=False),
            speed=F("select", "Kayma hızı", choices={"slow": "Yavaş", "normal": "Normal", "fast": "Hızlı"}, default="normal", show_if={"marquee": True}),
            grayscale=F("bool", "Gri tonlu (üzerine gelince renkli)", default=True),
            button_label=F("text", "Alt buton metni", max=40, translatable=True),
            button_url=F("url", "Alt buton linki"),
        ),
    },
    "countdown": {
        "label": "Geri sayım", "group": "Banner", "icon": "⏳",
        "help": "Kurban kayıtları, Ramazan veya kampanya bitişi için gün-saat-dakika sayacı.",
        "fields": _head(
            text=F("textarea", "Açıklama", max=300, translatable=True),
            target=F("datetime", "Hedef tarih ve saat", required=True),
            image_url=F("image", "Arka plan / yan görsel"),
            button_label=F("text", "Buton yazısı", max=40, translatable=True),
            button_url=F("url", "Buton bağlantısı"),
            button2_label=F("text", "2. buton yazısı", max=40, translatable=True),
            button2_url=F("url", "2. buton bağlantısı"),
            done_text=F("text", "Süre dolunca gösterilecek yazı", max=160, translatable=True),
            show_seconds=F("bool", "Saniyeyi göster", default=True),
            hide_on_done=F("bool", "Süre dolunca bölümü gizle", default=False),
            look=F("select", "Görünüm", choices={
                "band": "Büyük renkli bant",
                "cards": "Ayrı beyaz kutular",
                "minimal": "İnce duyuru çubuğu",
                "ring": "Dairesel halka (Ring)",
                "flip": "Takvim kartı (Flip)",
                "glass": "Görsel üstü cam efektli",
                "split": "Görselli iki sütun",
            }, default="band"),
            tone=F("select", "Zemin", choices=BAND_TONES, default="brand"),
        ),
    },
    "timeline": {
        "label": "Zaman çizelgesi", "group": "Metin & medya", "icon": "🧭",
        "fields": _head(
            look=F("select", "Görünüm", choices={
                "vertical": "Dikey çizgi",
                "cards": "Kartlı duraklar",
                "horizontal": "Yatay aşamalar",
                "alternating": "Sağlı-sollu akış",
                "compact": "Kompakt liste",
                "roadmap": "Proje yol haritası (durum takibi)",
                "photo_story": "Görselli hikâye akışı",
                "dark_cards": "Koyu zemin kartlar",
            }, default="vertical"),
            items=F("list", "Olaylar", max_items=30, min_items=1, item_label="title", fields={
                "date": F("text", "Tarih / yıl", max=40),
                "icon": F("text", "Simge (emoji)", max=4),
                "image_url": F("image", "Fotoğraf (isteğe bağlı)"),
                "badge": F("text", "Rozet / aşama", max=32, translatable=True),
                "status": F("select", "Durum (yol haritası)", choices={"": "Varsayılan", "done": "Tamamlandı ✓", "active": "Devam Ediyor", "upcoming": "Planlandı"}, default=""),
                "title": F("text", "Başlık", max=100, translatable=True),
                "text": F("textarea", "Açıklama", max=500, translatable=True),
                "url": F("url", "Detay linki"),
            }),
        ),
    },
    "tabs": {
        "label": "Sekmeler / akordeon", "group": "Etkileşim", "icon": "🗂",
        "fields": _head(
            text=F("textarea", "Açıklama", max=300, translatable=True),
            look=F("select", "Görünüm", choices={
                "tabs": "Yatay sekmeler",
                "vertical": "Solda sekmeler",
                "accordion": "Akordeon",
                "pills": "Hap düğmeler",
                "underline": "Altı çizgili sekmeler",
                "boxed_cards": "Kartlı içerik sekmeleri",
                "numbered_steps": "Numaralı süreç sekmeleri",
                "dark_cards": "Koyu zemin sekmeler",
            }, default="tabs"),
            image_side=F("select", "Görsel konumu", choices={"left": "Solda", "right": "Sağda"}, default="left"),
            items=F("list", "Sekmeler", max_items=10, min_items=1, item_label="label", fields={
                "icon": F("text", "Simge (emoji)", max=4),
                "badge": F("text", "Rozet (ör. Yeni)", max=24, translatable=True),
                "label": F("text", "Sekme adı", max=40, translatable=True),
                "title": F("text", "İçerik başlığı", max=120, translatable=True),
                "text": F("richtext", "Metin", max=4000, translatable=True),
                "image_url": F("image", "Görsel"),
                "mobile_image_url": F("image", "Görsel (telefon)"),
                "button_label": F("text", "Buton yazısı", max=40, translatable=True),
                "button_url": F("url", "Buton bağlantısı"),
            }),
        ),
    },
    "marquee": {
        "label": "Kayan yazı", "group": "Banner", "icon": "🎗️",
        "fields": {
            "look": F("select", "Görünüm", choices={
                "classic": "Klasik tek şerit",
                "ticker": "Sabit etiketli haber şeridi",
                "pills": "İkonlu hap rozetler",
                "display": "Büyük tipografik şerit",
                "tilted": "Eğik kurdele",
            }, default="classic"),
            "label": F("text", "Sol sabit etiket", max=40, translatable=True, show_if={"look": "ticker"}, help="Örn. DUYURULAR, SON DAKİKA"),
            "items": F("list", "Yazılar", max_items=12, min_items=1, item_label="text", fields={
                "icon": F("text", "Simge (emoji)", max=4),
                "text": F("text", "Yazı", max=120, translatable=True),
                "url": F("url", "Bağlantı (isteğe bağlı)"),
            }),
            "separator": F("text", "Ayraç", max=4, default="✦"),
            "speed": F("select", "Hız", choices={"slow": "Yavaş", "normal": "Normal", "fast": "Hızlı"}, default="normal"),
            "direction": F("select", "Yön", choices={"left": "Sola", "right": "Sağa"}, default="left"),
            "pause_on_hover": F("bool", "Üzerine gelince durdur", default=True),
            "tone": F("select", "Zemin", choices=BAND_TONES, default="brand"),
        },
    },
    "quote": {
        "label": "Alıntı (ayet / hadis / söz)", "group": "Metin & medya", "icon": "❝",
        "fields": {
            "kicker": F("text", "Üst rozet (isteğe bağlı)", max=60, translatable=True),
            "arabic_text": F("textarea", "Arapça metin (isteğe bağlı)", max=700),
            "text": F("textarea", "Metin", max=700, translatable=True, required=True),
            "source": F("text", "Kaynak", max=120, translatable=True),
            "source_role": F("text", "Unvan / alt kaynak", max=120, translatable=True),
            "image_url": F("image", "Fotoğraf (portre / arka plan)"),
            "look": F("select", "Görünüm", choices={
                "centered": "Ortalı, büyük",
                "card": "Kart",
                "side": "Yan çizgili",
                "dark_band": "Koyu tam bant",
                "verse_arabic": "Ayet / hadis (Arapça + Meal)",
                "portrait_quote": "Portreli / yazarlı alıntı",
                "ornate_frame": "Çerçeveli süslemeli kart",
                "image_backdrop": "Görsel arka planlı bant",
            }, default="centered"),
        },
    },
    "image_gallery": {
        "label": "Görsel galerisi", "group": "Metin & medya", "icon": "🖼️",
        "help": "Kendi seçtiğiniz görseller; tıklanınca büyür, kategorilenir veya carousel olarak kayar.",
        "fields": _head(
            items=F("list", "Görseller", max_items=40, min_items=1, item_label="caption", fields={
                "image_url": F("image", "Görsel"),
                "mobile_image_url": F("image", "Görsel (telefon)"),
                "category": F("text", "Kategori (filtre için)", max=40, translatable=True),
                "caption": F("text", "Alt yazı", max=120, translatable=True),
            }),
            layout=F("select", "Düzen", choices={
                "grid": "Izgara",
                "carousel": "Kaydırmalı (Carousel)",
                "filterable": "Kategorili (Filtrelenebilir)",
                "bento": "Bento vitrin",
                "spotlight": "Büyük vitrin + önizleme şeridi",
            }, default="grid"),
            columns=F("number", "Sütun (bilgisayar)", min=2, max=6, default=4),
            aspect=F("select", "Oran", choices={"1/1": "Kare", "4/3": "4:3", "16/9": "16:9", "3/4": "Dikey", "masonry": "Karışık (orijinal oran)"}, default="1/1"),
            caption_mode=F("select", "Alt yazı görünümü", choices={"hover": "Üzerine gelince", "below": "Görsel altında", "always": "Görsel üzerinde sabit", "none": "Gizli"}, default="hover"),
            gap=F("number", "Aralık", min=0, max=32, default=12, unit="px"),
            autoplay=F("bool", "Otomatik kaydır", default=True, show_if={"layout": "carousel"}),
            lightbox=F("bool", "Tıklanınca büyüsün", default=True),
        ),
    },
    "bank_accounts": {
        "label": "Hesap numaraları (IBAN)", "group": "Bağış", "icon": "🏦",
        "help": "Her hesapta IBAN, SWIFT, hesap sahibi ve açıklama için tek tıkla kopyala düğmesi bulunur.",
        "fields": _head(
            text=F("textarea", "Açıklama", max=400, translatable=True),
            items=F("list", "Hesaplar", max_items=20, min_items=1, item_label="bank", fields={
                "logo_url": F("image", "Banka logosu"),
                "bank": F("text", "Banka", max=60),
                "branch": F("text", "Şube", max=60),
                "holder": F("text", "Hesap sahibi", max=140),
                "iban": F("text", "IBAN", max=42),
                "account_no": F("text", "Hesap / Posta Çeki No", max=40),
                "swift": F("text", "SWIFT / BIC", max=20),
                "reference_hint": F("text", "Önerilen açıklama", max=80, translatable=True, help="Örn. ZEKAT, SU KUYUSU, GENEL BAĞIŞ"),
                "qr_url": F("image", "IBAN / FAST QR görseli"),
                "currency": F("select", "Para birimi", choices={"TRY": "TL", "USD": "USD", "EUR": "EUR", "GBP": "GBP", "CHF": "CHF", "SAR": "SAR", "AED": "AED"}, default="TRY"),
            }),
            show_currency_filter=F("bool", "Para birimi filtre sekmeleri", default=False),
            note=F("textarea", "Alt not (ör. açıklamaya ne yazılacağı)", max=400, translatable=True),
            look=F("select", "Görünüm", choices={
                "cards": "2 sütunlu kartlar",
                "grid3": "3 sütunlu kartlar",
                "compact": "Kompakt satır listesi",
                "table": "Kurumsal tablo",
                "tabs": "Para birimi sekmeli",
                "dark": "Koyu vitrin",
            }, default="cards"),
        ),
    },
    "popup": {
        "label": "Açılır pencere (pop-up)", "group": "Banner", "icon": "🪟", "zones": ("home", "page"),
        "help": "Sayfa açılınca, kaydırılınca veya çıkışta bir kez gösterilir; kapatılınca seçilen süre boyunca çıkmaz.",
        "fields": {
            "look": F("select", "Görünüm", choices={
                "modal": "Klasik üst görselli",
                "split": "İki sütunlu (görsel + metin)",
                "poster": "Tıklanabilir afiş (Poster)",
                "slide_in": "Sağ alt köşe (Slide-in)",
                "quick_donate": "Hızlı bağış tutarlı",
                "fullscreen": "Tam ekran karşılama",
            }, default="modal"),
            "trigger": F("select", "Açılış tetikleyicisi", choices={
                "delay": "Belirli saniye sonra",
                "scroll": "Sayfa %40 kaydırılınca",
                "exit": "Çıkış niyetinde (fare yukarı gidince)",
            }, default="delay"),
            "image_url": F("image", "Görsel"),
            "mobile_image_url": F("image", "Görsel (telefon)"),
            "kicker": F("text", "Üst başlık", max=60, translatable=True),
            "title": F("text", "Başlık", max=160, translatable=True),
            "text": F("textarea", "Metin", max=500, translatable=True),
            "quick_amounts": F("text", "Hızlı tutarlar (virgülle)", max=80, default="250,500,1000", show_if={"look": "quick_donate"}),
            "button_label": F("text", "Buton yazısı", max=40, translatable=True),
            "button_url": F("url", "Buton bağlantısı"),
            "button2_label": F("text", "2. buton yazısı", max=40, translatable=True),
            "button2_url": F("url", "2. buton bağlantısı"),
            "delay": F("number", "Kaç saniye sonra açılsın", min=0, max=60, default=3, show_if={"trigger": "delay"}),
            "hide_days": F("number", "Kapatınca kaç gün çıkmasın (0 = oturum boyu)", min=0, max=60, default=1),
            "size": F("select", "Boyut", choices={"sm": "Küçük", "md": "Orta", "lg": "Büyük"}, default="md"),
        },
    },
    "before_after": {
        "label": "Önce / Sonra Karşılaştırma", "group": "Metin & medya", "icon": "🌗",
        "help": "Örneğin su kuyusu, okul veya ev inşaatının öncesi ve sonrası sürgülü karşılaştırması.",
        "fields": _head(
            subtitle=F("textarea", "Açıklama", max=300, translatable=True),
            before_image=F("image", "Önceki görsel"),
            before_label=F("text", "Önce etiketi", max=30, default="Önce", translatable=True),
            after_image=F("image", "Sonraki görsel"),
            after_label=F("text", "Sonra etiketi", max=30, default="Sonra", translatable=True),
            aspect=F("select", "Görsel oranı", choices={"16/9": "16:9", "4/3": "4:3", "3/2": "3:2"}, default="16/9"),
            initial_position=F("number", "Başlangıç çizgisi (%)", min=10, max=90, default=50),
        ),
    },
    "bento_grid": {
        "label": "Bento Grid Vitrin", "group": "Metin & medya", "icon": "🍱",
        "help": "Farklı boyutlardaki modern kutularla proje, hizmet veya etki alanlarını sergiler.",
        "fields": _head(
            subtitle=F("textarea", "Açıklama", max=300, translatable=True),
            items=F("list", "Bento kutuları", max_items=12, min_items=1, item_label="title", fields={
                "image_url": F("image", "Arka plan görseli (isteğe bağlı)"),
                "badge": F("text", "Üst etiket", max=40, translatable=True),
                "title": F("text", "Başlık", max=120, translatable=True),
                "text": F("textarea", "Açıklama", max=300, translatable=True),
                "url": F("url", "Bağlantı"),
                "span": F("select", "Kutu boyutu", choices={"normal": "Normal (1×1)", "wide": "Geniş (2×1)", "tall": "Uzun (1×2)", "large": "Büyük (2×2)"}, default="normal"),
                "tone": F("select", "Zemin", choices={"light": "Açık", "soft": "Yumuşak marka", "brand": "Ana renk", "dark": "Koyu"}, default="light"),
            }),
        ),
    },
    "pricing_tiers": {
        "label": "Bağış / Sponsorluk Paketleri", "group": "Bağış", "icon": "💎",
        "help": "Aylık veya tek seferlik kademeli bağış ve sponsorluk paketleri.",
        "fields": _head(
            subtitle=F("textarea", "Açıklama", max=300, translatable=True),
            columns=F("number", "Sütun", min=2, max=4, default=3),
            items=F("list", "Paketler", max_items=6, min_items=1, item_label="title", fields={
                "badge": F("text", "Etiket (ör. En Çok Tercih Edilen)", max=40, translatable=True),
                "title": F("text", "Paket adı", max=80, translatable=True),
                "amount": F("text", "Tutar (ör. 750 ₺)", max=30),
                "period": F("text", "Dönem (ör. / ay, tek seferlik)", max=30, translatable=True),
                "description": F("textarea", "Kısa özet", max=200, translatable=True),
                "features": F("textarea", "Dahil olanlar (her satır bir madde)", max=600, translatable=True),
                "button_label": F("text", "Buton yazısı", max=40, default="Destek Ol", translatable=True),
                "button_url": F("url", "Buton bağlantısı"),
                "campaign_id": F("campaign", "Kampanyaya bağla (isteğe bağlı)"),
                "highlighted": F("bool", "Vurgulu paket (öne çıkar)"),
            }),
        ),
    },
    "video_gallery": {
        "label": "Video Galeri", "group": "Metin & medya", "icon": "🎬",
        "help": "Saha çalışmaları, tanıtım ve belgesel videolarını ızgara veya carousel olarak sergiler.",
        "fields": _head(
            subtitle=F("textarea", "Açıklama", max=300, translatable=True),
            layout=F("select", "Düzen", choices={"grid": "Izgara", "carousel": "Kaydırmalı"}, default="grid"),
            columns=F("number", "Sütun", min=2, max=4, default=3),
            items=F("list", "Videolar", max_items=16, min_items=1, item_label="title", fields={
                "title": F("text", "Başlık", max=120, translatable=True),
                "video_url": F("video", "Video (YouTube / MP4)"),
                "thumbnail_url": F("image", "Kapak görseli"),
                "duration": F("text", "Süre (ör. 03:45)", max=16),
                "category": F("text", "Kategori", max=40, translatable=True),
            }),
        ),
    },
    "region_cards": {
        "label": "Bölge / Ülke Faaliyetleri", "group": "Güven & etki", "icon": "🌍",
        "help": "Faaliyet yürütülen ülke veya bölgeleri proje sayılarıyla gösterir.",
        "fields": _head(
            subtitle=F("textarea", "Açıklama", max=300, translatable=True),
            look=F("select", "Görünüm", choices={"cards": "Görselli kartlar", "pills": "Kompakt bölge rozetleri", "split": "Liste + özet"}, default="cards"),
            columns=F("number", "Sütun", min=2, max=4, default=4),
            items=F("list", "Bölgeler", max_items=20, min_items=1, item_label="region", fields={
                "flag": F("text", "Bayrak / Emoji", max=8),
                "region": F("text", "Ülke / Bölge", max=60, translatable=True),
                "count": F("text", "Sayı (ör. 142)", max=20),
                "unit": F("text", "Birim (ör. Su Kuyusu)", max=40, translatable=True),
                "summary": F("text", "Kısa not", max=160, translatable=True),
                "image_url": F("image", "Görsel"),
                "url": F("url", "Bağlantı"),
            }),
        ),
    },
    "sticky_story": {
        "label": "Yapışkan Hikaye (Sticky Split)", "group": "Metin & medya", "icon": "📖",
        "help": "Bir tarafta sabit görsel kalırken diğer tarafta hikaye adımları kayar.",
        "fields": _head(
            image_url=F("image", "Sabit görsel"),
            image_side=F("select", "Görsel tarafı", choices={"left": "Solda", "right": "Sağda"}, default="left"),
            steps=F("list", "Hikaye adımları", max_items=8, min_items=1, item_label="title", fields={
                "badge": F("text", "Adım etiketi", max=40, translatable=True),
                "title": F("text", "Başlık", max=120, translatable=True),
                "text": F("textarea", "Metin", max=500, translatable=True),
                "metric": F("text", "Vurgulu rakam (ör. 12.500 Kişi)", max=40, translatable=True),
            }),
        ),
    },
    "map": {
        "label": "Harita (Google Maps)", "group": "Form & iletişim", "icon": "🗺️",
        "help": "Dernek merkezi veya şube konumunu etkileşimli haritada gösterir.",
        "fields": _head(
            address=F("text", "Adres veya yer adı", max=200),
            embed_url=F("url", "Google Maps yerleştirme URL (opsiyonel)"),
            height=F("number", "Yükseklik (px)", min=200, max=800, default=380),
            zoom=F("number", "Yakınlaştırma (1-20)", min=1, max=20, default=15),
            show_directions=F("bool", "Yol tarifi butonu göster", default=True),
        ),
    },
    "downloads": {
        "label": "Dosya / Rapor İndirme", "group": "Güven & etki", "icon": "📥",
        "help": "Faaliyet raporu, mali tablo veya broşür gibi indirilebilir belgeleri listeler.",
        "fields": _head(
            columns=F("number", "Sütun", min=1, max=3, default=2),
            items=F("list", "Dosyalar", max_items=24, min_items=1, item_label="title", fields={
                "title": F("text", "Belge başlığı", max=120, translatable=True),
                "description": F("text", "Kısa açıklama", max=200, translatable=True),
                "file_url": F("url", "Dosya bağlantısı (PDF vb.)"),
                "file_type": F("text", "Tür (ör. PDF)", max=12, default="PDF"),
                "file_size": F("text", "Boyut (ör. 2.4 MB)", max=20),
            }),
        ),
    },
    "newsletter": {
        "label": "E-Bülten Aboneliği", "group": "Form & iletişim", "icon": "📬",
        "help": "Ziyaretçilerin e-posta adresiyle bültene abone olmasını sağlar.",
        "fields": _head(
            placeholder=F("text", "E-posta alanı metni", max=80, default="E-posta adresiniz", translatable=True),
            button_label=F("text", "Buton metni", max=40, default="Abone Ol", translatable=True),
            success_text=F("text", "Başarı mesajı", max=160, default="Kaydınız alındı. Teşekkür ederiz!", translatable=True),
            privacy_note=F("text", "KVKK / gizlilik notu", max=200, translatable=True),
            band=F("select", "Zemin", choices={"light": "Açık", "soft": "Yumuşak", "brand": "Marka", "dark": "Koyu"}, default="soft"),
        ),
    },
    "icon_list": {
        "label": "İkonlu Liste", "group": "Metin & medya", "icon": "✅",
        "help": "Öne çıkan özellikleri, avantajları veya ilkeleri ikonlu maddeler halinde listeler.",
        "fields": _head(
            columns=F("number", "Sütun", min=1, max=3, default=2),
            items=F("list", "Maddeler", max_items=24, min_items=1, item_label="title", fields={
                "icon": F("text", "İkon / Emoji", max=8, default="✓"),
                "title": F("text", "Başlık", max=100, translatable=True),
                "text": F("text", "Açıklama", max=240, translatable=True),
                "url": F("url", "Bağlantı (opsiyonel)"),
            }),
        ),
    },
}
BLOCKS.update(EXTRA_BLOCKS)
HEADER_TOP_LEVEL = frozenset({"header_row", "announcement_bar"})


# --- Style & advanced settings ---------------------------------------------------

def _px(label, lo, hi):
    return F("number", label, min=lo, max=hi, unit="px")


STYLE_GROUPS: dict[str, dict[str, dict]] = {
    "Yazı": {
        "font_family": F("select", "Yazı tipi", choices={"": "Tema", "sans": "Gövde yazı tipi", "heading": "Başlık yazı tipi"}),
        "font_size": _px("Yazı boyutu", 8, 120),
        "font_weight": F("select", "Kalınlık", choices={"": "Varsayılan", "300": "İnce", "400": "Normal", "500": "Orta", "600": "Yarı kalın", "700": "Kalın", "800": "Çok kalın", "900": "Siyah"}),
        "font_style": F("select", "Yazı stili", choices={"": "Normal", "italic": "İtalik"}),
        "text_decoration": F("select", "Çizgi", choices={"": "Yok", "underline": "Altı çizili", "line-through": "Üstü çizili"}),
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
        "backdrop_blur": F("number", "Arka plan bulanıklığı (cam efekti)", min=0, max=40, unit="px"),
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
        "opacity": F("number", "Şeffaflık (%)", min=0, max=100),
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
    "langs": F("select", "Yalnızca bu dilde göster", choices={"": "Tüm diller", **{code: LANG_NAMES[code] for code in ("tr", *LANGS)}}),
    "anchor": F("text", "Bağlantı çıpası (#)", max=60, pattern="anchor", help="Bağlantılarda # olmadan kullanın (ör. bagis-formu)"),
    "aria_label": F("text", "Erişilebilirlik etiketi", max=120),
    "css_class": F("text", "CSS sınıfı", max=80, pattern="css_class", help="Özel CSS sınıf adları (boşlukla ayırın)"),
    "z_index": F("number", "Katman sırası (z-index)", min=-10, max=100, help="Üst üste binen bloklarda önde görünme sırası"),
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
        "header_top_level": sorted(HEADER_TOP_LEVEL),
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
        if parent_type is None and block_type not in HEADER_TOP_LEVEL:
            raise BlockError("Header yalnızca Header satırlarından (ve en üstte duyuru çubuğundan) oluşur; öğeleri satırların alanlarına ekleyin")
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


# Home section key (Görünüm page) -> block type
SECTION_BLOCKS = {"stats": "stats", "categories": "categories", "campaigns": "campaigns", "zakat": "zakat_band",
                  "cta": "cta_band", "news": "news", "trust": "trust", "featured": "featured_campaign",
                  "steps": "steps", "gallery": "gallery_strip", "testimonials": "testimonials"}


def default_home_blocks(template: str) -> list[dict]:
    """Home page exactly as the template draws it today (texts come from site settings)."""
    from app.services.site import DEFAULT_SECTIONS

    variant = template if template in ("klasik", "kategori", "sade") else "klasik"
    blocks = [{"id": "home-hero", "type": "hero", "props": {"variant": variant, "show_form": True}}]
    if variant != "klasik":
        blocks.append({"id": "home-form", "type": "quick_donation", "props": {},
                       "style": {"desktop": {"width": "narrow", "padding_top": 48}}})
    return blocks + [{"id": f"home-{key}", "type": SECTION_BLOCKS[key], "props": {}} for key in DEFAULT_SECTIONS[variant]]


def home_blocks_for(org) -> list[dict]:
    """Default home blocks following the organisation's current section order."""
    from app.services.site import home_sections_of

    blocks = default_home_blocks(org.template)
    head = [b for b in blocks if b["type"] in ("hero", "quick_donation")]
    return head + [{"id": f"home-{key}", "type": SECTION_BLOCKS[key], "props": {}}
                   for key in home_sections_of(org) if key in SECTION_BLOCKS]


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
