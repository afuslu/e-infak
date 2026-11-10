"""Site builder library: ready-made sections, page templates and one-click demos.

Everything here is plain block trees built from the block catalogue
(app/services/blocks.py), so it goes through the same validation as anything an
organisation builds itself. Images are the illustrations in apps/web/public/demo.
Ids are placeholders: every insertion gets fresh ids (`fresh_ids`).
"""
from __future__ import annotations

import copy
import itertools
import uuid
from typing import Any, Optional

from app.services.blocks import default_footer_blocks, default_header_blocks

_seq = itertools.count(1)


def _id(kind: str) -> str:
    return f"tpl-{kind.replace('_', '-')[:10]}-{next(_seq)}"


def B(block_type: str, style: Optional[dict] = None, advanced: Optional[dict] = None, children: Optional[list] = None, **props) -> dict:
    block: dict[str, Any] = {"id": _id(block_type), "type": block_type, "props": props}
    if style:
        block["style"] = {"desktop": style} if "desktop" not in style else style
    if advanced:
        block["advanced"] = advanced
    if children is not None:
        block["children"] = children
    return block


CENTER = {"text_align": "center"}


def heading(text: str, kicker: Optional[str] = None, subtitle: Optional[str] = None, level: str = "h2", center: bool = True) -> dict:
    props = {"text": text, "level": level}
    if kicker:
        props["kicker"] = kicker
    if subtitle:
        props["subtitle"] = subtitle
    return B("heading", style=dict(CENTER) if center else None, **props)


def text(body: str, **style) -> dict:
    return B("richtext", style=style or None, text=body)


def section(children: list, tone: str = "", top: int = 72, bottom: int = 72, **style) -> dict:
    return B("section", style={"padding_top": top, "padding_bottom": bottom, **style}, children=children, tone=tone)


def columns(ratio: str, *cols: list, gap: int = 32, valign: str = "start") -> dict:
    return B("columns", children=[B("column", children=list(c)) for c in cols], ratio=ratio, gap=gap, valign=valign)


def buttons(*items: tuple, align: str = "center") -> dict:
    return B("buttons", items=[{"label": label, "url": url, "style": style} for label, url, style in items], align=align)


def card(title: str, body: str, icon: str = "") -> list:
    """A column's content: small heading + text (rendered as a card by the column style)."""
    return [heading(f"{icon} {title}".strip(), level="h4", center=False), text(body)]


CARD_STYLE = {"bg_color": "#FFFFFF", "radius": 18, "padding_top": 28, "padding_bottom": 28, "padding_left": 8, "padding_right": 8, "shadow": "sm", "hover_shadow": "lg"}


def card_columns(ratio: str, cards: list[list], gap: int = 24) -> dict:
    block = columns(ratio, *cards, gap=gap, valign="stretch")
    for col in block["children"]:
        col["style"] = {"desktop": dict(CARD_STYLE)}
    return block


# --- Header and footer variants ------------------------------------------------------

def _row(props: dict, left: list, center: list, right: list, style: Optional[dict] = None) -> dict:
    slots = [B("header_slot", children=items) for items in (left, center, right)]
    return B("header_row", style=style, children=slots, **props)


_TABLET_DOWN = {"hide_tablet": True, "hide_mobile": True}


def header_centered() -> list:
    """Logo in the middle, menu below; announcement-style top bar."""
    return [
        _row({"tone": "brand", "height": 38, "border": False},
             [B("social_icons", style="text")], [B("richtext", text="Bağışlarınız makbuz karşılığı, güvenle ulaştırılır.", advanced=_TABLET_DOWN)],
             [B("account_links", layout="inline")], style={"font_size": 13}),
        _row({"tone": "light", "height": 96, "border": False, "center_align": "center"},
             [B("language_switcher", advanced=_TABLET_DOWN)], [B("logo", size=52)], [B("donate_button", style="accent", heart=True)]),
        _row({"tone": "light", "height": 56, "sticky": True, "shrink": True, "center_align": "center"},
             [], [B("nav_menu", source="header", mobile="drawer")], []),
    ]


def header_dark() -> list:
    """One dark sticky bar: logo, menu, donate."""
    return [_row({"tone": "dark", "height": 80, "sticky": True, "shrink": True, "border": False, "center_align": "center"},
                 [B("logo", light=True, size=46)], [B("nav_menu", source="header", mobile="drawer")],
                 [B("language_switcher", advanced=_TABLET_DOWN), B("donate_button", style="accent", size="md", heart=True)])]


def header_minimal() -> list:
    return [_row({"tone": "light", "height": 72, "sticky": True, "shrink": True, "center_align": "right"},
                 [B("logo", show_tagline=False, size=40)], [B("nav_menu", source="header", mobile="drawer")],
                 [B("donate_button", style="outline", size="sm")])]


def footer_four() -> list:
    return [section([
        columns("1-1-1-1",
                [B("logo", light=True, show_about=True), B("social_icons", style="round")],
                [B("nav_menu", source="header", layout="vertical", mobile="inline", title="Kurumsal")],
                [B("nav_menu", source="footer", layout="vertical", mobile="inline", title="Bilgi")],
                [B("contact_info", title="İletişim", layout="stacked", show_address=True), B("donate_button", style="accent", heart=True)],
                gap=40),
        B("copyright", style={"margin_top": 40}, show_powered=True),
    ], tone="dark", top=64, bottom=20, margin_top=64)]


def footer_minimal() -> list:
    return [section([
        B("logo", style=dict(CENTER)), B("social_icons", style="pill", align="center"),
        B("nav_menu", source="footer", layout="horizontal", mobile="inline", align="center"),
        B("copyright", show_powered=True),
    ], tone="soft", top=48, bottom=20, margin_top=64)]


# --- Content sections ----------------------------------------------------------------

def _slides() -> list:
    return [
        {"image_url": "/demo/water.svg", "badge": "SU KUYUSU", "title": "Bir kuyu, bir köyün hayatını değiştirir",
         "text": "Afrika'da temiz suya erişimi olmayan köyler için kuyu açıyoruz.", "button_label": "Bağış yap", "button_url": "/kampanyalar",
         "button2_label": "Projeyi incele", "button2_url": "/kampanyalar", "align": "left", "overlay": 35},
        {"image_url": "/demo/education.svg", "badge": "EĞİTİM", "title": "İlimle yetişen nesiller",
         "text": "Burs, kitap ve yatılı eğitim desteğiyle öğrencilerimizin yanındayız.", "button_label": "Öğrenci destekle", "button_url": "/kampanyalar",
         "align": "left", "overlay": 45},
        {"image_url": "/demo/orphan.svg", "badge": "YETİM", "title": "Bir yetimin yüzü sizinle gülsün",
         "text": "Aylık sponsorlukla bir çocuğun eğitim ve bakımını üstlenin.", "button_label": "Sponsor ol", "button_url": "/kampanyalar",
         "align": "center", "overlay": 45},
    ]


SECTIONS: list[dict] = []


def _section(key: str, label: str, group: str, description: str, blocks: list, kind: str = "content") -> None:
    SECTIONS.append({"key": key, "label": label, "group": group, "description": description, "kind": kind, "blocks": blocks})


# Kapak
_section("hero-slider", "Kapak slider (3 slayt)", "Kapak", "Su, eğitim ve yetim slaytları; oklar ve otomatik geçiş.",
         [B("slider", slides=_slides(), height="lg", autoplay=True, interval=6, effect="fade")])
_section("hero-mosque", "Görselli kapak (ortalı)", "Kapak", "Tam genişlik görsel üzerinde ortalı başlık ve iki buton.",
         [B("banner", layout="image", image_url="/demo/mosque.svg", kicker="RAMAZAN 2027", title="Paylaştıkça bereketlenen bir Ramazan",
            text="İftar, fitre ve zekatlarınızı ihtiyaç sahiplerine güvenle ulaştırıyoruz.", button_label="Bağış yap", button_url="/kampanyalar",
            align="center", style={"desktop": {"min_height": 520}})])
_section("hero-split", "Yan yana kapak", "Kapak", "Solda metin, sağda görsel; sade ve hızlı yüklenir.",
         [B("banner", layout="split", image_url="/demo/relief.svg", kicker="ACİL YARDIM", title="Afet bölgelerine gıda ve hijyen kolisi",
            text="Her koli bir ailenin bir haftalık temel ihtiyacını karşılar.", button_label="Koli bağışla", button_url="/kampanyalar")])
_section("hero-form", "Kapak + bağış formu", "Kapak", "Klasik kapak; sağ tarafta hızlı bağış formu.",
         [B("hero", variant="klasik", image_url="/demo/community.svg", show_form=True)])

# Bağış
_section("campaigns-grid", "Kampanya ızgarası", "Bağış", "Son 6 kampanya, ilerleme çubuklarıyla.",
         [B("campaigns", kicker="PROJELERİMİZ", title="Nereye dokunmak istersiniz?", source="latest", limit=6, layout="grid", columns=3)])
_section("campaigns-carousel", "Öne çıkan kampanyalar (kaydırmalı)", "Bağış", "Öne çıkan kampanyalar yatay kaydırmalı.",
         [B("campaigns", kicker="ÖNE ÇIKANLAR", title="Bu ay en çok ihtiyaç duyulanlar", source="featured", limit=8, layout="carousel")])
_section("campaigns-ending", "Bitmek üzere olanlar", "Bağış", "Hedefe yaklaşan kampanyalar; son çağrı için.",
         [section([B("campaigns", kicker="SON GÜNLER", title="Hedefe az kaldı", source="ending", limit=3, layout="grid", columns=3)], tone="soft")])
_section("donate-band", "Bağış formu bandı", "Bağış", "Solda çağrı metni, sağda hızlı bağış formu.",
         [section([columns("1-1",
                           [heading("Bugün bir iyilik yapın", kicker="HIZLI BAĞIŞ", center=False,
                                    subtitle="Birkaç adımda, kartla veya havaleyle bağış yapın. Makbuzunuz e-postanıza gelir."),
                            text("- Bağışınızın tamamı seçtiğiniz projeye aktarılır\n- Her bağış için resmi makbuz\n- Düzenli bağış ve hatırlatma seçenekleri")],
                           [B("quick_donation")], gap=48, valign="center")], tone="soft")])
_section("categories", "Bağış kategorileri", "Bağış", "Zekat, fitre, kurban, sadaka… kategori kutuları.",
         [B("categories", kicker="BAĞIŞ TÜRLERİ", title="Niyetinize uygun bağışı seçin")])
_section("zakat", "Zekat bandı", "Bağış", "Zekat hesaplayıcıya yönlendiren bant.",
         [B("zakat_band", title="Zekatınızı doğru hesaplayın", text="Güncel nisap miktarıyla zekatınızı hesaplayın, dilediğiniz projeye aktarın.", button_label="Zekat hesapla")])

# Hakkımızda
_section("about", "Hakkımızda (görsel + metin)", "Hakkımızda", "Kurumunuzu anlatan görselli tanıtım.",
         [B("image_text", image_url="/demo/community.svg", alt="", image_side="left", kicker="BİZ KİMİZ", title="Gönüllülerle büyüyen bir iyilik hareketi",
            text="1995'ten bu yana eğitim, su ve acil yardım alanlarında çalışıyoruz.\n\nHer kuruşun hesabını veren şeffaf bir yapıyla, bağışlarınızı ihtiyaç sahiplerine **aracısız** ulaştırıyoruz.",
            button_label="Hikayemiz", button_url="/hakkimizda")])
_section("mission-3", "Misyon / vizyon / değerler", "Hakkımızda", "Üç kartta kurumun amacı.",
         [section([heading("Neden varız?", kicker="AMACIMIZ"),
                   card_columns("1-1-1", [card("Misyonumuz", "İhtiyaç sahiplerine onurlarını koruyarak, sürdürülebilir destek ulaştırmak.", "🎯"),
                                          card("Vizyonumuz", "Kimsenin temel ihtiyaçlardan mahrum kalmadığı bir dünya için çalışmak.", "🌍"),
                                          card("Değerlerimiz", "Şeffaflık, emanet bilinci, gönüllülük ve hesap verebilirlik.", "🤝")])], tone="soft")])
_section("story", "Hikaye (metin + görsel)", "Hakkımızda", "Bir projenin hikayesi; görsel sağda.",
         [B("image_text", image_url="/demo/water.svg", image_side="right", kicker="SAHADAN", title="Ömer'in köyüne su geldi",
            text="Kuyumuz açılmadan önce Ömer her gün 6 kilometre yürüyerek su taşıyordu. Bugün medresesine zamanında gidiyor.\n\n**Bir kuyu, ortalama 400 kişiye** temiz su sağlıyor.",
            button_label="Su kuyusu kampanyası", button_url="/kampanyalar")])
_section("text-center", "Ortalı metin", "Hakkımızda", "Başlık ve kısa paragraf, dar sütunda.",
         [heading("Emanetinize sahip çıkıyoruz", kicker="ŞEFFAFLIK"),
          text("Her yıl bağımsız denetim raporumuzu yayımlıyor, tüm bağışları proje bazında raporluyoruz.", width="narrow", text_align="center")])
_section("values-4", "Dört özellik", "Hakkımızda", "Dört kısa madde, ikonlu kartlar.",
         [section([heading("Bağışınız güvende", kicker="GÜVEN"),
                   card_columns("1-1-1-1", [card("Resmi makbuz", "Her bağış için makbuz ve e-posta bildirimi.", "🧾"),
                                            card("Güvenli ödeme", "Kart bilgileriniz bankanın 3D Secure sayfasında girilir.", "🔒"),
                                            card("Raporlama", "Bağışınızın nereye ulaştığını raporlarla görün.", "📊"),
                                            card("Destek hattı", "Sorularınız için hafta içi her gün buradayız.", "☎️")])])])

# Etki
_section("stats-dark", "Rakamlarla etki (koyu)", "Etki & güven", "Koyu zeminde dört büyük rakam.",
         [section([heading("Birlikte başardıklarımız", kicker="ETKİMİZ"),
                   columns("1-1-1-1", *[[heading(value, level="h2"), text(label, text_align="center")]
                                        for value, label in (("1.250+", "Açılan su kuyusu"), ("38.000", "Burslu öğrenci"),
                                                             ("4.600", "Sponsorlu yetim"), ("27", "Ülke"))], gap=24)], tone="dark")])
_section("stats-auto", "Otomatik istatistikler", "Etki & güven", "Kampanyalardan otomatik hesaplanan sayılar.", [B("stats", mode="auto")])
_section("trust", "Güven bandı", "Etki & güven", "Adres, iletişim ve güvenli ödeme bilgisi.", [B("trust")])
_section("testimonials", "Bağışçı yorumları", "Etki & güven", "Üç bağışçı yorumu, kartlarda.",
         [section([heading("Bağışçılarımız ne diyor?", kicker="YORUMLAR"),
                   card_columns("1-1-1", [card("Mehmet K.", "“Makbuzum anında geldi, projenin fotoğraflarını da gördüm. İçim rahat.”", "⭐⭐⭐⭐⭐"),
                                          card("Mustafa A.", "“Her ay düzenli bağış yapıyorum; raporlar çok açık ve anlaşılır.”", "⭐⭐⭐⭐⭐"),
                                          card("Ahmet Y.", "“Kurban vekaletimi zahmetsizce verdim, kesim videosu da geldi.”", "⭐⭐⭐⭐⭐")])], tone="soft")])

# Çağrı
_section("cta-pattern", "Desenli çağrı bandı", "Çağrı", "Geometrik desen üzerinde büyük çağrı.",
         [B("banner", layout="image", image_url="/demo/pattern.svg", kicker="SİZ DE KATILIN", title="Küçük bir bağış, büyük bir umut",
            text="Aylık düzenli bağışla iyiliği sürekli kılın.", button_label="Düzenli bağışçı ol", button_url="/kampanyalar", align="center")])
_section("cta-band", "Çağrı bandı", "Çağrı", "Tek satırlık renkli çağrı.",
         [B("cta_band", title="Askıda iyilik: ihtiyaç sahibine sen ulaş", text="Askıdaki bağışlar en acil ihtiyaca yönlendirilir.", button_label="Askıya bağış bırak", button_url="/kampanyalar")])
_section("volunteer", "Gönüllü çağrısı", "Çağrı", "Renkli banner + gönüllü başvuru butonu.",
         [B("banner", layout="color", kicker="GÖNÜLLÜLÜK", title="Vaktini iyiliğe ayır", text="Saha çalışmaları, organizasyonlar ve dijital destek için gönüllüler arıyoruz.",
            button_label="Gönüllü ol", button_url="/gonullu")])
_section("notice", "Duyuru", "Çağrı", "Bilgilendirme kutusu (ör. kurban kayıt tarihleri).",
         [B("notice", tone="warning", title="Kurban kayıtları 20 Mayıs'ta kapanıyor", text="Hisse kayıtlarınızı son tarihten önce tamamlamayı unutmayın.")])

# SSS & iletişim
_section("faq", "Sık sorulan sorular", "SSS & iletişim", "Bağışla ilgili en sık 5 soru.",
         [B("faq", title="Sık sorulan sorular", items=[
             {"question": "Bağışımın makbuzunu nasıl alırım?", "answer": "Bağışınız tamamlanınca makbuzunuz e-postanıza gönderilir; Bağışçı Girişi'nden de indirebilirsiniz."},
             {"question": "Zekatımı belirli bir projeye verebilir miyim?", "answer": "Evet. Zekat uygun projeler bağış sayfasında işaretlidir; dilediğinizi seçebilirsiniz."},
             {"question": "Kart bilgilerim saklanıyor mu?", "answer": "Hayır. Kart bilgileri yalnızca bankanın güvenli ödeme sayfasında girilir; bize ulaşmaz."},
             {"question": "Düzenli bağışımı nasıl durdururum?", "answer": "Bağışçı Girişi › Düzenli bağışlarım ekranından tek tıkla durdurabilirsiniz."},
             {"question": "Havale ile bağış yapabilir miyim?", "answer": "Evet. Bağış formunda Havale/EFT seçin; IBAN ve açıklama bilgisi gösterilir."},
         ])])
_section("contact", "İletişim bilgileri", "SSS & iletişim", "İletişim, çalışma saatleri ve butonlar üç sütunda.",
         [section([heading("Bize ulaşın", kicker="İLETİŞİM"),
                   card_columns("1-1-1", [[B("contact_info", title="📞 İletişim", layout="stacked", show_address=True)],
                                          card("Çalışma saatleri", "Hafta içi 09.00 – 18.00\nCumartesi 10.00 – 14.00", "🕘"),
                                          [heading("💬 Hızlı destek", level="h4", center=False), text("Bağış ve makbuz sorularınız için:"),
                                           buttons(("İletişim formu", "/iletisim", "primary"), align="left")]])], tone="soft")])
_section("news", "Haberler", "SSS & iletişim", "Son 3 haber/faaliyet.", [B("news", kicker="FAALİYETLER", title="Sahadan haberler", limit=3)])

# Header & footer variants
_section("header-classic", "Klasik header", "Header", "İletişim çubuğu + logo, menü ve bağış butonu.", default_header_blocks(), kind="header")
_section("header-centered", "Ortalı logo", "Header", "Duyuru çubuğu, ortada logo, altta sabit menü.", header_centered(), kind="header")
_section("header-dark", "Koyu tek satır", "Header", "Koyu zemin, ortada menü, sağda bağış.", header_dark(), kind="header")
_section("header-minimal", "Sade", "Header", "Beyaz, ince, sloganısız.", header_minimal(), kind="header")
_section("footer-classic", "Üç sütunlu footer", "Footer", "Tanıtım, alt menü, iletişim.", default_footer_blocks(), kind="footer")
_section("footer-four", "Dört sütunlu footer", "Footer", "İki menü, iletişim ve bağış butonu.", footer_four(), kind="footer")
_section("footer-minimal", "Sade ortalı footer", "Footer", "Açık zemin, ortalı logo ve bağlantılar.", footer_minimal(), kind="footer")

SECTION_BY_KEY = {s["key"]: s for s in SECTIONS}


def _blocks(*keys: str) -> list:
    return [b for key in keys for b in SECTION_BY_KEY[key]["blocks"]]


def _page_hero(title: str, kicker: str, image: str) -> dict:
    return B("banner", layout="image", image_url=image, kicker=kicker, title=title, align="center", style={"desktop": {"min_height": 320}})


# --- Page templates --------------------------------------------------------------------

PAGE_TEMPLATES: list[dict] = [
    {"key": "about", "label": "Hakkımızda", "slug": "hakkimizda-sayfasi", "description": "Tanıtım, misyon, rakamlar, yorumlar ve çağrı.",
     "blocks": [_page_hero("Hakkımızda", "KURUMUMUZ", "/demo/community.svg"), *_blocks("about", "mission-3", "stats-dark", "testimonials", "cta-pattern")]},
    {"key": "campaign-landing", "label": "Kampanya açılış sayfası", "slug": "kampanya", "description": "Kapak, bağış formu, hikaye, etki ve SSS.",
     "blocks": _blocks("hero-split", "donate-band", "story", "stats-dark", "faq", "cta-band")},
    {"key": "ramadan", "label": "Ramazan", "slug": "ramazan", "description": "Ramazan kapağı, kategoriler, zekat ve kampanyalar.",
     "blocks": _blocks("hero-mosque", "categories", "zakat", "campaigns-grid", "faq")},
    {"key": "contact", "label": "İletişim", "slug": "bize-ulasin", "description": "İletişim kartları, SSS ve güven bandı.",
     "blocks": [_page_hero("Bize ulaşın", "İLETİŞİM", "/demo/pattern.svg"), *_blocks("contact", "faq", "trust")]},
    {"key": "volunteer", "label": "Gönüllü ol", "slug": "gonullu-ol", "description": "Gönüllülük çağrısı, alanlar ve SSS.",
     "blocks": [*_blocks("volunteer"),
                section([heading("Nerelerde gönüllü olabilirsiniz?", kicker="ALANLAR"),
                         card_columns("1-1-1", [card("Saha", "Dağıtım, kurban organizasyonu ve afet bölgesi çalışmaları.", "🚚"),
                                                card("Eğitim", "Öğrencilere ders desteği ve mentorluk.", "📚"),
                                                card("Dijital", "Tasarım, sosyal medya ve çeviri desteği.", "💻")])]),
                *_blocks("testimonials")]},
    {"key": "transparency", "label": "Şeffaflık", "slug": "seffaflik", "description": "Güvence maddeleri, rakamlar ve SSS.",
     "blocks": [_page_hero("Şeffaflık ve hesap verebilirlik", "GÜVEN", "/demo/pattern.svg"), *_blocks("text-center", "values-4", "stats-auto", "faq")]},
]

PAGE_BY_KEY = {p["key"]: p for p in PAGE_TEMPLATES}


# --- Demos -------------------------------------------------------------------------------

DEMOS: list[dict] = [
    {"key": "su-ve-yardim", "label": "Su & insani yardım", "kit": "ferah-turkuaz", "image": "/demo/water.svg",
     "description": "Slider kapak, kampanyalar, hikaye ve etki rakamları. Su kuyusu ve acil yardım dernekleri için.",
     "header": header_dark(), "footer": footer_four(),
     "home": _blocks("hero-slider", "campaigns-grid", "story", "stats-dark", "donate-band", "testimonials", "news", "cta-pattern"),
     "pages": ["about", "campaign-landing", "contact"]},
    {"key": "cami-vakif", "label": "Cami & vakıf", "kit": "arabi-altin", "image": "/demo/mosque.svg",
     "description": "Ortalı logo, Ramazan kapağı, bağış kategorileri ve zekat bandı.",
     "header": header_centered(), "footer": default_footer_blocks(),
     "home": _blocks("hero-mosque", "categories", "campaigns-carousel", "zakat", "about", "faq", "news"),
     "pages": ["ramadan", "about", "contact"]},
    {"key": "egitim", "label": "Eğitim & burs", "kit": "klasik-yesil", "image": "/demo/education.svg",
     "description": "Kapak + bağış formu, misyon kartları, burs kampanyaları ve gönüllülük.",
     "header": default_header_blocks(), "footer": default_footer_blocks(),
     "home": _blocks("hero-form", "mission-3", "campaigns-grid", "stats-dark", "volunteer", "news"),
     "pages": ["about", "volunteer", "contact"]},
    {"key": "yardim-dernegi", "label": "Yardım derneği", "kit": "modern-lacivert", "image": "/demo/relief.svg",
     "description": "Yan yana kapak, acil yardım, güvence maddeleri ve şeffaflık sayfası.",
     "header": header_minimal(), "footer": footer_four(),
     "home": _blocks("hero-split", "campaigns-ending", "values-4", "donate-band", "stats-auto", "cta-band", "faq"),
     "pages": ["transparency", "campaign-landing", "contact"]},
    {"key": "yetim", "label": "Yetim & aile", "kit": "sicak-toprak", "image": "/demo/orphan.svg",
     "description": "Sıcak tonlar, sponsorluk hikayesi, yorumlar ve sade footer.",
     "header": default_header_blocks(), "footer": footer_minimal(),
     "home": [B("banner", layout="image", image_url="/demo/orphan.svg", kicker="SPONSORLUK", title="Bir yetimin yüzü sizinle gülsün",
                text="Aylık sponsorlukla bir çocuğun eğitimini ve bakımını üstlenin.", button_label="Sponsor ol", button_url="/kampanyalar",
                style={"desktop": {"min_height": 520}}),
              *_blocks("donate-band", "mission-3", "campaigns-grid", "testimonials", "faq")],
     "pages": ["about", "volunteer", "contact"]},
]

DEMO_BY_KEY = {d["key"]: d for d in DEMOS}


def fresh_ids(blocks: list) -> list:
    """Deep copy with new unique ids, so a section can be inserted any number of times."""
    def walk(block: dict) -> dict:
        out = {**block, "id": f"{block['type'].replace('_', '-')[:12]}-{uuid.uuid4().hex[:10]}"}
        if block.get("children") is not None:
            out["children"] = [walk(child) for child in block["children"]]
        return out
    return [walk(b) for b in copy.deepcopy(blocks)]


def library() -> dict:
    """What the editor's template panel shows (blocks included: insertion happens in the editor)."""
    return {
        "sections": SECTIONS,
        "pages": [{k: p[k] for k in ("key", "label", "slug", "description", "blocks")} for p in PAGE_TEMPLATES],
        "demos": [{"key": d["key"], "label": d["label"], "description": d["description"], "image": d["image"], "kit": d["kit"],
                   "pages": [PAGE_BY_KEY[p]["label"] for p in d["pages"]]} for d in DEMOS],
    }
