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
                "full_search_hero": "Arama & kategori hızlı seçim kapağı",
                "dual_split_card": "Sol koyu zemin + sağ kayan kart",
                "countdown_crisis": "Canlı kriz geri sayımlı kapak",
                "video_split": "Solda başlık + sağda tanıtım videosu",
                "split_glass_card": "Yüzen cam kartlı bölünmüş kapak",
                "arch_islamic_frame": "Kemeri / mihrap çerçeveli kapak",
                "full_bleed_editorial": "Tam ekran editoryal tipografi kapağı",
            }, default="klasik"),
            "badge": F("text", "Üst etiket", max=80, translatable=True),
            "title": F("text", "Başlık", max=160, translatable=True, placeholder="Boşsa site kapak başlığı"),
            "subtitle": F("textarea", "Açıklama", max=400, translatable=True),
            "image_url": F("image", "Görsel"),
            "mobile_image_url": F("image", "Görsel (telefon)"),
            "slides": F("list", "Görsel / Slayt Ekle", max_items=12, item_label="title", fields={
                "image_url": F("image", "Görsel (bilgisayar)"),
                "mobile_image_url": F("image", "Görsel (telefon)"),
                "badge": F("text", "Üst etiket", max=80, translatable=True),
                "title": F("text", "Başlık", max=160, translatable=True),
                "text": F("textarea", "Açıklama", max=400, translatable=True),
                "button_label": F("text", "1. buton yazısı", max=40, translatable=True),
                "button_url": F("url", "1. buton bağlantısı"),
                "button2_label": F("text", "2. buton yazısı", max=40, translatable=True),
                "button2_url": F("url", "2. buton bağlantısı"),
                "campaign_id": F("campaign", "Kampanyaya bağla (boş alanlar kampanyadan dolar)"),
                "video_url": F("video", "Arka plan videosu (MP4)"),
                "quick_amounts": F("text", "Hızlı tutarlar (virgülle)", max=60),
                "countdown_to": F("datetime", "Geri sayım tarihi"),
            }),
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
            "nav": F("select", "Alt gezinme", choices={"": "Varsayılan", "dots": "Noktalar", "thumbs": "Küçük görseller", "tabs": "Başlık sekmeleri", "icon_tabs": "İkonlu sekmeler", "numbers": "Sayısal sayaç", "progress": "İlerleme çubuğu"}, default=""),
            "arrow_style": F("select", "Ok stili", choices={"round": "Yuvarlak", "square": "Kare", "minimal": "Minimalist", "ghost": "Çerçevesiz"}, default="round"),
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
                "video_url": F("video", "Arka plan videosu (MP4 / YouTube)"),
                "countdown_to": F("datetime", "Geri sayım hedef tarihi"),
                "quick_amounts": F("text", "Hızlı tutar butonları (virgülle)", max=60, placeholder="100, 250, 500"),
                "align": F("select", "Metin konumu", choices=ALIGN, default="left"),
                "overlay": F("number", "Karartma (%)", min=0, max=90, default=45),
                "bg_color": F("color", "Slayt arka plan rengi (bölünmüş / kart)"),
                "image_pos": F("select", "Görsel yönü (bölünmüş / kart)", choices={"right": "Sağda", "left": "Solda"}, default="right"),
                "tab_label": F("text", "Sekme etiketi (ikonlu sekme için)", max=32, translatable=True, placeholder="Örn: Yetim, Zekat, Kış"),
                "tab_icon": F("select", "Sekme ikonu (ikonlu sekme için)", choices={
                    "": "Otomatik (görsel / varsayılan)",
                    "heart-handshake": "Yardımlaşma / Genel",
                    "heart": "Kalp / Bağış",
                    "hand-heart": "Destek / Dayanışma",
                    "snowflake": "Kış yardımı",
                    "coins": "Zekat / Fitre",
                    "moon-star": "Ramazan / Kurban",
                    "droplets": "Su kuyusu",
                    "graduation-cap": "Eğitim / Burs",
                    "book-open": "Kur'an / İlim",
                    "utensils": "Sofra / Gıda",
                    "eye": "Katarakt / Sağlık",
                    "alert-triangle": "Acil yardım / Kriz",
                    "shield-alert": "Afet / Kriz bölgesi",
                    "smile": "Yetim / Çocuk",
                    "baby": "Bebek / Çocuk",
                    "home": "Barınma / Ev",
                    "tent": "Çadır / Kamp",
                    "globe": "Yurtdışı / Dünya",
                    "sparkles": "Özel kampanya",
                }, default=""),
                "tab_icon_url": F("image", "Özel sekme ikonu (görsel/SVG, isteğe bağlı)"),
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
                "floating_donate": "Yüzen hızlı bağış kartlı",
                "kinetic_collage": "Başlık + 2'li dikey kolaj",
                "spotlight": "Koyu vitrin çerçevesi",
                "split_dark": "Koyu 2 sütun vitrin",
                "news_ticker": "Altı kayan duyuru şeritli",
                "grid_collage": "3'lü asimetrik mozaik kolaj",
                "split_diagonal": "Çapraz kesimli iki renkli slayt",
                "dark_cinema": "Sinema perdesi koyu alt yazılı vitrin",
                "mini_promo_strip": "Kompakt yatay promosyon slider",
                "card_stack_slider": "Üst üste kart destesi slider",
                "dark_cinema_slider": "Koyu sinematik geniş slider",
                "minimal_editorial_slider": "Minimal editoryal tipografi slider",
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
                "icon_tabs": "İkonlu sekmeler (kategori vitrini)",
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
                "story_916": "9:16 Dikey hikaye kartları",
                "polaroid": "Polaroid hatıra kartları",
                "bento_strip": "Bento vurgu kartları",
                "quote_card": "Büyük tırnaklı alıntı kartı",
                "progress_card": "İlerleme çubuklu proje kartı",
                "video_reel": "Oynat rozetli video vitrini",
                "stat_overlay": "Köşe istatistik rozetli kartlar",
                "minimal_editorial": "Editoryal tipografik kartlar",
                "dark_glass_cards": "Koyu cam efektli kaydırmalı kartlar",
                "compact_news": "Küçük görselli yatay haber karuseli",
                "center_focus_carousel": "Ortada büyüyen odaklı carousel",
                "dark_card_carousel": "Koyu zemin lüks kart carousel",
                "compact_pill_carousel": "Kompakt yatay hap carousel",
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
                "floating_bar": "Tek satır yüzen bağış çubuğu",
                "impact_calculator": "Dinamik etki hesaplayıcılı form",
                "compact_inline_pill": "Kompakt hap butonlu hızlı çubuk",
                "dark_ramadan_bar": "Koyu Ramazan / gece modu bağış bandı",
                "preset_grid_card": "Büyük tutar kutulu modern kart",
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
                "urgent_first": "İlk kampanya dev manşet + ızgara",
                "tabbed_categories": "Kategori sekmeli kampanya ızgarası",
                "urgent_red_cards": "Acil kırmızı vurgulu kartlar",
                "dark_luxury_grid": "Koyu zemin lüks kampanya ızgarası",
                "compact_horizontal_list": "Kompakt yatay kampanya listesi",
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
                "receipt_card": "Makbuz önizlemeli kart",
                "countdown_urgent": "Geri sayımlı acil kart",
                "mini_horizontal": "Yazı içi ince yatay şerit",
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
                "story_circles": "Yuvarlak hikâye ikonları",
                "mega_tiles": "Büyük ikonlu geniş kutular",
                "icon_list_dense": "3 sütunlu yoğun ikon + ok listesi",
                "dark_accent_tiles": "Koyu zemin vurgulu kategori kutuları",
                "glass_pills": "Cam efektli kategori hapları",
                "icon_circle_grid": "Dairesel ikonlu temiz ızgara",
                "gradient_border_tiles": "Gradyan kenarlıklı kategori kutuları",
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
                "urgent_ticker": "Canlı acil rozetli + hızlı tutarlı",
                "receipt_preview": "Makbuz / sertifika önizlemeli",
                "dark_gold_featured": "Koyu lacivert & altın vitrin",
                "split_urgent_badge": "Acil kırmızı rozetli iki sütun",
                "floating_progress_featured": "Yüzen ilerleme çubuklu vitrin",
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
                "nisab_ticker": "Nisap göstergeli hızlı hesaplama",
                "dark_islamic_pattern": "Koyu zemin geometrik desenli",
                "gold_nisab_card": "Altın rengi nisap vurgulu kart",
                "split_faq_zakat": "Sol zekat çağrısı + sağ 3 soru",
                "gold_ornate_band": "Altın varak çerçeveli zekat bandı",
                "split_calculator_cta": "Sol hesaplayıcı + sağ hızlı bağış",
                "dark_emerald_band": "Koyu zümrüt yeşili zekat bandı",
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
                "impact_badge_grid": "Birim rozetli kompakt ızgara",
                "dark_gold": "Koyu zemin + altın vurgu kartları",
                "minimal_border_cards": "İnce çerçeveli sade bağış kartları",
                "dark_gold_cards": "Koyu lacivert + altın çerçeveli kartlar",
                "badge_ribbon_cards": "Üst kurdele rozetli bağış kartları",
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
                "diagonal": "Çapraz kesimli modern banner",
                "floating_card": "Görsel üstü yüzen bilgi kartı",
                "ticker_banner": "Sürekli kayan slogan şeridi",
                "split_countdown": "Geri sayımlı iki sütun banner",
                "ribbon_corner": "Köşe kurdeleli kampanya banner'ı",
                "duotone_overlay": "Çift tonlu modern filtreli banner",
                "split_stats_overlay": "Görsel üzerinde etki rakamları + CTA",
                "minimal_border_top": "Üst çizgili sade kurumsal banner",
                "minimal_bordered": "İnce çerçeveli zarif banner",
                "gradient_pill_cta": "Gradyan zemin + hap butonlu banner",
                "dark_spotlight": "Koyu zemin vurgu ışıklı banner",
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
                "whatsapp_direct": "Tek tıkla WhatsApp destek bandı",
                "floating_pill": "Yuvarlatılmış yüzen aksiyon kapsülü",
                "split_urgent_red": "Acil kırmızı iki sütun çağrı bandı",
                "dark_gold_ornate": "Koyu lacivert & altın varak çağrı bandı",
                "floating_card": "Yükseltilmiş gölgeli çağrı kartı",
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
                "floating_pill": "Yüzen hap duyuru bandı",
                "left_accent_card": "Sol kalın çizgili gölgeli kart",
                "dark_amber_alert": "Koyu zemin amber uyarısı",
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
                "pulse_urgent": "Canlı nabız noktalı acil duyuru",
                "countdown_urgent": "Kırmızı geri sayım rozetli şerit",
                "gradient_shimmer": "Parlayan gradyan duyuru şeridi",
                "split_two_links": "Çift bağlantılı bölünmüş şerit",
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
            "icon_url": F("image", "Simge görseli (isteğe bağlı)"),
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
                "badge_accent": "Üst rozet + altı çizgili vurgu",
                "editorial_serif": "Klasik editoryal tırnaklı",
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
                "callout_highlight": "Vurgulu kenar kutusu",
                "quote_prose": "Büyük giriş + yan notlu makale",
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
                "polaroid_frame": "Alt yazılı polaroid kart",
                "duotone_brand": "Marka renkli duotone",
                "floating_badge": "Köşe rozetli görsel",
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
                "collage_two_photos": "Çift fotoğraf kolajlı",
                "overlapping_card": "Görsel üstüne taşan metin kartı",
                "dark_split_panel": "Koyu zemin iki sütun panel",
                "framed_editorial": "İnce çerçeveli editoryal düzen",
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
                "floating_frame": "Gölgeli yüzen çerçeve",
                "dark_theater": "Tam genişlik koyu tiyatro",
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
            "layout": F("select", "Dizilim", choices={
                "row": "Yan yana",
                "stack": "Alt alta",
                "icon_cards_row": "İkonlu aksiyon kartları",
                "floating_shadow": "3D gölgeli vurgulu",
                "icon_split_pair": "İkonlu çift aksiyon ikilisi",
                "pill_shadow_group": "Yumuşak gölgeli hap grup",
                "outline_to_solid": "Hover'da dolan çerçeveli grup",
            }, default="row"),
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
            "variant": F("select", "Görünüm", choices={"": "Tema", "card": "Beyaz kutu (simgeli, sayarak artan)", "gradient": "Renk geçişli kutular", "ring": "Dairesel ilerleme halkaları", "bento_dark": "Koyu zemin vurgu kartları", "glass_dark": "Koyu cam efektli kutular", "icon_pills": "İkonlu yatay haplar", "big_hero_numbers": "Dev tipografik rakamlar"}, default=""),
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
                "zigzag": "Sağlı-sollu zikzak adımlar",
                "horizontal_bar": "Numaralı yatay ilerleme şeridi",
                "vertical_connected": "Bağlantı çizgili dikey akış",
                "numbered_glass_cards": "Numaralı cam efektli kartlar",
                "horizontal_arrows": "Ok işaretli yatay süreç",
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
                "video_stories": "Görsel/video önizlemeli hikâyeler",
                "verified_donor_strip": "Onaylı bağışçı rozetli şerit",
                "chat_bubbles": "Mesaj balonu (SMS/WhatsApp) düzeni",
                "two_col_highlight": "2 sütun büyük alıntı kartları",
                "compact_avatar_row": "Küçük avatarlı kompakt yorum şeridi",
                "masonry_quotes": "Üst üste şık alıntı duvarı",
                "dark_spotlight_slider": "Koyu vitrin tekli alıntı kartı",
                "verified_donor_cards": "Doğrulanmış bağışçı rozetli kartlar",
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
                "step_numbered": "Numaralı büyük soru kartları",
                "highlight_first": "İlk soru geniş öne çıkan düzen",
                "searchable_accordion": "Canlı aramalı modern akordeon",
                "two_column_grid": "İki sütunlu hızlı SSS ızgarası",
                "card_boxes": "Kutu kartlar halinde SSS",
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
                "timeline_feed": "Tarih damgalı dikey haber akışı",
                "photo_grid_2col": "Büyük fotoğraflı 2 sütun dergi",
                "ticker_headlines": "Yatay kayan haber başlıkları",
                "magazine_featured": "Manşet öne çıkan + yan haberler",
                "dark_editorial_grid": "Koyu zemin editoryal haber ızgarası",
                "compact_date_list": "Tarih rozetli sade haber listesi",
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
                "floating_glass": "Görsel üstü cam form",
                "department_tabs": "Birim seçmeli destek formu",
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
                "masonry_wall": "Değişken yükseklikli duvar (Masonry)",
                "masonry_strip": "Asimetrik mozaik şerit",
                "dark_polaroid_strip": "Koyu zemin polaroid albüm",
                "bordered_tiles_strip": "Çerçeveli kare galeri karoları",
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
                "certificate_grid": "Resmi belge & denetim rozetli ızgara",
                "dark_shield_bar": "Koyu kalkan rozetli güven bandı",
                "icon_card_grid": "İkonlu modern güven kartları",
                "minimal_divider_strip": "Dikey çizgi ayırıcılı sade şerit",
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
                "islamic_geometric": "İnce geometrik desenli zemin",
                "gradient_mesh": "Yumuşak renk geçişli zemin",
                "wave_edges": "Dalga kesimli modern bölüm",
                "dark_glass_frame": "Koyu cam efektli çerçeve",
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
                "ornament_islamic": "Geometrik süslemeli ayraç",
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
    "description": F("text", "Kısa açıklama (mega menüde)", max=80, translatable=True),
    "group": F("text", "Sütun başlığı (mega menü)", max=40, help="Aynı başlığı taşıyan bağlantılar bir sütunda toplanır"),
    "badge": F("text", "Rozet (ör. Yeni)", max=16, translatable=True),
    "new_tab": F("bool", "Yeni sekmede aç"),
}

SITE_BLOCKS: dict[str, dict] = {
    "header_row": {
        "label": "Header satırı", "group": "Header", "icon": "▤", "container": True,
        "child_type": "header_slot", "child_count": 3, "zones": ("header",),
        "fields": {
            "look": F("select", "Görünüm", choices={
                "standard": "Klasik tam genişlik bar",
                "transparent_over_hero": "Kapak üstü şeffaf başlık",
                "floating_capsule": "Kenarlardan boşluklu yüzen kapsül",
                "split_center_logo": "Ortada logo + simetrik menü",
            }, default="standard"),
            "tone": F("select", "Zemin", choices={k: v for k, v in TONES.items() if k}, default="light"),
            "height": F("number", "Yükseklik", min=32, max=160, default=76, unit="px"),
            "sticky": F("bool", "Kaydırınca üstte sabit kalsın", default=False),
            "shrink": F("bool", "Sabitken küçülsün ve gölge alsın", default=True, show_if={"sticky": True}),
            "transparent": F("bool", "Şeffaf kapak üstü (sayfa başına biner)", default=False),
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
            "show_about": F("bool", "Altında kurum tanıtım metni (Tema › Alt Bilgi)", default=False),
            "url": F("url", "Bağlantı (boşsa ana sayfa /)"),
        },
    },
    "nav_menu": {
        "label": "Menü", "group": "Site öğeleri", "icon": "☰", "zones": SITE_ZONES,
        "fields": {
            "title": F("text", "Başlık (dikey menüde)", max=60, translatable=True),
            "source": F("select", "Bağlantılar", choices={"header": "Sayfa & Menü › Üst menü", "footer": "Sayfa & Menü › Alt menü", "custom": "Burada tanımla (alt menü ve mega menü)"}, default="header"),
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
                "underline_hover": "Altı kayarak çizilen animasyonlu",
                "pill_active": "Aktif sayfa hap vurgulu",
                "uppercase_tracked": "Geniş aralıklı kurumsal menü",
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
            "drawer_donate_label": F("text", "Açılır menü buton yazısı (boşsa Bağış Yap)", max=40, translatable=True, show_if={"mobile": "drawer", "drawer_donate": True}),
            "drawer_donate_url": F("url", "Açılır menü buton adresi (boşsa /kampanyalar)", show_if={"mobile": "drawer", "drawer_donate": True}),
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
            "heart": F("bool", "♥ simgesi (eski ayar)", default=False, show_if={"heart": True}),
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
                "globe_pill": "Küre ikonlu kompakt hap",
                "full_bar": "Tam genişlik dil çubuğu",
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
    "site_search": {
        "label": "Site içi arama", "group": "Site öğeleri", "icon": "🔍", "zones": SITE_ZONES,
        "fields": {
            "target": F("select", "Arama hedefi", choices={"campaigns": "Kampanyalar (/kampanyalar)", "news": "Haberler (/haberler)"}, default="campaigns"),
            "look": F("select", "Görünüm", choices={"icon": "Açılır arama simgesi", "input": "Doğrudan arama kutusu", "command_palette": "Komut paleti (⌘K) arama", "pill_search_bar": "Kategorili hap arama çubuğu"}, default="icon"),
            "placeholder": F("text", "Yer tutucu yazı", max=60, translatable=True, placeholder="Kampanya veya konu ara…"),
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
                "flag_pills": "Bayraklı hap butonlar",
                "minimal_divider": "Ayraçlı minimal seçici",
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
                "floating_badge_pill": "Tutar + adet rozetli hap",
                "minimal_counter": "Sade sayaçlı ikon",
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
                "floating_dock": "Yuvarlak kapsül dock",
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
                "icon_cards": "Ayrı ikon kutuları",
                "dark_footer_list": "Koyu alt bilgi listesi",
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
                "card_badge": "Giriş + makbuz doğrulama rozetli",
                "icon_only_compact": "Sadece kompakt ikonlar",
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
            "look": F("select", "Görünüm", choices={"standard": "Klasik sabit alt çubuk", "floating_dock": "Yüzen kapsül dock", "center_donate_fab": "Ortada büyük Bağış Yap butonu"}, default="standard"),
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
            "look": F("select", "Görünüm", choices={"centered_minimal": "Ortalı sade", "split_with_badges": "SSL & resmi izin rozetli", "dark_bordered": "Koyu üst çizgili"}, default="centered_minimal"),
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
                "hover_reveal": "Üzerine gelince detay açılan",
                "icon_top_line": "Üst çizgili kurumsal kartlar",
                "pill_grid": "Kompakt rozet ızgarası",
                "glass_dark_grid": "Koyu cam efektli özellik kutuları",
                "left_icon_minimal": "Sol ikonlu minimal satırlar",
                "numbered_accent_cards": "Numaralı renk vurgulu kartlar",
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
                "odometer_dark": "Koyu zemin dijital sayaç",
                "inline_ticker": "Yatay akışkan sayaç şeridi",
                "hero_stat_row": "Büyük tipografik vurgu satırı",
                "dark_glow_cards": "Koyu zemin parlak vurgu sayaçları",
                "bordered_minimal": "İnce çerçeveli zarif sayaçlar",
                "accent_pill_strip": "Renkli hap sayaç şeridi",
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
                "thermometer": "Dikey dolum göstergesi",
                "stepped_segments": "Parçalı blok çubuklar",
                "compact_pills": "Kompakt hedef etiketleri",
                "striped_urgent": "Acil kırmızı şeritli çubuklar",
                "dark_neon_bars": "Koyu zemin parlak ilerleme çubukları",
                "card_grouped_bars": "Gruplanmış özet kutu çubuklar",
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
                "circle_minimal": "Yuvarlak fotoğraf + minimal ortalı",
                "org_hierarchy": "Başkan üstte hiyerarşik şema",
                "hover_bio": "Üzerine gelince biyografi açılan",
                "circular_minimal": "Dairesel portre + minimal kart",
                "dark_executive_cards": "Koyu zemin yönetim kartları",
                "horizontal_bio_rows": "Yatay geniş biyografi satırları",
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
                "wall_of_trust": "Çift sıra ters yönlü kayan duvar",
                "badge_pills": "Kurum adı + rozetli haplar",
                "dark_monochrome_strip": "Koyu zemin tek renk logo bandı",
                "bordered_tiles": "Çerçeveli logo karoları",
                "two_row_centered": "İki sıra ortalı logo vitrini",
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
                "sticky_bar": "Sabit acil sayaç çubuğu",
                "dark_spotlight": "Koyu zemin dev rakamlar",
                "hero_banner": "Görselli tam genişlik banner",
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
                "year_tabs": "Yıllara göre tıklanabilir tarihçe",
                "milestone_dark": "Koyu zemin kilometre taşları",
                "glass_dark_timeline": "Koyu cam efektli zaman çizelgesi",
                "pill_badge_timeline": "Rozet haplı modern akış",
                "split_photo_timeline": "Fotoğraf önizlemeli tarihçe",
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
                "icon_cards": "İkonlu büyük sekme kartları",
                "split_sticky_tabs": "Sabit sol menü + sağ içerik",
                "underline_clean": "Minimal altı çizgili sekmeler",
                "dark_glass_tabs": "Koyu cam efektli sekmeler",
                "vertical_pill_tabs": "Dikey hap düğme sekmeler",
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
                "breaking_news_red": "Kırmızı son dakika şeridi",
                "glass_translucent": "Yarı saydam cam bant",
                "double_opposite": "Çift sıra zıt yönlü akış",
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
                "editorial_pullquote": "Dev tırnaklı editoryal alıntı",
                "split_highlight": "Sol vurgu + sağ kaynak kartı",
                "floating_paper": "Kağıt / parşömen dokulu alıntı",
                "islamic_calligraphy_box": "Hat/tezyinat çerçeveli alıntı kutusu",
                "dark_editorial_quote": "Koyu zemin büyük editoryal alıntı",
                "split_author_photo": "Yazar fotoğraflı iki sütun alıntı",
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
                "polaroid_scatter": "Polaroid fotoğraf duvarı",
                "horizontal_filmstrip": "Yatay sinema şeridi",
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
                "qr_showcase": "QR kod odaklı mobil ödeme",
                "accordion_banks": "Banka bazlı açılır akordeon",
                "copy_bar": "Tek satır hızlı kopyalama şeridi",
                "swift_international": "Yurt dışı SWIFT / BIC odaklı kartlar",
                "copy_grid_minimal": "Sadece banka + tek tık IBAN ızgarası",
                "compact_copy_rows": "Tek satır kompakt kopyala listesi",
                "dark_vault_cards": "Koyu kasa / premium IBAN kartları",
                "grouped_currency_tabs": "Döviz grubuna göre sekmeli IBAN",
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
                "top_drawer": "Üstten inen duyuru çekmecesi",
                "countdown_offer": "Geri sayımlı acil kampanya",
                "dark_ramadan_modal": "Koyu Ramazan / kandil özel pencere",
                "minimal_bottom_drawer": "Alttan çıkan sade duyuru bandı",
                "urgent_top_card": "Üst acil kırmızı bilgilendirme kartı",
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
            look=F("select", "Görünüm", choices={
                "slider": "Klasik sürgülü",
                "side_by_side": "Yan yana karşılaştırma",
                "toggle_switch": "Tek tuşla Önce/Sonra geçişi",
                "side_by_side_static": "Etiketli yan yana sabit vitrin",
                "dark_frame_compare": "Koyu sinema çerçeveli karşılaştırma",
                "captioned_split_compare": "Alt açıklamalı bölünmüş karşılaştırma",
            }, default="slider"),
            initial_position=F("number", "Başlangıç çizgisi (%)", min=10, max=90, default=50),
        ),
    },
    "bento_grid": {
        "label": "Bento Grid Vitrin", "group": "Metin & medya", "icon": "🍱",
        "help": "Farklı boyutlardaki modern kutularla proje, hizmet veya etki alanlarını sergiler.",
        "fields": _head(
            subtitle=F("textarea", "Açıklama", max=300, translatable=True),
            look=F("select", "Görünüm", choices={
                "mosaic": "Klasik mozaik",
                "magazine_asymmetric": "Asimetrik dergi vitrini",
                "glass_overlay": "Görsel üstü cam efektli",
                "minimal_border": "İnce çizgili modern",
                "dark_neon_bento": "Koyu zemin vurgulu bento",
                "photo_mosaic_bento": "Fotoğraf ağırlıklı mozaik",
                "minimal_outline_bento": "Çerçeveli sade kutular",
            }, default="mosaic"),
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
            look=F("select", "Görünüm", choices={
                "cards": "Klasik paket kartları",
                "comparison_table": "Karşılaştırma tablosu",
                "horizontal_rows": "Yatay paket satırları",
                "dark_vip": "Koyu VIP vitrin",
                "impact_equivalents": "Somut etki karşılığı",
                "ramadan_gold_tiers": "Ramazan altın varak paketler",
                "split_feature_tiers": "Sol özet + sağ paketler",
                "compact_horizontal_tiers": "Kompakt yatay paket şeridi",
            }, default="cards"),
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
            layout=F("select", "Düzen", choices={
                "grid": "Izgara",
                "carousel": "Kaydırmalı",
                "featured_playlist": "Büyük oynatıcı + liste",
                "reels_vertical": "Dikey Reels (9:16)",
                "dark_cinema": "Koyu sinema modu",
                "dark_cinema_grid": "Koyu sinema ızgarası",
                "featured_plus_thumbs": "Büyük video + alt küçük kartlar",
                "vertical_shorts_strip": "Dikey kısa video şeridi",
            }, default="grid"),
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
            look=F("select", "Görünüm", choices={
                "cards": "Görselli kartlar",
                "pills": "Kompakt bölge rozetleri",
                "split": "Liste + özet",
                "world_metrics": "Büyük rakamlı etki ızgarası",
                "dark_atlas": "Koyu zemin atlas kartları",
                "horizontal_strip": "Yatay kaydırmalı ülke şeridi",
                "dark_atlas_cards": "Koyu lacivert bölge kartları",
                "flag_stat_pills": "Bayraklı istatistik hapları",
                "photo_overlay_regions": "Fotoğraf üstü bölge vitrini",
            }, default="cards"),
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
            look=F("select", "Görünüm", choices={
                "split_sticky": "Klasik yapışkan görsel",
                "card_chapters": "Numaralı bölüm kartları",
                "dark_narrative": "Koyu zemin belgesel anlatım",
                "dark_chronicle": "Koyu kronolojik hikaye akışı",
                "numbered_chapters": "Büyük numaralı hikaye bölümleri",
                "minimal_split_story": "Sade iki sütun hikaye",
            }, default="split_sticky"),
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
            look=F("select", "Görünüm", choices={"standard": "Standart tam harita", "split_contact_map": "Sol adres kartı + sağ harita", "full_bleed_overlay": "Tam genişlik harita + yüzen adres"}, default="standard"),
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
            look=F("select", "Görünüm", choices={
                "cards": "İkonlu kartlar",
                "table_list": "Kurumsal belge tablosu",
                "shelf": "Rapor kapaklı yayın rafı",
                "compact_pills": "Kompakt indirme rozetleri",
                "dark_report_cards": "Koyu zemin rapor kartları",
                "icon_compact_rows": "İkonlu kompakt dosya satırları",
                "featured_pdf_banner": "Öne çıkan PDF indirme bandı",
            }, default="cards"),
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
            look=F("select", "Görünüm", choices={
                "centered_card": "Ortalanmış kutu",
                "inline_bar": "Tek satır yatay bant",
                "split_with_benefits": "Sol vaatler + sağ form",
                "floating_dark": "Koyu zemin vurgulu bant",
                "dark_gold_subscribe": "Koyu lacivert & altın abonelik",
                "floating_pill_form": "Yüzen hap form kutusu",
                "split_benefit_subscribe": "Avantaj listeli abonelik",
            }, default="centered_card"),
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
            look=F("select", "Görünüm", choices={
                "clean_list": "Sade liste",
                "boxed_grid": "Kutulu ızgara",
                "check_badges": "Onay rozetli yatay haplar",
                "timeline_mini": "Dikey mini akış",
                "two_col_check_pills": "İki sütun onaylı haplar",
                "dark_badge_list": "Koyu zemin rozetli liste",
                "bordered_step_list": "Çerçeveli adım listesi",
            }, default="clean_list"),
            columns=F("number", "Sütun", min=1, max=3, default=2),
            items=F("list", "Maddeler", max_items=24, min_items=1, item_label="title", fields={
                "icon": F("text", "İkon / Emoji", max=8, default="✓"),
                "title": F("text", "Başlık", max=100, translatable=True),
                "text": F("text", "Açıklama", max=240, translatable=True),
                "url": F("url", "Bağlantı (opsiyonel)"),
            }),
        ),
    },
    "live_donations": {
        "label": "Canlı Bağış Akışı", "group": "Güven & etki", "icon": "🔴",
        "help": "Son bağışları ve bağışçı onur duvarını sergileyerek sosyal kanıt oluşturur.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"ticker_strip": "Kayan canlı şerit", "feed_cards": "Son bağışlar listesi", "floating_toast": "Köşe bildirim kartı", "donor_wall": "Bağışçı onur duvarı"}, default="feed_cards"),
            items=F("list", "Bağış Kayıtları", max_items=20, item_label="donor", fields={
                "donor": F("text", "Bağışçı adı (ör. Ahmet Y.)", max=60),
                "amount": F("text", "Tutar (ör. 500 ₺)", max=30),
                "campaign": F("text", "Kampanya", max=80, translatable=True),
                "time_ago": F("text", "Zaman (ör. 5 dk önce)", max=30, translatable=True),
                "city": F("text", "Şehir", max=40),
            }),
        ),
    },
    "fidyah_calculator": {
        "label": "Fitre / Fidye Hesaplayıcı", "group": "Bağış", "icon": "🧮",
        "help": "Kişi ve gün sayısına göre fitre/fidye tutarını otomatik hesaplar ve bağışa yönlendirir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"card_widget": "Kompakt kart", "split_explainer": "Sol fıkhi bilgi + sağ hesaplayıcı", "dark_ramadan": "Koyu Ramazan vitrini"}, default="card_widget"),
            unit_amount=F("number", "Günlük / Kişi başı tutar (₺)", min=10, max=50000, default=180),
            default_people=F("number", "Varsayılan kişi sayısı", min=1, max=100, default=1),
            default_days=F("number", "Varsayılan gün sayısı", min=1, max=365, default=1),
            button_label=F("text", "Buton metni", max=40, default="Hesaplanan Tutarı Bağışla", translatable=True),
            button_url=F("url", "Bağış bağlantısı", default="/bagis"),
        ),
    },
    "transparency_bar": {
        "label": "Resmi İzin & Şeffaflık Bandı", "group": "Güven & etki", "icon": "🏛️",
        "help": "Valilik izni, DERBİS kodu, bağımsız denetim ve fon dağılım oranlarını gösterir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"official_seals": "Mühürlü rozet şeridi", "ledger_summary": "Gelir-gider % dağılım çubuğu", "verified_banner": "e-Devlet / İçişleri doğrulamalı bant"}, default="official_seals"),
            permit_no=F("text", "Valilik / DERBİS İzin No", max=80),
            field_pct=F("number", "Saha yardım oranı (%)", min=1, max=100, default=92),
            ops_pct=F("number", "Operasyon oranı (%)", min=0, max=99, default=8),
            items=F("list", "Mühür / Belgeler", max_items=8, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="✓"),
                "title": F("text", "Başlık", max=80, translatable=True),
                "code": F("text", "Belge / Kod", max=60),
                "url": F("url", "Doğrulama linki"),
            }),
        ),
    },
    "audio_player": {
        "label": "Ses / Sohbet / Podcast", "group": "Metin & medya", "icon": "🎧",
        "help": "Tilavet, sohbet veya saha ses kayıtlarını gömülü oynatıcı ile sunar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"minimal_bar": "Tek satır oynatıcı", "playlist_card": "Kapaklı oynatma listesi", "dark_studio": "Koyu stüdyo görünümü"}, default="playlist_card"),
            items=F("list", "Ses Kayıtları", max_items=12, min_items=1, item_label="title", fields={
                "title": F("text", "Başlık", max=120, translatable=True),
                "speaker": F("text", "Konuşmacı / Okuyan", max=80),
                "duration": F("text", "Süre (ör. 12:30)", max=20),
                "audio_url": F("url", "Ses dosyası URL (MP3)"),
                "cover_url": F("image", "Kapak görseli"),
            }),
        ),
    },
    "volunteer_cta": {
        "label": "Gönüllü Başvuru Kartı", "group": "Form & iletişim", "icon": "🤝",
        "help": "Gönüllü ve temsilci başvuruları için rol seçmeli çağrı bloğu.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"split_photo": "Saha fotoğraflı split", "role_cards": "Gönüllü rol kartları", "compact_banner": "Kompakt gönüllü bandı"}, default="role_cards"),
            image_url=F("image", "Görsel"),
            button_label=F("text", "Buton metni", max=40, default="Gönüllü Başvurusu Yap", translatable=True),
            button_url=F("url", "Başvuru linki", default="/iletisim"),
            items=F("list", "Gönüllü Rolleri", max_items=6, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="🤝"),
                "title": F("text", "Rol adı", max=80, translatable=True),
                "text": F("text", "Görev tanımı", max=200, translatable=True),
            }),
        ),
    },
    "press_mentions": {
        "label": "Basında Biz", "group": "Güven & etki", "icon": "📰",
        "help": "Haber kanalları ve basından alıntıları sergiler.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"logo_quotes": "Logo tıklamalı vitrin", "newspaper_cards": "Gazete kupürü kartları", "marquee_strip": "Kayan basın şeridi"}, default="newspaper_cards"),
            items=F("list", "Basın Haberleri", max_items=12, min_items=1, item_label="outlet", fields={
                "outlet": F("text", "Kurum / Gazete", max=60),
                "logo_url": F("image", "Logo"),
                "quote": F("textarea", "Alıntı / Manşet", max=300, translatable=True),
                "date": F("text", "Tarih", max=30),
                "url": F("url", "Haber linki"),
            }),
        ),
    },
    "impact_reports": {
        "label": "Saha Dağıtım Raporları", "group": "Güven & etki", "icon": "📦",
        "help": "Tamamlanan yardım dağıtımlarının tarih, konum ve yararlanıcı kanıtlarını sunar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"proof_grid": "Fotoğraflı kanıt kartları", "table_ledger": "Resmi dağıtım tablosu", "before_after_mini": "Özet sayaçlı kartlar"}, default="proof_grid"),
            columns=F("number", "Sütun", min=2, max=4, default=3),
            items=F("list", "Dağıtım Raporları", max_items=18, min_items=1, item_label="title", fields={
                "image_url": F("image", "Dağıtım fotoğrafı"),
                "location": F("text", "Konum (ör. Gazze / Çad)", max=60, translatable=True),
                "date": F("text", "Tarih", max=30),
                "beneficiaries": F("text", "Ulaşılan kişi (ör. 1.250 Aile)", max=40, translatable=True),
                "title": F("text", "Proje başlığı", max=100, translatable=True),
                "url": F("url", "Albüm / rapor linki"),
            }),
        ),
    },
    "qurbani_tracker": {
        "label": "Kurban Hisse & Kesim Takibi", "group": "Bağış", "icon": "🐑",
        "help": "Büyükbaş/küçükbaş hisse doluluk oranını, ülke bazlı hisse fiyatlarını ve kesim sürecini sergiler.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"share_cards": "7 hisseli görsel gösterge", "country_matrix": "Ülke karşılaştırmalı tablo", "urgent_shares": "Son kalan hisseler"}, default="share_cards"),
            columns=F("number", "Sütun", min=2, max=4, default=3),
            items=F("list", "Kurban Grupları", max_items=16, min_items=1, item_label="title", fields={
                "flag": F("text", "Bayrak", max=8, default="🌍"),
                "title": F("text", "Bölge / Tür (ör. Afrika Büyükbaş Hisse)", max=80, translatable=True),
                "amount": F("text", "Hisse tutarı (ör. 4.500 ₺)", max=30),
                "taken": F("number", "Alınan hisse", min=0, max=7, default=5),
                "total": F("number", "Toplam hisse", min=1, max=7, default=7),
                "url": F("url", "Bağış bağlantısı", default="/bagis"),
                "button_label": F("text", "Buton", max=32, default="Hisse Al", translatable=True),
            }),
        ),
    },
    "water_well_showcase": {
        "label": "Su Kuyusu Durum & Takip", "group": "Güven & etki", "icon": "💧",
        "help": "Planlanan, sondaj aşamasındaki ve açılan su kuyularını durum rozetleriyle gösterir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"status_cards": "Durum rozetli kartlar", "photo_wall": "Kuyu açılış duvarı", "progress_list": "Aşamalı ilerleme listesi"}, default="status_cards"),
            columns=F("number", "Sütun", min=2, max=4, default=3),
            items=F("list", "Su Kuyuları", max_items=18, min_items=1, item_label="title", fields={
                "image_url": F("image", "Kuyu fotoğrafı"),
                "status": F("select", "Durum", choices={"opened": "Açıldı ✓", "drilling": "Sondaj Aşamasında", "planned": "Planlanan"}, default="opened"),
                "country": F("text", "Ülke / Köy", max=60, translatable=True),
                "title": F("text", "Kuyu adı", max=100, translatable=True),
                "beneficiaries": F("text", "Faydalanan (ör. 1.500 Kişi)", max=40, translatable=True),
                "url": F("url", "Detay / bağış linki"),
            }),
        ),
    },
    "scholarship_showcase": {
        "label": "Burs & Hafızlık Destek", "group": "Bağış", "icon": "🎓",
        "help": "Aylık öğrenci bursu, hafızlık icazet ve medrese destek paketlerini sunar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"student_impact": "Burs karşılığı etki kartları", "monthly_pledge": "Düzenli burs seçici", "dark_academy": "Koyu kurumsal eğitim vitrini"}, default="student_impact"),
            columns=F("number", "Sütun", min=2, max=4, default=3),
            items=F("list", "Burs Paketleri", max_items=12, min_items=1, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="📖"),
                "badge": F("text", "Etiket (ör. Aylık Burs)", max=32, translatable=True),
                "title": F("text", "Paket adı", max=80, translatable=True),
                "amount": F("text", "Tutar (ör. 1.500 ₺ / ay)", max=30),
                "text": F("textarea", "Açıklama", max=240, translatable=True),
                "url": F("url", "Bağış linki", default="/bagis"),
                "button_label": F("text", "Buton", max=32, default="Burs Ver", translatable=True),
            }),
        ),
    },
    "impact_comparison": {
        "label": "Karşılaştırmalı Etki Matrisi", "group": "Bağış", "icon": "⚖️",
        "help": "Tek seferlik ve düzenli bağışın ya da farklı tutarların etkisini yan yana kıyaslar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"side_by_side_matrix": "2 sütun karşılaştırma", "tabbed_comparison": "Tutar sekmeli etki", "highlight_cards": "Vurgulu etki kartları"}, default="side_by_side_matrix"),
            items=F("list", "Karşılaştırma Kalemleri", max_items=12, min_items=1, item_label="title", fields={
                "badge": F("text", "Seçenek (ör. Aylık Düzenli)", max=40, translatable=True),
                "title": F("text", "Başlık", max=80, translatable=True),
                "amount": F("text", "Örnek tutar", max=30),
                "points": F("textarea", "Sağladığı etkiler (her satır bir madde)", max=500, translatable=True),
                "highlighted": F("bool", "Öne çıkar", default=False),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "corporate_giving": {
        "label": "Kurumsal Sponsorluk (CSR)", "group": "Bağış", "icon": "🏢",
        "help": "Şirketler için kurumsal sosyal sorumluluk paketleri ve sponsorluk çağrısı.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"tier_cards": "Altın / Gümüş / Bronz kademeler", "csr_split": "Sol kurumsal bilgi + sağ başvuru", "logo_partners": "Destekçi şirket vitrini"}, default="tier_cards"),
            button_label=F("text", "Buton metni", max=40, default="Kurumsal İletişim", translatable=True),
            button_url=F("url", "Bağlantı", default="/iletisim"),
            items=F("list", "Sponsorluk Kademeleri", max_items=8, min_items=1, item_label="title", fields={
                "badge": F("text", "Kademe (ör. Altın Sponsor)", max=32, translatable=True),
                "title": F("text", "Başlık", max=80, translatable=True),
                "amount": F("text", "Katkı tutarı", max=30),
                "text": F("textarea", "Avantajlar / kapsam", max=300, translatable=True),
                "url": F("url", "Başvuru linki"),
            }),
        ),
    },
    "donation_quiz": {
        "label": "Etkileşimli Bağış Yönlendirici", "group": "Etkileşim", "icon": "🧭",
        "help": "Ziyaretçiye ilgi alanını seçtirip en uygun kampanyaya veya bağış tutarına yönlendirir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"card_selector": "İkonlu seçim kartları", "step_wizard": "Adımlı yönlendirici"}, default="card_selector"),
            items=F("list", "Yardım Alanları", max_items=8, min_items=2, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="🤲"),
                "title": F("text", "Alan adı (ör. Acil Yardım)", max=60, translatable=True),
                "text": F("text", "Kısa açıklama", max=160, translatable=True),
                "suggested_amount": F("number", "Önerilen tutar (₺)", min=10, max=100000, default=500),
                "url": F("url", "Yönlendirilecek link", default="/bagis"),
            }),
        ),
    },
    "prayer_calendar": {
        "label": "Ramazan & Mübarek Günler Bandı", "group": "Banner", "icon": "🕌",
        "help": "Mübarek gün ve geceleri, iftar/sahur veya Ramazan takvimini şık bir bantta gösterir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"compact_strip": "Üst ince bant", "ramadan_table": "Özel günler takvim kartı", "dark_gold_card": "Altın varaklı koyu kart"}, default="dark_gold_card"),
            hijri_date=F("text", "Hicri tarih / dönem (ör. Ramazan 1447)", max=60, translatable=True),
            button_label=F("text", "Buton metni", max=40, default="İftar Bağışı Yap", translatable=True),
            button_url=F("url", "Bağlantı", default="/bagis"),
            items=F("list", "Özel Günler", max_items=10, item_label="title", fields={
                "date": F("text", "Tarih", max=40),
                "title": F("text", "Gün / Gece adı", max=80, translatable=True),
                "note": F("text", "Not / fazilet", max=120, translatable=True),
            }),
        ),
    },
    "daily_charity": {
        "label": "Günlük / Mikro İnfak", "group": "Bağış", "icon": "🪙",
        "help": "Küçük günlük katkıların bir yılda oluşturacağı büyük etkiyi gösterir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"micro_cards": "Günlük/haftalık kartlar", "coffee_equivalent": "Harcama kıyaslaması", "streak_tracker": "Yıllık etki göstergesi"}, default="micro_cards"),
            items=F("list", "Mikro İnfak Seçenekleri", max_items=8, min_items=1, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="🪙"),
                "daily_amount": F("text", "Günlük tutar (ör. 20 ₺ / gün)", max=30),
                "yearly_impact": F("text", "Yıllık etki (ör. 7.300 ₺ = 14 Koli)", max=80, translatable=True),
                "title": F("text", "Başlık", max=80, translatable=True),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "perpetual_charity": {
        "label": "Sadaka-i Cariye / Kalıcı Eser", "group": "Bağış", "icon": "🏗️",
        "help": "Cami, okul, aşevi, yetimhane inşaatları için tuğla/metrekare/hisse bazlı vitrin.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"project_cards": "Aşama rozetli proje kartları", "brick_progress": "Tuğla/hisse doluluk çubuğu", "blueprint_split": "Detaylı proje + hisse alımı"}, default="project_cards"),
            columns=F("number", "Sütun", min=2, max=4, default=3),
            items=F("list", "Kalıcı Eser Projeleri", max_items=12, min_items=1, item_label="title", fields={
                "image_url": F("image", "Proje görseli"),
                "stage": F("text", "Aşama (ör. Kaba İnşaat %65)", max=40, translatable=True),
                "title": F("text", "Eser adı", max=100, translatable=True),
                "unit_price": F("text", "Hisse / Tuğla tutarı (ör. 1.000 ₺)", max=30),
                "percent": F("number", "Tamamlanma (%)", min=0, max=100, default=65),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "family_sponsorship": {
        "label": "Kardeş Aile Eşleştirme", "group": "Bağış", "icon": "🏠",
        "help": "Anonim aile kodu ve ihtiyaç kalemleriyle aile sponsorluğu kartları.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"anonymized_cards": "Aile kartları", "need_breakdown": "İhtiyaç kalemi çubukları", "urgent_families": "Acil destek bekleyen aileler"}, default="anonymized_cards"),
            columns=F("number", "Sütun", min=2, max=4, default=3),
            items=F("list", "Aile Kartları", max_items=12, min_items=1, item_label="code", fields={
                "code": F("text", "Aile kodu (ör. AİLE-402)", max=30),
                "location": F("text", "Şehir / Bölge", max=60, translatable=True),
                "members": F("text", "Hane (ör. 5 Kişi · 3 Çocuk)", max=40, translatable=True),
                "need": F("text", "İhtiyaç (ör. Kira & Gıda)", max=80, translatable=True),
                "amount": F("text", "Aylık tutar (ör. 2.500 ₺)", max=30),
                "url": F("url", "Destek linki", default="/bagis"),
            }),
        ),
    },
    "fiqh_guide": {
        "label": "Fıkhi Bağış Rehberi", "group": "Etkileşim", "icon": "📚",
        "help": "Zekât, fitre, kurban, adak ve akika hükümlerini özet kartlarla sunar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"topic_cards": "Konu kartları", "searchable_rulings": "Aramalı rehber", "accordion_fatwa": "Soru-cevap akordeon"}, default="topic_cards"),
            items=F("list", "Fıkhi Konular", max_items=16, min_items=1, item_label="title", fields={
                "badge": F("text", "Kategori (ör. Zekat / Kurban)", max=32, translatable=True),
                "title": F("text", "Konu başlığı", max=120, translatable=True),
                "summary": F("textarea", "Özet hüküm / açıklama", max=500, translatable=True),
                "url": F("url", "Detay / Bağış linki"),
            }),
        ),
    },
    "events_calendar": {
        "label": "Etkinlik & Kermes Takvimi", "group": "Haber & iletişim", "icon": "📅",
        "help": "Yaklaşan kermes, iftar programı, kuyu açılış yayını veya seminer duyuruları.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"upcoming_list": "Tarih rozetli liste", "event_cards": "Görselli etkinlik kartları", "featured_next_event": "En yakın etkinlik vurgulu"}, default="event_cards"),
            items=F("list", "Etkinlikler", max_items=12, min_items=1, item_label="title", fields={
                "image_url": F("image", "Etkinlik görseli"),
                "date": F("text", "Tarih & Saat (ör. 22 Mayıs · 14:00)", max=40),
                "location": F("text", "Yer / Online", max=80, translatable=True),
                "title": F("text", "Etkinlik adı", max=100, translatable=True),
                "url": F("url", "Kayıt / detay linki"),
            }),
        ),
    },
    "sms_donate": {
        "label": "SMS & Kısa Kod Bağışı", "group": "Bağış", "icon": "📱",
        "help": "Anahtar kelime ve kısa numara ile SMS bağış çağrısı yapar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"operator_cards": "Anahtar kelime kartları", "dark_sms_strip": "Koyu vurgulu şerit", "copy_code_banner": "Büyük kod bandı"}, default="operator_cards"),
            items=F("list", "SMS Kodları", max_items=8, min_items=1, item_label="keyword", fields={
                "keyword": F("text", "Anahtar kelime (ör. YARDIM)", max=30),
                "shortcode": F("text", "Kısa numara (ör. 4042)", max=16),
                "amount": F("text", "Bağış bedeli (ör. 50 ₺)", max=30),
                "note": F("text", "Açıklama", max=120, translatable=True),
            }),
        ),
    },
    "app_promo": {
        "label": "Mobil Uygulama / Kanal Tanıtımı", "group": "Banner", "icon": "📲",
        "help": "Derneğin mobil uygulaması veya WhatsApp duyuru kanalı için tanıtım bloğu.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"phone_mockup_split": "Telefon önizlemeli", "qr_download_card": "QR kodlu indirme kartı", "dark_app_banner": "Koyu tanıtım bandı"}, default="phone_mockup_split"),
            image_url=F("image", "Uygulama ekran görüntüsü / QR"),
            ios_url=F("url", "App Store bağlantısı"),
            android_url=F("url", "Google Play bağlantısı"),
            whatsapp_url=F("url", "WhatsApp Kanalı bağlantısı"),
        ),
    },
    "proxy_donation": {
        "label": "Adak / Akika / Şükür Vekalet", "group": "Bağış", "icon": "🤲",
        "help": "Kurban niyet türlerini (Adak, Akika, Şükür, Şifa) seçtirerek vekalet bağışına yönlendirir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"intent_cards": "Niyet kartları", "quick_proxy_bar": "Tek satır hızlı vekalet", "dark_qurbani": "Koyu kurban vitrini"}, default="intent_cards"),
            items=F("list", "Niyet Türleri", max_items=8, min_items=1, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="🐑"),
                "title": F("text", "Niyet adı (ör. Adak Kurbanı)", max=60, translatable=True),
                "amount": F("text", "Tutar (ör. 4.500 ₺)", max=30),
                "text": F("text", "Kısa bilgi", max=160, translatable=True),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "impact_chart": {
        "label": "Fon Dağılım & Etki Grafiği", "group": "Güven & etki", "icon": "📈",
        "help": "Bağışların alanlara göre % dağılımını görselleştirir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"donut_breakdown": "Halka özet + kalem listesi", "horizontal_bars": "Yatay dağılım çubukları", "annual_comparison": "Yıllık kıyaslama kartları"}, default="horizontal_bars"),
            items=F("list", "Dağılım Kalemleri", max_items=8, min_items=1, item_label="label", fields={
                "label": F("text", "Alan (ör. Gıda & Acil Yardım)", max=80, translatable=True),
                "percent": F("number", "Oran (%)", min=1, max=100, default=35),
                "amount": F("text", "Tutar / Not (isteğe bağlı)", max=40),
            }),
        ),
    },
    "branches_directory": {
        "label": "Şubeler & Temsilcilikler", "group": "Haber & iletişim", "icon": "📍",
        "help": "İl/ilçe veya ülke bazlı şube ve temsilcilik rehberi.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"city_cards": "Şehir kartları", "compact_directory": "Kompakt rehber listesi", "regional_tabs": "Bölge bazlı kartlar"}, default="city_cards"),
            columns=F("number", "Sütun", min=2, max=4, default=3),
            items=F("list", "Şubeler", max_items=24, min_items=1, item_label="city", fields={
                "city": F("text", "Şehir / Bölge", max=60, translatable=True),
                "address": F("text", "Adres", max=160, translatable=True),
                "phone": F("text", "Telefon", max=40),
                "map_url": F("url", "Harita linki"),
            }),
        ),
    },
    "gift_certificate": {
        "label": "Hediye Bağış & Sertifika", "group": "Bağış", "icon": "🎁",
        "help": "Sevdikleriniz adına bağış ve dijital tebrik sertifikası önizlemesi.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"certificate_preview": "Canlı sertifika önizlemeli", "occasion_cards": "Özel gün kartları", "split_gift": "Görselli hediye kartı"}, default="certificate_preview"),
            button_label=F("text", "Buton metni", max=40, default="Hediye Bağış Oluştur", translatable=True),
            button_url=F("url", "Bağış linki", default="/bagis"),
            items=F("list", "Özel Günler", max_items=8, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="🎁"),
                "title": F("text", "Vesile (ör. Doğum Günü / Taziye)", max=60, translatable=True),
                "text": F("text", "Kısa açıklama", max=140, translatable=True),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "help_desk_card": {
        "label": "Canlı Destek & Danışma Kartı", "group": "Form & iletişim", "icon": "🎧",
        "help": "Telefon, WhatsApp, e-posta ve çalışma saatlerini tek şık destek kartında toplar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"floating_support_card": "Yüzen destek kartı", "split_concierge": "İki sütunlu danışma", "dark_help_bar": "Koyu destek bandı"}, default="floating_support_card"),
            phone=F("text", "Telefon", max=40),
            whatsapp=F("text", "WhatsApp", max=40),
            email=F("text", "E-posta", max=100),
            hours=F("text", "Çalışma saatleri (ör. Hafta içi 09:00 - 18:00)", max=80, translatable=True),
        ),
    },
    "milestone_tracker": {
        "label": "Proje Aşama Takipçisi", "group": "Güven & etki", "icon": "🚧",
        "help": "Büyük bir projenin adım adım ilerleme durumunu yüzdesiyle gösterir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"horizontal_stepper": "Yatay aşama çubuğu", "vertical_log": "Dikey ilerleme günlüğü", "card_progress": "Kartlı aşamalar"}, default="horizontal_stepper"),
            items=F("list", "Aşamalar", max_items=8, min_items=1, item_label="title", fields={
                "step": F("text", "Adım (ör. Faz 1)", max=20),
                "title": F("text", "Başlık", max=80, translatable=True),
                "status": F("select", "Durum", choices={"done": "Tamamlandı ✓", "active": "Devam Ediyor", "pending": "Planlandı"}, default="done"),
                "date": F("text", "Tarih", max=30),
            }),
        ),
    },
    "awards_badges": {
        "label": "Ödüller & Akreditasyonlar", "group": "Güven & etki", "icon": "🏆",
        "help": "Kamu yararı statüsü, ISO belgeleri ve kurum ödüllerini sergiler.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"gold_crests": "Altın rozetli kartlar", "minimal_strip": "Sade yatay şerit", "card_grid": "Belge ızgarası"}, default="gold_crests"),
            items=F("list", "Ödül / Belge", max_items=12, min_items=1, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="🏆"),
                "year": F("text", "Yıl", max=12),
                "title": F("text", "Ödül / Belge adı", max=100, translatable=True),
                "issuer": F("text", "Veren kurum", max=80, translatable=True),
            }),
        ),
    },
    "iftar_counter": {
        "label": "İftar & Kumanya Sayacı", "group": "Bağış", "icon": "🍲",
        "help": "Günlük iftar ve kumanya hedefini canlı çubuk ve 1/5/10 adet hızlı butonlarla gösterir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"meal_cards": "Yemek/kumanya kartları", "ramadan_progress": "Hedef çubuklu sayaç", "dark_gold_iftar": "Altın varaklı koyu vitrin"}, default="meal_cards"),
            items=F("list", "Paketler", max_items=6, min_items=1, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="🍲"),
                "title": F("text", "Başlık (ör. 1 Kişilik İftar)", max=80, translatable=True),
                "unit_price": F("number", "Birim tutar (₺)", min=10, max=50000, default=150),
                "collected_count": F("number", "Ulaşılan adet", min=0, max=1000000, default=320),
                "target_count": F("number", "Hedef adet", min=1, max=1000000, default=500),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "facility_rooms": {
        "label": "Külliye / Yetimhane Bölüm Sponsorluğu", "group": "Bağış", "icon": "🏫",
        "help": "Sınıf, mescit, kütüphane, yemekhane, revir gibi bölümleri ayrı sponsorluk kartı olarak sunar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"room_cards": "Bölüm kartları", "blueprint_grid": "Mimari plan ızgarası", "progress_rooms": "Doluluk çubuklu bölümler"}, default="room_cards"),
            columns=F("number", "Sütun", min=2, max=4, default=3),
            items=F("list", "Bölümler", max_items=12, min_items=1, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="📚"),
                "title": F("text", "Bölüm adı (ör. Kütüphane)", max=80, translatable=True),
                "amount": F("text", "Sponsorluk bedeli", max=30),
                "status": F("text", "Durum (ör. %60 Tamamlandı)", max=40, translatable=True),
                "url": F("url", "Sponsorluk linki", default="/bagis"),
            }),
        ),
    },
    "memory_wall": {
        "label": "Bağışçı Dilek & Hatıra Duvarı", "group": "Güven & etki", "icon": "🕊️",
        "help": "Bağışçıların iyi dilek notlarını veya merhum yakınları adına bırakılan hatıraları sergiler.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"wish_cards": "Dilek kartları", "memorial_plaques": "Hatıra plaketleri", "masonry_notes": "Duvar notları (Masonry)"}, default="wish_cards"),
            items=F("list", "Notlar", max_items=16, min_items=1, item_label="author", fields={
                "author": F("text", "İsim", max=60),
                "dedicated_to": F("text", "İthaf (ör. Merhum Ali Bey adına)", max=80, translatable=True),
                "note": F("textarea", "Not / Dua", max=280, translatable=True),
                "date": F("text", "Tarih", max=30),
            }),
        ),
    },
    "medical_relief": {
        "label": "Sağlık & Katarakt Yardımları", "group": "Bağış", "icon": "🏥",
        "help": "Katarakt ameliyatı, tekerlekli sandalye, ilaç ve mobil klinik destekleri.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"treatment_cards": "Tedavi paket kartları", "impact_before_after": "Etki vurgulu kartlar", "dark_clinic": "Koyu sağlık vitrini"}, default="treatment_cards"),
            columns=F("number", "Sütun", min=2, max=4, default=3),
            items=F("list", "Sağlık Destekleri", max_items=12, min_items=1, item_label="title", fields={
                "image_url": F("image", "Görsel"),
                "badge": F("text", "Etiket (ör. 1 Ameliyat)", max=32, translatable=True),
                "title": F("text", "Başlık", max=80, translatable=True),
                "amount": F("text", "Tutar (ör. 3.000 ₺)", max=30),
                "text": F("textarea", "Açıklama", max=220, translatable=True),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "alumni_stories": {
        "label": "Mezun / Öğrenci Hikayeleri", "group": "Güven & etki", "icon": "🎓",
        "help": "Burs veya eğitim desteğiyle mezun olan öğrencilerin başarı hikayeleri.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"story_cards": "Hikaye kartları", "quote_spotlight": "Büyük alıntı vitrini", "timeline_journey": "Eğitim yolculuğu"}, default="story_cards"),
            items=F("list", "Hikayeler", max_items=12, min_items=1, item_label="name", fields={
                "image_url": F("image", "Fotoğraf"),
                "name": F("text", "Ad / Rumuz", max=60),
                "program": F("text", "Bölüm / Derece (ör. Tıp Fakültesi · Hafız)", max=80, translatable=True),
                "quote": F("textarea", "Hikaye / Teşekkür", max=360, translatable=True),
            }),
        ),
    },
    "relief_checklist": {
        "label": "Acil İhtiyaç Listesi", "group": "Bağış", "icon": "📋",
        "help": "Kriz bölgesindeki somut ihtiyaçları birim fiyatı ve aciliyet durumuyla listeler.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"supply_grid": "İhtiyaç kutuları", "urgent_table": "Acil ihtiyaç tablosu", "compact_needs": "Kompakt ihtiyaç şeridi"}, default="supply_grid"),
            items=F("list", "İhtiyaç Kalemleri", max_items=16, min_items=1, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="📦"),
                "title": F("text", "Malzeme (ör. Kışlık Battaniye)", max=80, translatable=True),
                "amount": F("text", "Birim tutar (ör. 250 ₺)", max=30),
                "urgency": F("select", "Aciliyet", choices={"critical": "Çok Acil", "high": "Yüksek", "normal": "Normal"}, default="high"),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "social_feed_grid": {
        "label": "Sosyal Medya Saha Kareleri", "group": "Metin & medya", "icon": "📸",
        "help": "Instagram/YouTube tarzı kare saha fotoğrafları ve sosyal medya takip çağrısı.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"instagram_grid": "Kare fotoğraf ızgarası", "story_highlights": "Yuvarlak öne çıkanlar", "dark_gallery": "Koyu galeri vitrini"}, default="instagram_grid"),
            handle=F("text", "Hesap adı (ör. @kurumresmi)", max=60),
            profile_url=F("url", "Profil bağlantısı"),
            items=F("list", "Gönderiler", max_items=12, min_items=1, item_label="caption", fields={
                "image_url": F("image", "Görsel"),
                "caption": F("text", "Kısa açıklama", max=120, translatable=True),
                "url": F("url", "Gönderi linki"),
            }),
        ),
    },
    "recurring_planner": {
        "label": "Düzenli Bağış / Kumbara Planlayıcı", "group": "Bağış", "icon": "🪙",
        "help": "Aylık/haftalık düzenli infak tutarı seçtirip yıllık etkiyi hesaplayan interaktif planlayıcı.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"slider_calc": "Kaydırıcılı etki hesaplayıcı", "tier_toggle": "Aylık/Yıllık sekmeli paketler", "dark_gold": "Koyu zemin altın kumbara"}, default="slider_calc"),
            default_amount=F("number", "Varsayılan aylık tutar (₺)", min=50, max=50000, default=300),
            unit_label=F("text", "Birim etki etiketi (ör. 100 ₺ = 1 sıcak yemek)", max=80, translatable=True),
            unit_price=F("number", "Birim tutar (₺)", min=10, max=10000, default=100),
            button_label=F("text", "Buton yazısı", max=40, default="Düzenli Bağışa Başla", translatable=True),
            button_url=F("url", "Bağış linki", default="/bagis"),
        ),
    },
    "field_representatives": {
        "label": "Saha Temsilcileri & İl Sorumluları", "group": "Güven & etki", "icon": "📍",
        "help": "İl veya ülke bazlı temsilcilik, koordinatör ve iletişim kartları.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"cards_grid": "Temsilci kartları", "compact_directory": "Kompakt rehber tablosu", "regional_tabs": "Bölge filtreli temsilciler"}, default="cards_grid"),
            items=F("list", "Temsilciler", max_items=24, min_items=1, item_label="city", fields={
                "region": F("text", "Bölge / Ülke", max=40, default="Türkiye", translatable=True),
                "city": F("text", "İl / Şehir", max=50, translatable=True),
                "name": F("text", "Temsilci Adı", max=80),
                "phone": F("text", "Telefon", max=30),
                "whatsapp": F("text", "WhatsApp (905...)", max=30),
                "status": F("text", "Durum (ör. Aktif Saha)", max=40, translatable=True),
            }),
        ),
    },
    "qurbani_status": {
        "label": "Kurban Kesim & Vekalet Sorgu", "group": "Bağış", "icon": "🐑",
        "help": "Hisse kodu veya telefon ile kurban kesim aşamalarını ve video teslimini gösteren vitrin.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"lookup_card": "Sorgu kartı + aşama önizleme", "timeline_preview": "Kesim süreç akışı", "dark_verified": "Koyu onaylı vekalet vitrini"}, default="lookup_card"),
            placeholder=F("text", "Sorgu kutusu ipucu", max=80, default="Bağış kodunuz veya 05XX...", translatable=True),
            support_url=F("url", "Destek / WhatsApp linki", default="/iletisim"),
            items=F("list", "Örnek Aşamalar", max_items=6, item_label="title", fields={
                "step": F("text", "Adım No", max=10),
                "title": F("text", "Aşama Başlığı", max=60, translatable=True),
                "detail": F("text", "Açıklama", max=140, translatable=True),
            }),
        ),
    },
    "impact_bundles": {
        "label": "Hazır Yardım Paketleri", "group": "Bağış", "icon": "🧺",
        "help": "Birden fazla yardım kalemini tek pakette birleştiren bağış sepeti kartları.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"bundle_cards": "Paket kartları", "comparison_columns": "Karşılaştırmalı paketler", "compact_rows": "Liste halinde paketler"}, default="bundle_cards"),
            items=F("list", "Paketler", max_items=9, min_items=1, item_label="title", fields={
                "badge": F("text", "Üst rozet (ör. En Çok Tercih Edilen)", max=36, translatable=True),
                "title": F("text", "Paket Adı", max=80, translatable=True),
                "price": F("text", "Tutar (ör. 1.250 ₺)", max=30),
                "contents": F("textarea", "Paket içeriği (her satıra bir kalem)", max=300, translatable=True),
                "url": F("url", "Bağış linki", default="/bagis"),
                "button_label": F("text", "Buton", max=32, default="Paketi Bağışla", translatable=True),
            }),
        ),
    },
    "publications_shelf": {
        "label": "Yayınlar, Dergi & Bülten Rafı", "group": "Metin & medya", "icon": "📚",
        "help": "Vakıf/dernek dergileri, yıllık faaliyet raporları ve PDF kitaplar için kapaklı raf.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"magazine_grid": "Dergi kapak ızgarası", "shelf_carousel": "Kitaplık şeridi", "featured_issue": "Öne çıkan sayı + arşiv"}, default="magazine_grid"),
            items=F("list", "Yayınlar", max_items=12, min_items=1, item_label="title", fields={
                "image_url": F("image", "Kapak Görseli"),
                "issue": F("text", "Sayı / Yıl (ör. Sayı 42 · 2026)", max=40, translatable=True),
                "title": F("text", "Yayın Başlığı", max=100, translatable=True),
                "summary": F("textarea", "Kısa özet", max=220, translatable=True),
                "file_url": F("url", "PDF / Okuma linki"),
            }),
        ),
    },
    "convoy_tracker": {
        "label": "Yardım Konvoyu / Lojistik Takibi", "group": "Güven & etki", "icon": "🚚",
        "help": "Yola çıkan yardım tırları, konteynerler ve gemilerin rota ve ulaşım durumu.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"route_cards": "Rota & ilerleme kartları", "live_status_list": "Canlı lojistik listesi", "dark_dispatch": "Koyu sevkiyat paneli"}, default="route_cards"),
            items=F("list", "Konvoylar", max_items=10, min_items=1, item_label="title", fields={
                "code": F("text", "Konvoy Kodu (ör. TIR-104)", max=24),
                "title": F("text", "Rota (ör. İstanbul → Gazze / Halep)", max=100, translatable=True),
                "cargo": F("text", "Yük içeriği (ör. 24 Ton Un & Battaniye)", max=120, translatable=True),
                "progress": F("number", "Ulaşım yüzdesi (%)", min=0, max=100, default=75),
                "status": F("text", "Durum (ör. Sınır Kapısında)", max=40, translatable=True),
            }),
        ),
    },
    "tax_exemption_info": {
        "label": "Vergi Muafiyeti & Resmi Avantajlar", "group": "Güven & etki", "icon": "🏛️",
        "help": "Kamu yararına statü, gelir/kurumlar vergisi indirimi ve dekont bilgilendirmesi.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"split_summary": "İki sütun özet + oranlar", "step_cards": "Vergi indirimi adımları", "official_badge_box": "Resmi mevzuat rozet kutusu"}, default="split_summary"),
            law_ref=F("text", "Mevzuat / Karar No", max=80, placeholder="Bakanlar Kurulu Kararı / GVK Md. 89", translatable=True),
            button_label=F("text", "Buton yazısı", max=40, default="Kurumsal İletişim", translatable=True),
            button_url=F("url", "Bağlantı", default="/iletisim"),
            items=F("list", "Avantaj Maddeleri", max_items=8, item_label="title", fields={
                "badge": F("text", "Oran / Rozet (ör. %100 İndirim)", max=30, translatable=True),
                "title": F("text", "Başlık", max=80, translatable=True),
                "text": F("textarea", "Açıklama", max=220, translatable=True),
            }),
        ),
    },
    "crisis_regions_map": {
        "label": "Küresel Kriz Bölgeleri Panosu", "group": "Güven & etki", "icon": "🌍",
        "help": "Çalışılan kriz bölgelerini aciliyet, aktif ekip sayısı ve doğrudan bağış linkiyle listeler.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"status_grid": "Bölge durum kartları", "dark_command_center": "Koyu kriz kontrol paneli", "compact_pills": "Kompakt bölge şeridi"}, default="status_grid"),
            items=F("list", "Kriz Bölgeleri", max_items=12, min_items=1, item_label="region", fields={
                "flag": F("text", "Bayrak / Simge", max=8, default="🌍"),
                "region": F("text", "Bölge / Ülke", max=60, translatable=True),
                "urgency": F("select", "Aciliyet", choices={"critical": "Kritik", "high": "Yüksek", "active": "Aktif"}, default="critical"),
                "teams": F("text", "Ekip / Tır bilgisi (ör. 12 Saha Ekibi)", max=50, translatable=True),
                "need": F("text", "Öncelikli ihtiyaç", max=100, translatable=True),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "nisab_rates_bar": {
        "label": "Nisap, Fitre & Fidye Birim Bandı", "group": "Bağış", "icon": "⚖️",
        "help": "Güncel altın/gümüş nisap eşiği, fitre ve fidye birim tutarlarını tek bakışta gösterir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"ticker_strip": "Kompakt bilgi şeridi", "cards_row": "Dörtlü oran kartları", "dark_gold_table": "Koyu altın varak tablo"}, default="cards_row"),
            items=F("list", "Birimler", max_items=6, min_items=1, item_label="label", fields={
                "icon": F("text", "Simge", max=8, default="🪙"),
                "label": F("text", "Kalem (ör. 2026 Fitre)", max=60, translatable=True),
                "value": F("text", "Tutar / Miktar (ör. 180 ₺)", max=40),
                "note": F("text", "Kısa not", max=80, translatable=True),
            }),
        ),
    },
    "mushaf_distribution": {
        "label": "Mushaf & Eğitim Materyali Dağıtımı", "group": "Güven & etki", "icon": "📖",
        "help": "Ülkelere göre dağıtılan Kur'an-ı Kerim, Elif-Ba ve eğitim materyali adetlerini sergiler.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"counter_cards": "Ülke sayaç kartları", "country_breakdown": "Dağıtım tablosu", "featured_spotlight": "Öne çıkan mushaf bağışı"}, default="counter_cards"),
            unit_price=F("text", "1 Mushaf bedeli (ör. 150 ₺)", max=30, default="150 ₺"),
            button_label=F("text", "Buton yazısı", max=40, default="Mushaf Hediye Et", translatable=True),
            button_url=F("url", "Bağış linki", default="/bagis"),
            items=F("list", "Ülke Dağıtımları", max_items=12, min_items=1, item_label="country", fields={
                "country": F("text", "Ülke / Bölge", max=60, translatable=True),
                "count": F("text", "Dağıtılan Adet (ör. 14.500+)", max=30),
                "note": F("text", "Detay (ör. Medrese & Hafızlık)", max=80, translatable=True),
            }),
        ),
    },
    "governance_board": {
        "label": "Yönetim & Denetim Kurulu", "group": "Güven & etki", "icon": "🏛️",
        "help": "Yönetim kurulu, denetim komisyonu ve kurumsal şeffaflık sorumlularını listeler.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"board_grid": "Kurul kartları", "list_with_roles": "Görev & komisyon listesi", "dark_executive": "Koyu kurumsal vitrin"}, default="board_grid"),
            items=F("list", "Üyeler", max_items=20, min_items=1, item_label="name", fields={
                "image_url": F("image", "Fotoğraf"),
                "name": F("text", "Ad Soyad", max=80),
                "role": F("text", "Kurul Görevi", max=80, translatable=True),
                "committee": F("text", "Komisyon / Birim", max=60, translatable=True),
            }),
        ),
    },
    "donor_tiers_wall": {
        "label": "Hayırsever Destek Kademeleri", "group": "Bağış", "icon": "🏅",
        "help": "Su Kuyusu Banisi, Yetim Hamisi, Hafız Destekçisi gibi manevi destek kademelerini sunar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"tier_cards": "Kademe kartları", "badge_strip": "Rozet şeridi", "dark_honor_roll": "Koyu onur duvarı"}, default="tier_cards"),
            items=F("list", "Kademeler", max_items=6, min_items=1, item_label="title", fields={
                "icon": F("text", "Rozet", max=8, default="🏅"),
                "title": F("text", "Kademe Adı", max=60, translatable=True),
                "amount": F("text", "Destek Tutarı / Periyot", max=40, translatable=True),
                "impact": F("textarea", "Sağladığı etki", max=200, translatable=True),
                "url": F("url", "Katılım linki", default="/bagis"),
            }),
        ),
    },
    "sacred_days_banner": {
        "label": "Mübarek Günler & Kandil Çağrısı", "group": "Banner", "icon": "🌙",
        "help": "Kandil, Üç Aylar veya Arefe gününe özel manevi çağrı ve sadaka yönlendirmesi.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"countdown_card": "Geri sayımlı manevi kart", "ornate_dark": "Koyu altın varak bant", "compact_strip": "Kompakt hatırlatma şeridi"}, default="ornate_dark"),
            occasion=F("text", "Özel Gün (ör. Berat Kandili)", max=60, translatable=True),
            date_label=F("text", "Tarih / Kalan Süre", max=50, translatable=True),
            button_label=F("text", "Buton yazısı", max=40, default="Kandil Sadakası Ver", translatable=True),
            button_url=F("url", "Bağış linki", default="/bagis"),
        ),
    },
    "documentary_spotlight": {
        "label": "Saha Belgeseli & Röportaj Vitrini", "group": "Metin & medya", "icon": "🎬",
        "help": "Ana saha belgeseli ve yanında kısa saha kesitleri / zaman damgaları sunar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"theater_split": "Büyük ekran + kesit listesi", "playlist_dark": "Koyu sinema vitrini", "minimal_embed": "Sade belgesel kartı"}, default="theater_split"),
            video_url=F("url", "Ana Video URL (YouTube / MP4)"),
            poster_url=F("image", "Kapak Görseli"),
            duration=F("text", "Süre (ör. 12:40)", max=20),
            items=F("list", "Bölümler / Kesitler", max_items=8, item_label="title", fields={
                "time": F("text", "Zaman (ör. 02:15)", max=16),
                "title": F("text", "Bölüm Başlığı", max=80, translatable=True),
            }),
        ),
    },
    "iban_reference_helper": {
        "label": "Havale / EFT Açıklama Rehberi", "group": "Bağış", "icon": "🧾",
        "help": "Zekat, Fitre, Kurban, Su Kuyusu gibi bağış türleri için havale açıklama kodlarını listeler.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"interactive_cards": "Açıklama kodu kartları", "compact_box": "Kompakt rehber kutusu", "dark_bank": "Koyu banka rehberi"}, default="interactive_cards"),
            recipient_name=F("text", "Alıcı Kurum Adı", max=120),
            items=F("list", "Açıklama Kodları", max_items=10, min_items=1, item_label="label", fields={
                "code": F("text", "Açıklama Kodu (ör. ZEKAT-2026)", max=30),
                "label": F("text", "Bağış Türü", max=60, translatable=True),
                "example": F("text", "Örnek Açıklama", max=100, translatable=True),
            }),
        ),
    },
    "qurbani_animal_types": {
        "label": "Kurban Hayvan & Bölge Seçenekleri", "group": "Bağış", "icon": "🐄",
        "help": "Küçükbaş, Büyükbaş Hisse ve Tam Büyükbaş kurban seçeneklerini bölge ve tutarıyla kıyaslar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"animal_cards": "Hayvan türü kartları", "region_price_matrix": "Bölge fiyat matrisi", "dark_eid": "Koyu bayram vitrini"}, default="animal_cards"),
            items=F("list", "Kurban Seçenekleri", max_items=9, min_items=1, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="🐑"),
                "badge": F("text", "Bölge / Etiket (ör. Afrika · Asya)", max=40, translatable=True),
                "title": F("text", "Kurban Türü", max=60, translatable=True),
                "price": F("text", "Bedel (ör. 4.500 ₺)", max=30),
                "detail": F("text", "Hisse / Ağırlık notu", max=100, translatable=True),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "fatwa_cards": {
        "label": "Zekat & İnfak Fetva Kartları", "group": "Güven & etki", "icon": "📜",
        "help": "Sık sorulan fıkhi soruları kategori rozeti ve net hüküm özetiyle kartlar halinde sunar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"ruled_cards": "Hüküm kartları", "split_mufti_qa": "İki sütun soru-cevap", "compact_list": "Kompakt fetva listesi"}, default="ruled_cards"),
            items=F("list", "Fetvalar", max_items=12, min_items=1, item_label="question", fields={
                "category": F("text", "Konu (ör. Zekat / Kurban)", max=36, translatable=True),
                "question": F("text", "Soru", max=140, translatable=True),
                "ruling": F("textarea", "Fıkhi Hüküm / Özet", max=320, translatable=True),
            }),
        ),
    },
    "soup_kitchen_status": {
        "label": "Aşevi & Günlük Sıcak Yemek Durumu", "group": "Güven & etki", "icon": "🍲",
        "help": "Günlük pişen öğün sayısı, dağıtım noktaları ve 1 öğün / 1 kazan destek çağrısı.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"kitchen_cards": "Aşevi dağıtım kartları", "daily_metrics": "Günlük öğün sayaçları", "dark_kitchen": "Koyu aşevi vitrini"}, default="kitchen_cards"),
            daily_meals=F("text", "Günlük toplam öğün (ör. 18.500 Öğün)", max=40),
            meal_price=F("text", "1 Öğün Bedeli (ör. 85 ₺)", max=30, default="85 ₺"),
            button_label=F("text", "Buton yazısı", max=40, default="Sıcak Yemek İkram Et", translatable=True),
            button_url=F("url", "Bağış linki", default="/bagis"),
            items=F("list", "Aşevi Noktaları", max_items=8, item_label="location", fields={
                "location": F("text", "Bölge / Aşevi", max=60, translatable=True),
                "count": F("text", "Günlük Dağıtım (ör. 5.000 Öğün)", max=40),
                "menu": F("text", "Not / Menü", max=80, translatable=True),
            }),
        ),
    },
    "well_types_compare": {
        "label": "Su Kuyusu Türleri Karşılaştırması", "group": "Bağış", "icon": "🚰",
        "help": "Tulumba, Güneş Panelli Şadırvan ve Derin Sondaj kuyularını teknik özellikleriyle kıyaslar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"spec_cards": "Teknik özellik kartları", "comparison_table": "Karşılaştırma tablosu", "dark_blue_water": "Koyu mavi su vitrini"}, default="spec_cards"),
            items=F("list", "Kuyu Türleri", max_items=6, min_items=1, item_label="title", fields={
                "badge": F("text", "Bölge", max=36, translatable=True),
                "title": F("text", "Kuyu Türü", max=70, translatable=True),
                "price": F("text", "Maliyet (ör. 3.500 $)", max=30),
                "depth": F("text", "Derinlik / Kapasite", max=40, translatable=True),
                "beneficiaries": F("text", "Faydalanan (ör. 1.200 Kişi)", max=40, translatable=True),
                "duration": F("text", "Açılış Süresi (ör. 4-6 Hafta)", max=40, translatable=True),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "field_diaries": {
        "label": "Saha Ekibi Günlükleri", "group": "Metin & medya", "icon": "📓",
        "help": "Saha ekiplerinin tarih, konum ve fotoğraflı kısa saha notlarını listeler.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"diary_timeline": "Tarihli günlük akışı", "photo_notes_grid": "Fotoğraflı saha notları", "compact_updates": "Kompakt saha güncellemeleri"}, default="photo_notes_grid"),
            items=F("list", "Günlük Notları", max_items=12, min_items=1, item_label="title", fields={
                "image_url": F("image", "Saha Fotoğrafı"),
                "date": F("text", "Tarih", max=24),
                "location": F("text", "Konum", max=50, translatable=True),
                "title": F("text", "Başlık", max=90, translatable=True),
                "note": F("textarea", "Saha Notu", max=240, translatable=True),
            }),
        ),
    },
    "sponsor_certificates": {
        "label": "Kurumsal Sponsor & Teşekkür Plaketleri", "group": "Güven & etki", "icon": "🏆",
        "help": "Kurumsal bağışçılara özel teşekkür plaketi ve sosyal etki özetlerini sergiler.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"plaque_grid": "Teşekkür plaketi kartları", "logo_impact_cards": "Etki özetli sponsorlar", "dark_prestige": "Koyu prestij vitrini"}, default="plaque_grid"),
            items=F("list", "Sponsorlar", max_items=12, min_items=1, item_label="company", fields={
                "company": F("text", "Kurum / Sponsor Adı", max=80),
                "tier": F("text", "Destek Alanı (ör. Su Kuyusu Sponsoru)", max=50, translatable=True),
                "impact": F("text", "Katkı Özeti (ör. 3 Kuyu · 4.500 Kişi)", max=80, translatable=True),
            }),
        ),
    },
    "surgery_sponsorship": {
        "label": "Katarakt & Acil Ameliyat Desteği", "group": "Bağış", "icon": "🏥",
        "help": "Katarakt, ortopedi ve acil tıbbi müdahale bekleyen vaka sayılarını ve ameliyat bedelini gösterir.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"case_cards": "Vaka destek kartları", "urgent_counter_split": "Acil vaka sayacı", "dark_clinic": "Koyu klinik vitrini"}, default="case_cards"),
            items=F("list", "Tıbbi Destek Alanları", max_items=8, min_items=1, item_label="title", fields={
                "icon": F("text", "Simge", max=8, default="👁️"),
                "waiting": F("text", "Bekleyen Vaka (ör. 120 Hasta)", max=40, translatable=True),
                "title": F("text", "Ameliyat / Tedavi Türü", max=70, translatable=True),
                "cost": F("text", "1 Vaka Bedeli (ör. 3.500 ₺)", max=30),
                "url": F("url", "Bağış linki", default="/bagis"),
            }),
        ),
    },
    "mobile_channels_hub": {
        "label": "Mobil Uygulama, SMS & WhatsApp Merkezi", "group": "Form & iletişim", "icon": "📱",
        "help": "Mobil uygulama indirme linkleri, SMS kısa kodları ve WhatsApp hattını tek merkezde toplar.",
        "fields": _head(
            look=F("select", "Görünüm", choices={"split_device_hub": "İki sütun dijital erişim merkezi", "compact_channels_bar": "Kompakt kanal şeridi", "dark_app_hub": "Koyu mobil erişim paneli"}, default="split_device_hub"),
            sms_code=F("text", "SMS Kısa Kod (ör. İNFAK yaz 3480'e gönder)", max=80, translatable=True),
            whatsapp_url=F("url", "WhatsApp Bağlantısı"),
            ios_url=F("url", "App Store Linki"),
            android_url=F("url", "Google Play Linki"),
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
