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
from app.services.template_hakder import hayir_kapisi

_seq = itertools.count(1)


def _id(kind: str) -> str:
    return f"tpl-{kind.replace('_', '-')[:10]}-{next(_seq)}"


def B(block_type: str, style: Optional[dict] = None, advanced: Optional[dict] = None, children: Optional[list] = None,
      p: Optional[dict] = None, **props) -> dict:
    """`p` holds props whose names clash with the helper's own arguments (e.g. a block's "style" select)."""
    block: dict[str, Any] = {"id": _id(block_type), "type": block_type, "props": {**props, **(p or {})}}
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
             [B("social_icons", p={"style": "text"})], [B("richtext", text="Bağışlarınız makbuz karşılığı, güvenle ulaştırılır.", advanced=_TABLET_DOWN)],
             [B("account_links", layout="inline")], style={"font_size": 13}),
        _row({"tone": "light", "height": 96, "border": False, "center_align": "center"},
             [B("language_switcher", advanced=_TABLET_DOWN)], [B("logo", size=52)], [B("donate_button", p={"style": "accent"}, heart=True)]),
        _row({"tone": "light", "height": 56, "sticky": True, "shrink": True, "center_align": "center"},
             [], [B("nav_menu", source="header", mobile="drawer")], []),
    ]


def header_dark() -> list:
    """One dark sticky bar: logo, menu, donate."""
    return [_row({"tone": "dark", "height": 80, "sticky": True, "shrink": True, "border": False, "center_align": "center"},
                 [B("logo", light=True, size=46)], [B("nav_menu", source="header", mobile="drawer")],
                 [B("language_switcher", advanced=_TABLET_DOWN), B("donate_button", p={"style": "accent"}, size="md", heart=True)])]


def header_minimal() -> list:
    return [_row({"tone": "light", "height": 72, "sticky": True, "shrink": True, "center_align": "right"},
                 [B("logo", show_tagline=False, size=40)], [B("nav_menu", source="header", mobile="drawer")],
                 [B("donate_button", p={"style": "outline"}, size="sm")])]


def footer_four() -> list:
    return [section([
        columns("1-1-1-1",
                [B("logo", light=True, show_about=True), B("social_icons", p={"style": "round"})],
                [B("nav_menu", source="header", layout="vertical", mobile="inline", title="Kurumsal")],
                [B("nav_menu", source="footer", layout="vertical", mobile="inline", title="Bilgi")],
                [B("contact_info", title="İletişim", layout="stacked", show_address=True), B("donate_button", p={"style": "accent"}, heart=True)],
                gap=40),
        B("copyright", style={"margin_top": 40}, show_powered=True),
    ], tone="dark", top=64, bottom=20, margin_top=64)]


def footer_minimal() -> list:
    return [section([
        B("logo", style=dict(CENTER)), B("social_icons", p={"style": "pill"}, align="center"),
        B("nav_menu", source="footer", layout="horizontal", mobile="inline", align="center"),
        B("copyright", show_powered=True),
    ], tone="soft", top=48, bottom=20, margin_top=64)]


# --- Content sections ----------------------------------------------------------------

def _slides() -> list:
    return [
        {"image_url": "/demo/water.webp", "badge": "SU KUYUSU", "title": "Bir kuyu, bir köyün hayatını değiştirir",
         "text": "Afrika'da temiz suya erişimi olmayan köyler için kuyu açıyoruz.", "button_label": "Bağış yap", "button_url": "/kampanyalar",
         "button2_label": "Projeyi incele", "button2_url": "/kampanyalar", "align": "left", "overlay": 35},
        {"image_url": "/demo/education.webp", "badge": "EĞİTİM", "title": "İlimle yetişen nesiller",
         "text": "Burs, kitap ve yatılı eğitim desteğiyle öğrencilerimizin yanındayız.", "button_label": "Öğrenci destekle", "button_url": "/kampanyalar",
         "align": "left", "overlay": 45},
        {"image_url": "/demo/orphan.webp", "badge": "YETİM", "title": "Bir yetimin yüzü sizinle gülsün",
         "text": "Aylık sponsorlukla bir çocuğun eğitim ve bakımını üstlenin.", "button_label": "Sponsor ol", "button_url": "/kampanyalar",
         "align": "center", "overlay": 45},
    ]


SECTIONS: list[dict] = []


def _section(key: str, label: str, group: str, description: str, blocks: list, kind: str = "content") -> None:
    SECTIONS.append({"key": key, "label": label, "group": group, "description": description, "kind": kind, "blocks": blocks})


# Kapak
_section("hero-slider", "Kapak slider (3 slayt)", "Kapak", "Vitrin kartı ve altta küçük önizleme şeridi; su, eğitim ve yetim slaytları.",
         [B("slider", slides=_slides(), layout="card", nav="thumbs", height="lg", autoplay=True, interval=6, effect="fade")])
_section("hero-mosque", "Görselli kapak (ortalı)", "Kapak", "Tam genişlik görsel üzerinde ortalı başlık ve iki buton.",
         [B("banner", layout="image", image_url="/demo/mosque.webp", kicker="RAMAZAN 2027", title="Paylaştıkça bereketlenen bir Ramazan",
            text="İftar, fitre ve zekatlarınızı ihtiyaç sahiplerine güvenle ulaştırıyoruz.", button_label="Bağış yap", button_url="/kampanyalar",
            align="center", style={"desktop": {"min_height": 520}})])
_section("hero-split", "Yan yana kapak", "Kapak", "Solda metin, sağda görsel; sade ve hızlı yüklenir.",
         [B("banner", layout="split", image_url="/demo/relief.webp", kicker="ACİL YARDIM", title="Afet bölgelerine gıda ve hijyen kolisi",
            text="Her koli bir ailenin bir haftalık temel ihtiyacını karşılar.", button_label="Koli bağışla", button_url="/kampanyalar")])
_section("hero-form", "Kapak + bağış formu", "Kapak", "Klasik kapak; sağ tarafta hızlı bağış formu.",
         [B("hero", variant="klasik", image_url="/demo/education.webp", show_form=True)])

# Bağış
_section("campaigns-grid", "Kampanya ızgarası", "Bağış", "Son 6 kampanya, ilerleme çubuklarıyla.",
         [B("campaigns", kicker="PROJELERİMİZ", title="Nereye dokunmak istersiniz?", source="latest", limit=6, layout="grid", columns=3)])
_section("campaigns-carousel", "Öne çıkan kampanyalar (kaydırmalı)", "Bağış", "Öne çıkan kampanyalar yatay kaydırmalı.",
         [B("campaigns", kicker="ÖNE ÇIKANLAR", title="Bu ay en çok ihtiyaç duyulanlar", source="featured", limit=8, layout="carousel")])
_section("campaigns-ending", "Bitmek üzere olanlar", "Bağış", "Hedefe yaklaşan kampanyalar; son çağrı için.",
         [section([B("campaigns", kicker="SON GÜNLER", title="Hedefe az kaldı", source="ending", limit=3, layout="grid", columns=3)], tone="soft")])
_section("campaigns-bento", "Kampanyalar: Bento Vitrin", "Bağış", "İlk kampanyayı 2 sütun genişliğinde öne çıkaran vitrin.",
         [B("campaigns", kicker="ÖNCELİKLİ PROJELER", title="Acil ve Öne Çıkan Kampanyalar", source="latest", limit=5, layout="bento", columns=3, show_quick_amounts=True)])
_section("campaigns-filterable", "Kampanyalar: Kategori Filtreli", "Bağış", "Üstte kategori sekmeleriyle anlık filtrelenen kampanya ızgarası.",
         [B("campaigns", kicker="KATEGORİLER", title="Tüm Bağış Projelerimiz", source="latest", limit=12, layout="grid", columns=3, show_filters=True, show_quick_amounts=True)])
_section("campaigns-overlay", "Kampanyalar: Görsel Üstü Yazılı", "Bağış", "Tam görsel arka planlı modern dergi stili kampanya kartları.",
         [B("campaigns", kicker="SAHA ÇALIŞMALARI", title="Umut Olan Projeler", source="latest", limit=6, layout="grid", card_style="overlay", columns=3)])
_section("campaigns-rows", "Kampanyalar: Kompakt Satır Listesi", "Bağış", "Hızlı tutar çipli kompakt yatay kampanya satırları.",
         [B("campaigns", kicker="HIZLI DESTEK", title="Aktif Kampanyalar", source="latest", limit=8, layout="rows", show_quick_amounts=True)])
_section("campaign-card-overlay", "Tek Kampanya: Görsel Üstü Banner", "Bağış", "Tek bir kampanyayı tam görsel arka plan üzerinde öne çıkarır.",
         [B("campaign_card", layout="overlay", kicker="ÖNE ÇIKAN PROJE", show_progress=True, show_quick_amounts=True, fallback_featured=True)])
_section("campaign-card-glass", "Tek Kampanya: Cam Efektli Vitrin", "Bağış", "Koyu zemin üzerinde buzlu cam tek kampanya vitrini.",
         [B("campaign_card", layout="glass", kicker="ACİL DESTEK", show_progress=True, show_quick_amounts=True, fallback_featured=True)])
_section("campaign-card-strip", "Tek Kampanya: Yatay Şerit", "Bağış", "Sayfa veya yazı arasına eklenebilen ince tek kampanya bandı.",
         [B("campaign_card", layout="strip", show_progress=True, show_quick_amounts=True, fallback_featured=True)])
_section("donate-band", "Bağış formu bandı", "Bağış", "Solda çağrı metni, sağda hızlı bağış formu.",
         [section([columns("1-1",
                           [heading("Bugün bir iyilik yapın", kicker="HIZLI BAĞIŞ", center=False,
                                    subtitle="Birkaç adımda, kartla veya havaleyle bağış yapın. Makbuzunuz e-postanıza gelir."),
                            text("- Bağışınızın tamamı seçtiğiniz projeye aktarılır\n- Her bağış için resmi makbuz\n- Düzenli bağış ve hatırlatma seçenekleri")],
                           [B("quick_donation")], gap=48, valign="center")], tone="soft")])
_section("quick-donation-split", "Hızlı Bağış: Bölünmüş Etki Kartı", "Bağış", "Solda kampanya görseli ve ilerleme çubuğu, sağda bağış formu.", [
    B("quick_donation", title="İyiliğe Ortak Olun", look="split", show_progress=True, show_frequency=True, allow_campaign_select=True,
      suggested_amounts="150, 300, 750, 1500", amount_labels="150:1 İftar, 300:1 Kumanya, 750:Yetim Desteği, 1500:Su Hissesi"),
])
_section("quick-donation-inline", "Hızlı Bağış: Yatay Tek Satır Şerit", "Bağış", "Sayfa içi ince yatay hızlı bağış barı.", [
    B("quick_donation", look="inline", allow_campaign_select=True, suggested_amounts="100, 250, 500, 1000", button_label="Hemen Bağışla"),
])
_section("quick-donation-impact", "Hızlı Bağış: Etki Tutarlı Tek Adım", "Bağış", "Tutar ve bilgilerin tek ekranda doldurulduğu hızlı form.", [
    B("quick_donation", title="Hızlı Bağış Formu", look="single_step", show_progress=True, allow_campaign_select=True,
      suggested_amounts="200, 500, 1000, 2500", amount_labels="200:Gıda Desteği, 500:Aile Paketi, 1000:Eğitim Bursu, 2500:Sağlık Yardımı"),
])
_section("quick-donation-glass", "Hızlı Bağış: Cam Efektli Modern Form", "Bağış", "Koyu zemin üzerinde buzlu cam efektli bağış formu.", [
    B("quick_donation", title="Güvenli Bağış", look="glass", show_progress=True, show_frequency=True, allow_campaign_select=True,
      suggested_amounts="150, 350, 750, 1500"),
])
_section("categories", "Bağış kategorileri", "Bağış", "Zekat, fitre, kurban, sadaka… kategori kutuları.",
         [B("categories", kicker="BAĞIŞ TÜRLERİ", title="Niyetinize uygun bağışı seçin")])
_section("categories-bento", "Kategoriler: Bento Mozaik", "Bağış", "İlk kategoriyi 2 sütun genişliğinde öne çıkaran mozaik düzen.", [
    B("categories", kicker="BAĞIŞ ALANLARI", title="İyilik Kategorileri", look="bento", columns=3, show_all_link=True, items=[
        {"icon": "💧", "badge": "ÖNCELİKLİ", "title": "Su Kuyusu & Temiz Su", "description": "Kurak bölgelerde kalıcı sondaj ve şadırvan kuyuları.", "url": "/kampanyalar"},
        {"icon": "🐑", "title": "Vekaletle Kurban", "description": "Adak, akika, şükür ve vacip kurban organizasyonları.", "url": "/kampanyalar"},
        {"icon": "🤲", "title": "Zekat & Fitre", "description": "Şer'i esaslara uygun, aracısız zekat dağıtımı.", "url": "/zekat"},
        {"icon": "👶", "title": "Yetim Himayesi", "description": "Eğitim, sağlık ve aylık düzenli yetim sponsorluğu.", "url": "/kampanyalar"},
        {"icon": "🍲", "title": "Gıda & İftar", "description": "Aşevi, kumanya kolisi ve sıcak yemek ikramı.", "url": "/kampanyalar"},
    ]),
])
_section("categories-photo", "Kategoriler: Görselli Kartlar", "Bağış", "Arka plan görselli ve koyu gradyanlı kategori vitrini.", [
    B("categories", kicker="PROJELER", title="Destek Alanlarımız", look="photo", columns=4, items=[
        {"icon": "💧", "image_url": "/demo/water.webp", "badge": "Su", "title": "Su Kuyuları", "description": "Temiz içme suyuna erişim.", "url": "/kampanyalar"},
        {"icon": "🐑", "image_url": "/demo/kurban.webp", "badge": "Kurban", "title": "Kurban Bağışı", "description": "Görüntülü kesim bilgilendirmesi.", "url": "/kampanyalar"},
        {"icon": "📚", "image_url": "/demo/quran.webp", "badge": "Eğitim", "title": "İlim & Burs", "description": "Hafızlık ve öğrenci bursları.", "url": "/kampanyalar"},
        {"icon": "🍲", "image_url": "/demo/ramadan.webp", "badge": "Gıda", "title": "Kumanya & İftar", "description": "Ailelere aylık gıda desteği.", "url": "/kampanyalar"},
    ]),
])
_section("categories-glass", "Kategoriler: Cam Efektli Koyu Vitrin", "Bağış", "Koyu zemin üzerinde buzlu cam kategori kartları.", [
    B("categories", kicker="KATEGORİLER", title="Nereye Destek Olmak İstersiniz?", look="glass", columns=4),
])
_section("categories-carousel", "Kategoriler: Kaydırmalı Şerit", "Bağış", "Yatay kaydırılabilir bağış kategorileri şeridi.", [
    B("categories", kicker="TÜM KATEGORİLER", title="Bağış Seçenekleri", look="carousel", columns=4, show_all_link=True),
])
_section("zakat", "Zekat bandı", "Bağış", "Zekat hesaplayıcıya yönlendiren bant.",
         [B("zakat_band", title="Zekatınızı doğru hesaplayın", text="Güncel nisap miktarıyla zekatınızı hesaplayın, dilediğiniz projeye aktarın.", button_label="Zekat hesapla", button_url="/zekat-hesapla")])
_section("zakat-calculator", "Zekat mini hesaplayıcı", "Bağış", "Canlı %2,5 zekat hesaplayan interaktif bant.",
         [B("zakat_band", look="calculator", kicker="ZEKAT HESAPLAYICI", title="Zekatınızı saniyeler içinde hesaplayın", text="Nakit, altın, döviz ve ticari mal varlığınızın %2,5'ini hemen hesaplayıp güvenle bağışlayın.", nisab_note="85 gr altın / 595 gr gümüş nisap esasına göre", button_label="Detaylı hesapla", button_url="/zekat-hesapla", button2_label="Zekat bağışı yap", button2_url="/bagis?kategori=zekat")])
_section("zakat-nisab-cards", "Nisap & varlık kartları", "Bağış", "4 zekat varlık sınıfını ve nisap bilgisini gösteren bölüm.",
         [B("zakat_band", look="nisab_cards", kicker="ZEKAT REHBERİ", title="Hangi varlıklardan zekat verilir?", text="Nisap miktarına ulaşan ve üzerinden bir kameri yıl geçen tüm varlıklarınız için zekatınızı kolayca hesaplayın.", nisab_note="2026 güncel nisap: 85 gr altın veya karşılığı", button_label="Zekat hesapla", button_url="/zekat-hesapla", button2_label="Zekat fonuna aktar", button2_url="/bagis?kategori=zekat")])
_section("zakat-glass", "Cam efektli zekat bandı", "Bağış", "Koyu gradyan üzerinde cam efektli modern zekat çağrısı.",
         [B("zakat_band", look="glass", kicker="ARINMA VE PAYLAŞIM", title="Malınızı zekatla bereketlendirin", text="Zekatınız, ihtiyaç sahiplerinin temel gıda, eğitim ve barınma ihtiyaçlarına doğrudan ulaşır.", nisab_note="%100 zekat fonu güvencesi", button_label="Zekat hesapla", button_url="/zekat-hesapla", button2_label="Hemen zekat ver", button2_url="/bagis?kategori=zekat")])
_section("zakat-strip", "İnce zekat hatırlatma çubuğu", "Bağış", "Sayfa içi kompakt zekat yönlendirme şeridi.",
         [B("zakat_band", look="strip", title="Zekatınızı hesaplayıp hemen ulaştırın", nisab_note="Güncel nisap · %2,5", button_label="Zekat hesapla", button_url="/zekat-hesapla", button2_label="Bağış yap", button2_url="/bagis?kategori=zekat")])

# Hakkımızda
_section("about", "Hakkımızda (görsel + metin)", "Hakkımızda", "Kurumunuzu anlatan görselli tanıtım.",
         [B("image_text", image_url="/demo/community.webp", alt="", image_side="left", kicker="BİZ KİMİZ", title="Gönüllülerle büyüyen bir iyilik hareketi",
            text="1995'ten bu yana eğitim, su ve acil yardım alanlarında çalışıyoruz.\n\nHer kuruşun hesabını veren şeffaf bir yapıyla, bağışlarınızı ihtiyaç sahiplerine **aracısız** ulaştırıyoruz.",
            button_label="Hikayemiz", button_url="/hakkimizda")])
_section("mission-3", "Misyon / vizyon / değerler", "Hakkımızda", "Üç kartta kurumun amacı.",
         [section([heading("Neden varız?", kicker="AMACIMIZ"),
                   card_columns("1-1-1", [card("Misyonumuz", "İhtiyaç sahiplerine onurlarını koruyarak, sürdürülebilir destek ulaştırmak.", "🎯"),
                                          card("Vizyonumuz", "Kimsenin temel ihtiyaçlardan mahrum kalmadığı bir dünya için çalışmak.", "🌍"),
                                          card("Değerlerimiz", "Şeffaflık, emanet bilinci, gönüllülük ve hesap verebilirlik.", "🤝")])], tone="soft")])
_section("story", "Hikaye (metin + görsel)", "Hakkımızda", "Bir projenin hikayesi; görsel sağda.",
         [B("image_text", image_url="/demo/water.webp", image_side="right", kicker="SAHADAN", title="Ömer'in köyüne su geldi",
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
_section("trust-strip", "Kompakt güven & SSL şeridi", "Etki & güven", "Ödeme ve kampanya altları için ince 4'lü güven çubuğu.",
         [B("trust", look="strip", show_contact=False, show_payment_badges=True, items=[
             {"icon": "🔒", "title": "256-Bit SSL", "text": "Şifreli güvenli bağlantı"},
             {"icon": "🛡️", "title": "3D Secure", "text": "Banka onaylı kart ödemesi"},
             {"icon": "🧾", "title": "Anında Makbuz", "text": "SMS & e-posta belgesi"},
             {"icon": "📹", "title": "Saha Raporu", "text": "Video & fotoğraf bildirimi"},
         ])])
_section("trust-seals", "Ödeme & sertifika mühürleri", "Etki & güven", "Kart mühürleri ve resmi güvence kartları.",
         [B("trust", kicker="GÜVENLİ BAĞIŞ", title="Şeffaf ve Denetlenen Altyapı", look="seals", show_contact=False, show_payment_badges=True, items=[
             {"icon": "🏛️", "badge": "Resmi Kurum", "title": "İzinli Yardım Toplama", "text": "Tüm faaliyetlerimiz ilgili mevzuata uygun yürütülür."},
             {"icon": "🔍", "badge": "Yıllık Denetim", "title": "Bağımsız Mali Denetim", "text": "Gelir-gider tablolarımız yıllık denetimden geçer."},
             {"icon": "🔐", "badge": "KVKK Uyumlu", "title": "Veri Güvenliği", "text": "Bağışçı bilgileriniz 3. şahıslarla paylaşılmaz."},
         ])])
_section("trust-dark", "Koyu kurumsal güvence bandı", "Etki & güven", "Koyu zemin üzerinde kurumsal güvence garantileri.",
         [B("trust", kicker="TEMİNATIMIZ", title="Bağışınız Emanetimizdir", look="dark_band", show_contact=False, show_payment_badges=True, items=[
             {"icon": "🤝", "title": "Vekalet Hassasiyeti", "text": "Zekât, fitre ve kurban emanetleri şartlarına uygun ulaştırılır."},
             {"icon": "📊", "title": "%100 Şeffaflık", "text": "Projelerin her aşamasını bağışçı panelinden takip edin."},
             {"icon": "📞", "title": "7/24 Bağışçı Hattı", "text": "Tüm sorularınız için destek ekibimiz yanınızda."},
         ])])
_section("trust-split", "Büyük güvence + 2x2 maddeler (Split)", "Etki & güven", "Solda ana güvence özeti ve buton, sağda 2x2 şeffaflık taahhüdü.",
         [B("trust", kicker="ŞEFFAFLIK İLKESİ", title="Neden Bize Güvenebilirsiniz?", text="Her bağışı resmi makbuz, bağımsız denetim ve saha geri bildirimiyle güvence altına alıyoruz.", look="split_guarantee", show_contact=False, button_label="Denetim Raporlarını Gör", button_url="/hakkimizda", items=[
             {"icon": "🧾", "title": "Doğrulanabilir Makbuz", "text": "Her işlem benzersiz makbuz numarasıyla kayıtlıdır."},
             {"icon": "📹", "title": "Kişiye Özel Video", "text": "Kurban ve kuyu projelerinde saha görüntüsü iletilir."},
             {"icon": "💳", "title": "3D Secure Ödeme", "text": "Kart verisi tutulmadan banka altyapısından işlem."},
             {"icon": "🌍", "title": "Yerinde Teslim", "text": "Aracısız, doğrudan saha ekipleriyle dağıtım."},
         ])])
_section("testimonials", "Bağışçı yorumları", "Etki & güven", "Üç bağışçı yorumu, kartlarda.",
         [section([heading("Bağışçılarımız ne diyor?", kicker="YORUMLAR"),
                   card_columns("1-1-1", [card("Mehmet K.", "“Makbuzum anında geldi, projenin fotoğraflarını da gördüm. İçim rahat.”", "⭐⭐⭐⭐⭐"),
                                          card("Mustafa A.", "“Her ay düzenli bağış yapıyorum; raporlar çok açık ve anlaşılır.”", "⭐⭐⭐⭐⭐"),
                                          card("Ahmet Y.", "“Kurban vekaletimi zahmetsizce verdim, kesim videosu da geldi.”", "⭐⭐⭐⭐⭐")])], tone="soft")])

# Çağrı
_section("cta-pattern", "Desenli çağrı bandı", "Çağrı", "Geometrik desen üzerinde büyük çağrı.",
         [B("banner", layout="image", image_url="/demo/pattern.webp", kicker="SİZ DE KATILIN", title="Küçük bir bağış, büyük bir umut",
            text="Aylık düzenli bağışla iyiliği sürekli kılın.", button_label="Düzenli bağışçı ol", button_url="/kampanyalar", align="center")])
_section("cta-band", "Çağrı bandı", "Çağrı", "Tek satırlık renkli çağrı.",
         [B("cta_band", title="Askıda iyilik: ihtiyaç sahibine sen ulaş", text="Askıdaki bağışlar en acil ihtiyaca yönlendirilir.", button_label="Askıya bağış bırak", button_url="/kampanyalar")])
_section("cta-centered", "Çağrı bandı: Ortalı çift butonlu", "Çağrı", "Üst etiket, ortalı başlık, çift buton ve güven notu.",
         [B("cta_band", look="centered", kicker="BİRLİKTE DAHA GÜÇLÜYÜZ", title="Bugün bir hayata umut olun", text="Düzenli veya tek seferlik bağışlarınızla kalıcı eserlere destek verin.", button_label="Hemen bağış yap", button_url="/kampanyalar", button2_label="Gönüllü ol", button2_url="/gonullu", trust_note="%100 şeffaf bağış takibi · Güvenli 3D Ödeme")])
_section("cta-glass", "Çağrı bandı: Cam efektli", "Çağrı", "Görsel üzerinde buzlu cam (glassmorphism) çağrı kutusu.",
         [B("cta_band", look="glass", kicker="İYİLİK HAREKETİ", title="Paylaştıkça çoğalan bereket", text="Zekat, fitre ve sadakalarınızı ihtiyaç sahiplerine güvenle ulaştırıyoruz.", button_label="Bağış yap", button_url="/kampanyalar", button2_label="Detaylı bilgi", button2_url="/hakkimizda")])
_section("cta-split", "Çağrı bandı: Görselli iki sütun", "Çağrı", "Solda çağrı ve çift buton, sağda tam boy saha görseli.",
         [B("cta_band", look="split", kicker="SAHADAN DESTEK", title="İhtiyaç bölgelerine hızlı yardım ulaştırın", text="Ekiplerimiz afet ve kriz bölgelerinde kesintisiz görev yapıyor.", image_url="/demo/relief.webp", button_label="Acil yardım bağışı", button_url="/kampanyalar", button2_label="Saha raporları", button2_url="/hakkimizda")])
_section("cta-quick-amounts", "Çağrı bandı: Hızlı tutar çipli", "Çağrı", "Doğrudan tutar seçip bağış sayfasına yönlendiren bant.",
         [B("cta_band", look="quick_amounts", kicker="HIZLI DESTEK", title="Dilediğiniz tutarla iyiliğe katılın", text="Seçtiğiniz tutarla doğrudan bağış adımına geçin.", quick_amounts="250,500,1000,2500", button_label="Diğer tutarlar", button_url="/bagis", trust_note="Anında e-makbuz · 256-bit SSL")])
_section("volunteer", "Gönüllü çağrısı", "Çağrı", "Renkli banner + gönüllü başvuru butonu.",
         [B("banner", layout="color", kicker="GÖNÜLLÜLÜK", title="Vaktini iyiliğe ayır", text="Saha çalışmaları, organizasyonlar ve dijital destek için gönüllüler arıyoruz.",
            button_label="Gönüllü ol", button_url="/gonullu")])
_section("notice", "Duyuru", "Çağrı", "Bilgilendirme kutusu (ör. kurban kayıt tarihleri).",
         [B("notice", tone="warning", title="Kurban kayıtları 20 Mayıs'ta kapanıyor", text="Hisse kayıtlarınızı son tarihten önce tamamlamayı unutmayın.")])
_section("notice-accent", "Duyuru: Sol kalın şeritli", "Çağrı", "Sol dikey şeritli, ikonlu ve butonlu modern callout kutusu.",
         [B("notice", look="accent_left", tone="brand", badge="BİLGİLENDİRME", title="Zekat ve fitre bağışlarınız doğrudan fonlara aktarılır", text="Tüm zekat emanetleri şer'i esaslara uygun olarak ihtiyaç sahiplerine ulaştırılır.", button_label="Zekat hesapla", button_url="/zekat-hesapla")])
_section("notice-official", "Duyuru: Resmi duyuru kutusu", "Çağrı", "Tarih/durum rozetli ve aksiyon butonlu kurumsal duyuru.",
         [B("notice", look="official", tone="info", badge="RESMİ DUYURU", title="2026 yılı faaliyet ve denetim raporu yayımlandı", text="Bağışçı şeffaflık politikamız gereği tüm mali tablolarımız kamuoyunun erişimine açıktır.", button_label="Raporu incele", button_url="/hakkimizda")])
_section("notice-urgent", "Duyuru: Yüksek kontrast acil kutu", "Çağrı", "Dolgulu, dikkat çekici ve kapatılabilir acil durum duyurusu.",
         [B("notice", look="solid", tone="danger", badge="ACİL", closable=True, title="Acil yardım ekiplerimiz sahada", text="Bölgedeki gıda, temiz su ve barınma ihtiyacı için destekleriniz bekleniyor.", button_label="Hemen destek ol", button_url="/kampanyalar")])

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
_section("news-magazine", "Haberler (dergi / manşet + yan liste)", "SSS & iletişim", "Solda büyük manşet haberi, sağda 3 kompakt haber satırı.",
         [B("news", kicker="SAHADAN GÜNCEL", title="Son Faaliyetlerimiz ve Duyurular", look="magazine", limit=4)])
_section("news-list", "Haberler (yatay bülten listesi)", "SSS & iletişim", "Solda görsel, sağda özet içeren yatay haber akışı.",
         [B("news", kicker="BASIN & BÜLTEN", title="Kurumsal Haberler", look="list", limit=5)])
_section("news-overlay", "Haberler (görsel üstü başlıklar)", "SSS & iletişim", "Tam fotoğraf üzerine başlık ve tarih gösteren modern kartlar.",
         [B("news", kicker="SAHADAN KARELER", title="Güncel Saha Raporları", look="overlay", columns=3, limit=3)])
_section("news-compact", "Haberler (kompakt duyuru akışı)", "SSS & iletişim", "Tarih ve başlık odaklı sade bülten listesi.",
         [B("news", kicker="DUYURULAR", title="Son Duyurular", look="compact", limit=6)])

# Header & footer variants
# --- Ready-made sliders ------------------------------------------------------------------

def slide(image: str, badge: str, title: str, body: str, button: tuple = ("Bağış yap", "/kampanyalar"), button2: Optional[tuple] = None,
          align: str = "left", overlay: int = 40) -> dict:
    out = {"image_url": image, "badge": badge, "title": title, "text": body, "align": align, "overlay": overlay}
    if button:
        out["button_label"], out["button_url"] = button
    if button2:
        out["button2_label"], out["button2_url"] = button2
    return out


def _slider(key: str, label: str, description: str, slides: list, **props) -> None:
    _section(key, label, "Slider", description, [B("slider", slides=slides, **{"layout": "card", "nav": "thumbs", "height": "lg", "autoplay": True, "interval": 6, "effect": "fade", **props})])


_slider("slider-ramadan", "Ramazan slider", "Fenerler, cami ve iftar sofrası; solarak geçiş.", [
    slide("/demo/ramadan.webp", "RAMAZAN 2027", "On bir ayın sultanı kapıda", "Fitre, zekat ve iftar bağışlarınızı ihtiyaç sahiplerine ulaştırıyoruz.", button2=("Zekat hesapla", "/zekat-hesapla"), overlay=30),
    slide("/demo/food.webp", "İFTAR SOFRASI", "Bir sofra, bin dua", "Her gün yüzlerce kişilik iftar sofrası kuruyoruz. Bir iftar bedeliyle siz de ortak olun.", overlay=45),
    slide("/demo/mosque.webp", "FİTRE & ZEKAT", "Emanetiniz yerine ulaşsın", "Zekat ve fitreleriniz vekaleten, bayramdan önce dağıtılır.", align="center", overlay=40),
])
_slider("slider-kurban", "Kurban slider", "Kurban vekaleti, hisse ve video bilgilendirme slaytları.", [
    slide("/demo/kurban.webp", "KURBAN 2027", "Kurbanınız kardeşliğe vesile olsun", "Vekaletinizi verin; kesim videonuz ve bilgilendirme mesajınız aynı gün gelsin.", button=("Kurban bağışla", "/kampanyalar"), button2=("Hesap numaraları", "/sayfa/hesap-numaralari"), overlay=25),
    slide("/demo/relief.webp", "HİSSELİ KURBAN", "Yedi hisse, yedi aileye bayram", "Büyükbaş hisselerinizi tek tek ya da ailece alabilirsiniz.", overlay=40),
    slide("/demo/food.webp", "AFRİKA & ASYA", "Etin hiç girmediği evlere", "Kurbanlarınız en çok ihtiyaç duyulan bölgelerde kesilip dağıtılır.", align="center", overlay=50),
], effect="slide")
_slider("slider-winter", "Kış yardımı slider", "Kışlık giyim, yakacak ve koli yardımı çağrıları.", [
    slide("/demo/winter.webp", "KIŞ YARDIMI", "Bir battaniye, bir kışı ısıtır", "Soğuk bölgelerdeki ailelere yakacak, battaniye ve mont ulaştırıyoruz.", overlay=35),
    slide("/demo/relief.webp", "KIŞLIK KOLİ", "Bir koli, bir ailenin kışı", "Mont, bot, atkı ve bereden oluşan kışlık koliler hazırlıyoruz.", button=("Koli bağışla", "/kampanyalar"), overlay=40),
    slide("/demo/hands.webp", "EL ELE", "Üşüyen bir el varsa, sıcak bir el de var", "Düzenli bağışçı olun, kış boyu desteğiniz sürsün.", button=("Düzenli bağışçı ol", "/kampanyalar"), align="center", overlay=45),
])
_slider("slider-education", "Eğitim & Kur'an slider", "Kur'an eğitimi, burs ve yetim slaytları.", [
    slide("/demo/quran.webp", "KUR'AN EĞİTİMİ", "Bir hafız, bir ömürlük sadaka-i cariye", "Talebelerimizin barınma, iaşe ve eğitim giderlerine ortak olun.", button=("Talebe okut", "/kampanyalar"), overlay=35),
    slide("/demo/education.webp", "BURS", "Okusun diye", "Üniversite ve lise öğrencilerine aylık burs desteği sağlıyoruz.", button=("Burs ver", "/kampanyalar"), overlay=45),
    slide("/demo/orphan.webp", "YETİM", "Bir yetimin elinden tutun", "Aylık sponsorlukla bir çocuğun eğitimini üstlenin.", button=("Sponsor ol", "/kampanyalar"), overlay=45),
])
_slider("slider-emergency", "Acil yardım slider", "Afet ve acil durum çağrıları; ortalı, güçlü karartma.", [
    slide("/demo/relief.webp", "ACİL YARDIM", "Şimdi yardım zamanı", "Afet bölgesine gıda, su ve hijyen kolisi ulaştırıyoruz.", button=("Acil bağış yap", "/kampanyalar"), align="center", overlay=55),
    slide("/demo/water.webp", "TEMİZ SU", "Su hayattır", "Acil su tankeri ve kalıcı kuyu çalışmalarına destek olun.", align="center", overlay=55),
    slide("/demo/food.webp", "SICAK YEMEK", "Günde bin kap sıcak yemek", "Seyyar aşevimiz bölgede hizmet veriyor.", align="center", overlay=55),
], interval=5)
_slider("slider-fullscreen", "Tam ekran tanıtım slider", "Ekranı kaplayan, ortalı ve sakin geçişli tanıtım.", [
    slide("/demo/hands.webp", "BİRLİKTE", "İyilik, paylaştıkça çoğalır", "1995'ten beri gönüllülerle büyüyen bir iyilik hareketi.", button=("Bizi tanıyın", "/hakkimizda"), button2=("Bağış yap", "/kampanyalar"), align="center", overlay=50),
    slide("/demo/relief.webp", "GÖNÜLLÜLÜK", "Vaktini iyiliğe ayır", "Sahada, eğitimde ve dijitalde gönüllülerimize katılın.", button=("Gönüllü ol", "/gonullu"), align="center", overlay=50),
    slide("/demo/pattern.webp", "ŞEFFAFLIK", "Her kuruşun hesabı açık", "Bağımsız denetim raporlarımız ve faaliyet raporlarımız yayında.", button=("Raporlar", "/hakkimizda"), align="center", overlay=30),
], layout="overlay", nav="dots", height="screen", interval=7, arrows=False)
_slider("slider-poster", "Afiş slider (görsel kırpılmaz)", "Hazır afiş/banner görselleriniz için 16:5 oran; yazı görselin üstüne binmez.", [
    slide("/demo/kurban-poster.webp", "", "", "", button=("Kurban bağışla", "/kampanyalar"), overlay=0),
    slide("/demo/ramadan-poster.webp", "", "", "", button=("Ramazan bağışı", "/kampanyalar"), overlay=0),
    slide("/demo/winter-poster.webp", "", "", "", button=("Kış yardımı", "/kampanyalar"), overlay=0),
], height="poster", effect="fade", interval=5)
_slider("slider-compact", "Alçak bilgi slider", "Sayfa içinde kullanılan alçak, sağa hizalı slider.", [
    slide("/demo/pattern.webp", "DUYURU", "Faaliyet raporumuz yayında", "2026 yılı çalışmalarımızı rakamlarla inceleyin.", button=("Raporu oku", "/hakkimizda"), align="right", overlay=35),
    slide("/demo/quran.webp", "YENİ DÖNEM", "Kayıtlar başladı", "Kur'an kursu ve yaz okulu ön kayıtları açıldı.", button=("Ön kayıt", "/on-kayit"), align="right", overlay=40),
], layout="overlay", nav="dots", height="sm", effect="slide", dots=False)
_slider("slider-glass", "Cam kartlı vitrin slider", "Görsel üzerinde buzlu cam kutu, yakınlaşma efekti ve 01/03 sayaç.", [
    slide("/demo/water.webp", "SU KUYUSU", "Temiz suyla gelen hayat", "Kurak bölgelerde kalıcı sondaj ve şadırvan kuyuları açıyoruz.", button=("Kuyu açtır", "/kampanyalar"), overlay=25),
    slide("/demo/orphan.webp", "YETİM SPONSORLUĞU", "Bir çocuğun yarınına umut ol", "Aylık düzenli destekle eğitim ve barınma ihtiyaçlarını karşılayın.", button=("Sponsor ol", "/kampanyalar"), overlay=25),
    slide("/demo/mosque.webp", "MİSAFİRHANE & CAMİ", "İbadet ve ilim merkezleri", "Köy ve beldelerde cami, Kur'an kursu ve aşevi inşa ediyoruz.", button=("Destek ol", "/kampanyalar"), overlay=25),
], layout="glass", nav="numbers", effect="zoom", height="lg")
_slider("slider-split-story", "Bölünmüş hikaye slider", "Açık zemin üzerinde solda metin, sağda çerçeveli görsel.", [
    slide("/demo/community.webp", "SAHA HİKAYESİ", "Gönüllülerimizle 27 ülkedeyiz", "Emanetlerinizi bizzat saha ekiplerimizle ihtiyaç sahiplerine ulaştırıyoruz.", button=("Hikayemiz", "/hakkimizda"), button2=("Gönüllü ol", "/gonullu")),
    slide("/demo/education.webp", "BURS DESTEĞİ", "Eğitimde fırsat eşitliği", "Lise ve üniversite öğrencilerine aylık kesintisiz burs sağlıyoruz.", button=("Burs ver", "/kampanyalar")),
    slide("/demo/food.webp", "AŞEVİ", "Her gün 5.000 kap sıcak yemek", "Yaşlı, hasta ve kimsesiz ailelerin sofrasına sıcak aş götürüyoruz.", button=("İftar / yemek ver", "/kampanyalar")),
], layout="split", nav="dots", effect="slide", height="md")
_slider("slider-tabs-projects", "Başlık sekmeli proje slider", "Altta tıklanabilir başlık sekmeleri ve ilerleme çubuğu.", [
    slide("/demo/kurban.webp", "KURBAN", "Vekaletle kurban organizasyonu", "Kesim anı videosu ve SMS bilgilendirmesi ile şeffaf süreç.", button=("Hisse al", "/kampanyalar"), overlay=45),
    slide("/demo/water.webp", "SU KUYUSU", "Afrika ve Asya'da su kuyuları", "Adınıza veya sevdikleriniz adına kalıcı su kuyusu açtırın.", button=("Kuyu bağışla", "/kampanyalar"), overlay=45),
    slide("/demo/relief.webp", "ACİL YARDIM", "Afet ve kriz bölgeleri", "İlk 24 saat içinde gıda, battaniye ve sağlık desteği.", button=("Acil yardım", "/kampanyalar"), overlay=45),
    slide("/demo/quran.webp", "HAFIZLIK", "Kur'an talebelerine destek", "Bir hafızın yıllık eğitim ve barınma giderini üstlenin.", button=("Talebe okut", "/kampanyalar"), overlay=45),
], layout="overlay", nav="tabs", effect="zoom", height="lg")
_slider("slider-minimal-strip", "Sade alt şeritli slider", "Temiz alt bilgi şeridi ve üstte ince ilerleme çubuğu.", [
    slide("/demo/mosque.webp", "RAMAZAN", "İftar ve sahur sofraları kuruluyor", "Her gün binlerce kardeşimizle aynı sofrada buluşuyoruz.", button=("Sofraya ortak ol", "/kampanyalar"), overlay=20),
    slide("/demo/winter.webp", "KIŞ", "Sıcak bir yuva, sıcak bir mont", "Kış şartlarının ağır geçtiği bölgelere yakacak ve giyim ulaştırıyoruz.", button=("Kış yardımı", "/kampanyalar"), overlay=20),
    slide("/demo/hands.webp", "ZEKAT", "Zekatlarınız emin ellerde", "Fıkhi ölçülere uygun, doğrudan hak sahiplerine teslim.", button=("Zekat ver", "/zekat-hesapla"), overlay=20),
], layout="minimal", nav="progress", effect="fade", height="md")
_slider("slider-stacked-impact", "Katmanlı vitrin slider", "Üstte geniş görsel, altta yükselen beyaz bilgi kartı.", [
    slide("/demo/relief.webp", "GAZZE & FİLİSTİN", "Acil insani yardım koridoru", "Gıda kolisi, temiz su ve tıbbi malzeme sevkiyatlarımız sürüyor.", button=("Acil bağış yap", "/kampanyalar"), button2=("Detaylı bilgi", "/hakkimizda"), overlay=20),
    slide("/demo/orphan.webp", "YETİM GÜLERSE", "4.600 yetim çocuğa aylık destek", "Eğitim, sağlık ve gıda desteğiyle yanlarındayız.", button=("Yetim destekle", "/kampanyalar"), overlay=20),
    slide("/demo/water.webp", "SADAKA-İ CARİYE", "Ömürlük hayır: Su kuyusu", "Yıllarca akacak temiz su kaynağıyla kalıcı iz bırakın.", button=("Başvur", "/kampanyalar"), overlay=20),
], layout="stacked", nav="numbers", effect="flip", height="md")

# --- Ready-made carousels ----------------------------------------------------------------

_section("carousel-projects-3", "Proje kartları carousel (3'lü)", "Carousel", "Görselli, etiketli ve butonlu 3'lü kaydırmalı proje kartları.",
         [B("carousel", kicker="PROJELERİMİZ", title="Öne çıkan yardım alanları", subtitle="İlgi duyduğunuz alanı seçerek hemen destek olabilirsiniz.",
            look="card", columns=3, aspect="4/3", autoplay=True, arrow_pos="sides", dots=True, items=[
                {"image_url": "/demo/water.webp", "badge": "SU KUYUSU", "title": "Temiz Su Kuyuları", "text": "Kurak köylere kalıcı su kuyuları açıyoruz.", "button_label": "Kuyu açtır", "button_url": "/kampanyalar"},
                {"image_url": "/demo/orphan.webp", "badge": "YETİM", "title": "Yetim Sponsorluğu", "text": "Aylık destekle bir yetimin eğitimini üstlenin.", "button_label": "Sponsor ol", "button_url": "/kampanyalar"},
                {"image_url": "/demo/food.webp", "badge": "GIDA", "title": "Kumanya & Aşevi", "text": "Günlük sıcak yemek ve aylık gıda kolisi dağıtımı.", "button_label": "Kumanya ver", "button_url": "/kampanyalar"},
                {"image_url": "/demo/education.webp", "badge": "EĞİTİM", "title": "Öğrenci Bursu", "text": "Başarılı ve ihtiyaç sahibi öğrencilere burs desteği.", "button_label": "Burs ver", "button_url": "/kampanyalar"},
                {"image_url": "/demo/winter.webp", "badge": "KIŞ", "title": "Kış Yardımları", "text": "Mont, bot, battaniye ve yakacak desteği.", "button_label": "Destek ol", "button_url": "/kampanyalar"},
            ])])
_section("carousel-overlay-4", "Görsel üstü 4'lü dikey carousel", "Carousel", "Dikey poster tarzında, yazı görsel üstünde 4'lü kaydırmalı kartlar.",
         [B("carousel", kicker="SAHADAN", title="Dünyanın dört bir yanındayız", look="overlay", columns=4, aspect="3/4", autoplay=True, arrow_pos="sides", dots=True, items=[
             {"image_url": "/demo/water.webp", "badge": "AFRİKA", "title": "Çad & Nijer Su Kuyuları", "button_label": "İncele", "button_url": "/kampanyalar"},
             {"image_url": "/demo/relief.webp", "badge": "ORTA DOĞU", "title": "Acil Gıda & Barınma", "button_label": "Destek ol", "button_url": "/kampanyalar"},
             {"image_url": "/demo/quran.webp", "badge": "ASYA", "title": "Medrese & Hafızlık", "button_label": "Katkı sun", "button_url": "/kampanyalar"},
             {"image_url": "/demo/winter.webp", "badge": "BALKANLAR", "title": "Kışlık Yakacak & Koli", "button_label": "Bağış yap", "button_url": "/kampanyalar"},
             {"image_url": "/demo/community.webp", "badge": "TÜRKİYE", "title": "Aşevi & Aile Destek", "button_label": "Detay", "button_url": "/kampanyalar"},
         ])])
_section("carousel-featured-2", "Büyük odaklı hikaye carousel (2'li)", "Carousel", "Geniş 16:9 görsellerle 2'li büyük hikaye kartları.",
         [section([B("carousel", kicker="HİKAYELER", title="İyiliğin ulaştığı hayatlar", look="featured", columns=2, aspect="16/9", autoplay=False, arrow_pos="bottom", dots=True, items=[
             {"image_url": "/demo/water.webp", "badge": "SU KUYUSU", "title": "Köyümüz artık 6 km yürümüyor", "text": "Açılan yeni sondaj kuyusuyla 450 kişi temiz suya kavuştu.", "button_label": "Projeyi gör", "button_url": "/kampanyalar"},
             {"image_url": "/demo/education.webp", "badge": "EĞİTİM", "title": "Burslarla mezun olan 120 genç", "text": "Mühendislikten tıbba kadar onlarca öğrenci mezuniyet sevinci yaşadı.", "button_label": "Burs ver", "button_url": "/kampanyalar"},
             {"image_url": "/demo/kurban.webp", "badge": "KURBAN", "title": "Bayram sevinci 18 ülkede", "text": "Kurban hisselerinizle binlerce ailenin sofrasına bayram geldi.", "button_label": "Kurban bağışı", "button_url": "/kampanyalar"},
         ])], tone="soft")])
_section("carousel-minimal-4", "Sade hizmet carousel (4'lü)", "Carousel", "Çerçevesiz, temiz 4'lü hizmet ve bağış alanları carousel'i.",
         [B("carousel", kicker="NELER YAPIYORUZ?", title="Faaliyet başlıklarımız", look="minimal", columns=4, aspect="1/1", autoplay=True, arrow_pos="sides", dots=False, items=[
             {"image_url": "/demo/mosque.webp", "title": "Cami & Mescid İnşası", "text": "İbadethane olmayan bölgelere kalıcı mescidler."},
             {"image_url": "/demo/food.webp", "title": "Günlük Sıcak Yemek", "text": "Aşevlerimizden her gün binlerce kişiye ikram."},
             {"image_url": "/demo/orphan.webp", "title": "Yetim Hamiliği", "text": "Eğitim, sağlık ve giyim ihtiyaçlarının düzenli takibi."},
             {"image_url": "/demo/hands.webp", "title": "Zekat & Fitre Dağıtımı", "text": "Emanetlerinizin doğrudan ihtiyaç sahiplerine teslimi."},
             {"image_url": "/demo/relief.webp", "title": "Afet Müdahale", "text": "Deprem ve sel bölgelerine hızlı lojistik destek."},
         ])])
_section("carousel-pill-3", "Yatay kompakt kart carousel", "Carousel", "Solda kare görsel, sağda başlık ve metin; kompakt yatay kartlar.",
         [B("carousel", kicker="HIZLI ERİŞİM", title="İyilik seçenekleri", look="pill", columns=3, aspect="1/1", autoplay=True, arrow_pos="sides", dots=True, items=[
             {"image_url": "/demo/water.webp", "badge": "SÜREKLİ", "title": "Su Kuyusu Fonu", "text": "Dilediğiniz tutarla ortak kuyu fonuna katılın.", "button_label": "Katıl", "button_url": "/kampanyalar"},
             {"image_url": "/demo/food.webp", "badge": "GÜNLÜK", "title": "Bir Kap Sıcak Yemek", "text": "Bir kişinin günlük yemek bedelini karşılayın.", "button_label": "Bağışla", "button_url": "/kampanyalar"},
             {"image_url": "/demo/quran.webp", "badge": "İLİM", "title": "Kur'an-ı Kerim Hediyesi", "text": "Talebeler için mushaf ve ilmihal seti hediye edin.", "button_label": "Hediye et", "button_url": "/kampanyalar"},
             {"image_url": "/demo/orphan.webp", "badge": "AYLIK", "title": "Yetim Eğitim Paketi", "text": "Okul çantası ve kırtasiye desteği sağlayın.", "button_label": "Destekle", "button_url": "/kampanyalar"},
         ])])
_section("carousel-gallery", "Fotoğraf galerisi carousel", "Carousel", "Tıklanınca büyüyen kaydırmalı fotoğraf galerisi.",
         [B("image_gallery", kicker="SAHADAN KARELER", title="Çalışmalarımızdan görüntüler", layout="carousel", columns=4, aspect="4/3", autoplay=True, lightbox=True, items=[
             {"image_url": f"/demo/{name}.webp", "caption": caption} for name, caption in (
                 ("water", "Su kuyusu açılışı"), ("education", "Öğrenci buluşması"), ("food", "Aşevi dağıtımı"),
                 ("orphan", "Yetim şenliği"), ("kurban", "Kurban organizasyonu"), ("relief", "Acil yardım kolileri"))])])
_section("carousel-news", "Haberler carousel", "Carousel", "Son haber ve duyurular yatay kaydırmalı kartlarda.",
         [B("news", kicker="GÜNCEL", title="Sahadan son haberler", limit=8, layout="carousel")])
_section("carousel-testimonials-grid", "Bağışçı yorumları (ızgara)", "Etki & güven", "Üç sütunlu bağışçı teşekkür kartları.",
         [section([B("testimonials", kicker="SİZDEN GELENLER", title="Bağışçılarımız ne diyor?", look="grid", items=[
             {"quote": "Kurban videom aynı gün geldi, gözlerim doldu. Allah razı olsun.", "name": "Hasan T.", "role": "İstanbul"},
             {"quote": "Yıllardır düzenli bağış yapıyorum; her kuruşun raporunu görüyorum.", "name": "Mustafa E.", "role": "Konya"},
             {"quote": "Açtırdığımız kuyunun fotoğraflarını çocuklarımla izledik.", "name": "İbrahim S.", "role": "Almanya"},
         ])], tone="soft")])
_section("header-centered-split", "İki satırlı modern header", "Header", "Üstte sosyal medya ve iletişim, altta logo-menü-buton.",
         [_row({"tone": "soft", "height": 40, "border": True},
               [B("contact_info", layout="inline", show_phone=True, show_email=True)], [],
               [B("social_icons", p={"style": "round"}), B("language_switcher", advanced=_TABLET_DOWN)], style={"font_size": 13}),
          _row({"tone": "light", "height": 80, "sticky": True, "shrink": True, "center_align": "center"},
               [B("logo", size=44)], [B("nav_menu", source="header", mobile="drawer")],
               [B("cart_button"), B("donate_button", p={"style": "primary"}, heart=True)])], kind="header")
_section("footer-compact", "Kompakt koyu footer", "Footer", "Tek satır logo, menü, sosyal medya ve telif hakkı.",
         [section([
             columns("1-2-1",
                     [B("logo", light=True, show_tagline=False, size=40)],
                     [B("nav_menu", source="footer", layout="horizontal", mobile="inline", align="center")],
                     [B("social_icons", p={"style": "round"}, align="right")], gap=24, valign="center"),
             B("copyright", style={"margin_top": 28}, show_powered=True),
         ], tone="dark", top=40, bottom=20, margin_top=48)], kind="footer")
_section("features-numbered", "Numaralı süreç (01, 02, 03)", "Özellikler", "Sıralı numaralı 4 adım veya güvence kartı.",
         [B("features", kicker="SÜRECİMİZ", title="Bağışınız nasıl ulaşıyor?", columns=2, look="numbered", items=[
             {"title": "Niyet ve Proje Seçimi", "text": "İhtiyaç duyulan alanı ve bağış tutarınızı belirlersiniz."},
             {"title": "Güvenli Ödeme ve Makbuz", "text": "3D Secure ile ödemenizi tamamlar, makbuzunuzu alırsınız."},
             {"title": "Saha Dağıtımı", "text": "Ekiplerimiz bağışınızı doğrudan hak sahiplerine ulaştırır."},
             {"title": "Fotoğraf & Video Rapor", "text": "Çalışma tamamlandığında bilgilendirme mesajı gönderilir."},
         ])])
_section("faq-two-col", "SSS (2 sütunlu açık kartlar)", "SSS & iletişim", "Açılır kapanır yerine 2 sütunda açık soru-cevap kartları.",
         [section([B("faq", title="Merak Edilenler", look="two_col", items=[
             {"question": "Bağış makbuzu nasıl alınır?", "answer": "Ödeme sonrası e-postanıza otomatik gönderilir; Bağışçı Girişi'nden de indirebilirsiniz."},
             {"question": "Zekat hangi projelere gider?", "answer": "Zekat uygun projeler işaretlidir; sadece fıkhi şartları taşıyan ihtiyaç sahiplerine ulaştırılır."},
             {"question": "Kurban kesim videosu geliyor mu?", "answer": "Evet, kesim tamamlandığında video bağlantısı SMS ile iletilir."},
             {"question": "Düzenli bağışı iptal edebilir miyim?", "answer": "Evet, panelinizden istediğiniz an tek tıkla durdurabilirsiniz."},
         ])], tone="soft")])
_section("steps-vertical", "Adımlar (dikey çizelge)", "Etki & güven", "Alt alta numaralı 4 bağış adımı.",
         [B("steps", kicker="ADIM ADIM", title="Bağış yapmak çok kolay", look="vertical")])
_section("categories-pills", "Bağış kategorileri (hap butonlar)", "Bağış", "Kompakt yatay kategori seçici butonları.",
         [B("categories", kicker="KATEGORİLER", title="Hızlı bağış türü seçin", look="pills")])
_section("banner-glass", "Cam kutulu görselli banner", "Çağrı", "Tam genişlik görsel üzerinde buzlu cam çağrı kutusu.",
         [B("banner", layout="glass", image_url="/demo/mosque.webp", kicker="RAMAZAN & ZEKAT", title="Bir iyilikle gönüllere dokunun",
            text="Fitre, zekat ve iftar bağışlarınızla binlerce sofraya bereket taşıyın.", button_label="Bağış yap", button_url="/kampanyalar")])
_section("banner-gradient", "Renk geçişli modern banner", "Çağrı", "Ana renkten vurgu rengine uzanan canlı çağrı bandı.",
         [B("banner", layout="gradient", kicker="DÜZENLİ BAĞIŞ", title="Her ay küçük bir destekle büyük değişim",
            text="Aylık düzenli bağışçı olarak yetim ve öğrenci projelerimize sürekli destek olun.", button_label="Düzenli bağışçı ol", button_url="/kampanyalar", align="center")])
_section("banner-boxed", "Kutu / Yuvarlatılmış banner", "Çağrı", "Sayfa genişliği içinde yuvarlatılmış görselli çift butonlu vitrin.",
         [B("banner", layout="boxed", image_url="/demo/relief.webp", kicker="İNSANİ YARDIM", title="Umut köprülerini birlikte kuralım",
            text="Gıda, temiz su ve sağlık destekleriyle milyonlarca insana ulaşıyoruz.", button_label="Bağış yap", button_url="/kampanyalar", button2_label="Projeleri incele", button2_url="/hakkimizda")])
_section("banner-video", "Video arka planlı banner", "Çağrı", "Arka planda sessiz döngüsel video oynatan etkileyici çağrı alanı.",
         [B("banner", layout="video", image_url="/demo/water.webp", kicker="SAHA ÇALIŞMALARI", title="İyiliğin sahadaki izini görün",
            text="Ekiplerimiz yılın 365 günü ihtiyaç bölgelerinde sahada.", button_label="Hemen destek ol", button_url="/kampanyalar", align="center")])
_section("banner-stats", "İstatistik vurgulu banner", "Çağrı", "Sol tarafta çağrı metni, sağ tarafta büyük etki rakamı kartı.",
         [B("banner", layout="stats_banner", tone="dark", kicker="2026 ETKİ RAPORU", title="Güveninizle büyüyen iyilik hareketi",
            text="Bağışlarınızın %100'ü şeffaf takip sistemiyle ihtiyaç sahiplerine ulaşır.", stat_value="120.000+", stat_label="Ulaşılan aile sayısı", button_label="Raporları incele", button_url="/hakkimizda", button2_label="Bağış yap", button2_url="/kampanyalar")])
_section("banner-minimal", "Minimal çerçeveli banner", "Çağrı", "Açık zeminli, zarif çerçeveli kurumsal duyuru bandı.",
         [B("banner", layout="minimal", tone="light", kicker="KURUMSAL DESTEK", title="Şirketinizle iyiliğe ortak olun",
            text="Kurumsal sosyal sorumluluk ve eşleşen bağış programlarımız hakkında bilgi alın.", button_label="İletişime geç", button_url="/iletisim", button2_label="Projelerimiz", button2_url="/kampanyalar")])
_section("banner-poster", "Tıklanabilir afiş (Poster)", "Çağrı", "Üzerinde metin karmaşası olmayan tam tıklanabilir kampanya afişi.",
         [B("banner", layout="poster", image_url="/demo/mosque.webp", title="Ramazan Kampanyası Afişi", button_url="/kampanyalar")])
_section("quote-dark", "Koyu bantta ayet / hadis", "Hakkımızda", "Koyu zeminli tam genişlik alıntı bandı.",
         [B("quote", text="Sadaka malı eksiltmez; aksine bereketlendirir.", source="Hadis-i Şerif", look="dark_band")])
_section("heading-badge", "Başlık: Hap rozetli & ortalı", "Metin & medya", "Üst etiketi hap rozet içinde ortalı bölüm başlığı.",
         [B("heading", look="badge", kicker="FAALİYETLERİMİZ", text="Dünyanın dört bir yanında iyilik", subtitle="Her bağışınız şeffaflık ve güvenle ihtiyaç sahiplerine ulaşır.", align="center")])
_section("heading-underline", "Başlık: Altı vurgu çizgili", "Metin & medya", "Altında kısa tema rengi vurgu çubuğu bulunan başlık.",
         [B("heading", look="underline", kicker="PROJELERİMİZ", text="Kalıcı eserlerle geleceğe umut", subtitle="Su kuyuları, eğitim merkezleri ve sağlık ocakları inşa ediyoruz.", align="center")])
_section("heading-split", "Başlık: Sağda aksiyon linkli", "Metin & medya", "Solda bölüm başlığı, sağda Tümünü Gör bağlantısı.",
         [B("heading", look="split_action", kicker="GÜNCEL", text="Öne çıkan çalışmalarımız", subtitle="Devam eden projelerimizi yakından inceleyin.", link_label="Tümünü gör", link_url="/kampanyalar")])
_section("richtext-article", "Metin: Makale (dar okuma sütunu)", "Metin & medya", "Okuma odaklı dar sütun ve büyük başlangıç harfi (drop cap).",
         [B("richtext", look="article", dropcap=True, text="## İyilikle Değişen Hayatlar\n\nHer bağış, bir çocuğun eğitimine, bir ailenin sofrasına ve bir köyün temiz suya kavuşmasına vesile olur.\n\n### Şeffaflık İlkesi\n\nTüm saha çalışmalarımız bağımsız denetim ve görsel raporlama ile desteklenir.")])
_section("richtext-columns", "Metin: 2 sütunlu dergi akışı", "Metin & medya", "Uzun metinleri iki sütuna bölen dergi/gazete düzeni.",
         [B("richtext", look="two_col", text="## Kurumsal Yaklaşımımız\n\nİnsani yardım çalışmalarımızı sürdürülebilir kalkınma hedefleriyle birleştiriyoruz.\n\n- Acil gıda ve barınma desteği\n- Kalıcı su kuyuları ve tarım projeleri\n- Yetim sponsorluğu ve eğitim bursları\n\nGönüllülerimizle birlikte dört mevsim sahadayız.")])
_section("richtext-card", "Metin: Kart içinde vurgu metni", "Metin & medya", "Beyaz gölgeli kart içinde düzenli bilgilendirme metni.",
         [B("richtext", look="card", width="narrow", text="### Bağışçı Bilgilendirme Notu\n\nOnline bağışlarınızda e-makbuzunuz anında e-posta adresinize iletilir. Havale/EFT işlemlerinde açıklama alanına kampanya adını yazmanız yeterlidir.")])
_section("image-framed", "Görsel: Çerçeveli kart", "Metin & medya", "Beyaz çerçeve, rozet ve alt yazılı fotoğraf kartı.",
         [B("image", look="framed", image_url="/demo/water.webp", badge="SAHA FOTOĞRAFI", caption="Temiz su projelerimizden bir kare", aspect="16/9", width="lg", align="center")])
_section("image-full", "Görsel: Tam genişlik (kenarsız)", "Metin & medya", "Sayfa genişliğini kenarsız kaplayan tam boy fotoğraf.",
         [B("image", look="full_bleed", image_url="/demo/mosque.webp", aspect="21/9", alt="Saha çalışması")])
_section("image-overlay", "Görsel: Üzeri yazılı vitrin", "Metin & medya", "Altında koyu gradyan üzerinde başlık ve rozet bulunan görsel.",
         [B("image", look="overlay", image_url="/demo/education.webp", badge="EĞİTİM", caption="Geleceğe umut olan eğitim sınıflarımız", aspect="16/9", width="lg", align="center")])
_section("image-text-split", "Görsel + metin: Tam kenarlı split", "Metin & medya", "Görselin kenara sıfır oturduğu, çift butonlu modern vitrin kartı.",
         [B("image_text", look="full_bleed", image_url="/demo/relief.webp", image_side="left", kicker="SAHADAN", title="İhtiyaç bölgelerine kesintisiz destek", text="Ekiplerimiz afet ve kriz bölgelerinde gıda, temiz su ve barınma yardımlarını doğrudan ulaştırıyor.", button_label="Projeleri incele", button_url="/kampanyalar", button2_label="Faaliyet raporu", button2_url="/hakkimizda")])
_section("image-text-badge", "Görsel + metin: Etki rozetli", "Metin & medya", "Görsel köşesinde yüzen etki sayısı kartı bulunan hikaye bölümü.",
         [B("image_text", look="badge_card", ratio="40/60", image_url="/demo/water.webp", image_side="right", stat_value="15.000+", stat_label="Açılan temiz su kuyusu", kicker="TEMİZ SU", title="Bir kuyu, bir köyün hayatını değiştirir", text="Kurak bölgelerde açtığımız kalıcı su kuyularıyla temiz suya erişim sağlıyoruz.", button_label="Su kuyusu bağışla", button_url="/kampanyalar")])
_section("image-text-dark", "Görsel + metin: Koyu vitrin", "Metin & medya", "Koyu tema zemin üzerinde yüksek kontrastlı hikaye ve misyon alanı.",
         [B("image_text", look="dark", image_url="/demo/orphan.webp", image_side="left", kicker="YETİM HAMİLİĞİ", title="Bir çocuğun geleceğine umut olun", text="Düzenli sponsorluk desteğiyle yetim çocukların eğitim, sağlık ve barınma ihtiyaçlarını karşılıyoruz.", button_label="Sponsor ol", button_url="/kampanyalar", button2_label="Detaylı bilgi", button2_url="/hakkimizda")])
_section("video-cinema", "Video: Koyu sinema vitrini", "Metin & medya", "Rozetli ve koyu sinematik çerçeveli video oynatıcı.",
         [B("video", look="cinema", url="https://www.youtube.com/watch?v=dQw4w9WgXcQ", badge="SAHA KAYDI", title="Sahadan Güncel Çalışmalar", width="lg")])
_section("video-split", "Video: Video + metin yan yana", "Metin & medya", "Bir yanda video, diğer yanda başlık, açıklama ve bağış butonu.",
         [B("video", look="split", url="https://www.youtube.com/watch?v=dQw4w9WgXcQ", kicker="BELGESEL", title="Bir Kuyunun Hikayesi", text="Temiz suya kavuşan köylerde hayatın nasıl değiştiğini sahadan görüntülerle izleyin.", button_label="Su kuyusu bağışla", button_url="/kampanyalar")])
_section("video-poster", "Video: Özel kapaklı hızlı oynatıcı", "Metin & medya", "Tıklanınca yüklenen kapak görselli performans dostu video.",
         [B("video", look="poster_play", url="https://www.youtube.com/watch?v=dQw4w9WgXcQ", poster_url="/demo/relief.webp", kicker="TANITIM", title="2026 İnsani Yardım Faaliyetlerimiz", width="lg")])
_section("buttons-cta", "Butonlar: Çift çağrı grubu", "Metin & medya", "Ana ve ikincil aksiyon için ortalı hap buton grubu.",
         [B("buttons", align="center", shape="pill", size="lg", items=[
             {"icon": "♥", "label": "Hemen bağış yap", "url": "/kampanyalar", "style": "gradient"},
             {"icon": "📞", "label": "Bize ulaşın", "url": "/iletisim", "style": "outline"},
         ])])
_section("buttons-pills", "Butonlar: İkonlu hızlı yönlendirme", "Metin & medya", "Yumuşak tonlu hap butonlarla hızlı sayfa geçişleri.",
         [B("buttons", align="center", shape="pill", size="md", items=[
             {"icon": "🌙", "label": "Zekat hesapla", "url": "/zekat-hesapla", "style": "soft"},
             {"icon": "🐑", "label": "Kurban hisseleri", "url": "/kampanyalar", "style": "soft"},
             {"icon": "🏦", "label": "Hesap numaraları", "url": "/hesap-numaralari", "style": "soft"},
         ])])
_section("timeline-horizontal", "Yatay tarihçe kartları", "Hakkımızda", "Yan yana dizili 5 dönem tarihçe kartları.",
         [B("timeline", kicker="YOLCULUĞUMUZ", title="Kilometre taşlarımız", look="horizontal", items=[
             {"date": "1995", "title": "Kuruluş", "text": "Gönüllü hareketi olarak başladık."},
             {"date": "2004", "title": "Su Kuyuları", "text": "Afrika'da ilk kuyular açıldı."},
             {"date": "2012", "title": "Yetim Hamiliği", "text": "Düzenli sponsorluk sistemi kuruldu."},
             {"date": "2020", "title": "Dijital Altyapı", "text": "Online bağış ve şeffaf raporlama."},
             {"date": "Bugün", "title": "27 Ülke", "text": "Binlerce gönüllüyle sahadayız."},
         ])])
_section("timeline-alternating", "Sağlı-sollu tarihçe akışı", "Hakkımızda", "Orta omurga çizgisi etrafında sağa ve sola açılan tarihçe.",
         [B("timeline", kicker="KRONOLOJİ", title="Yıllara Göre Gelişimimiz", look="alternating", items=[
             {"date": "2005", "icon": "🌱", "title": "İlk Adım", "text": "Mahalle dayanışma ağı olarak ilk yardım dağıtımlarını gerçekleştirdik."},
             {"date": "2014", "icon": "💧", "title": "Uluslararası Saha", "text": "Su kuyusu ve katarakt projeleriyle 10 ülkede kalıcı eserler açtık."},
             {"date": "2021", "icon": "📱", "title": "Dijital Şeffaflık", "text": "Bağışçı paneli ve SMS bilgilendirme sistemini devreye aldık."},
             {"date": "2026", "icon": "🌍", "title": "Küresel Etki", "text": "35 ülkede düzenli eğitim, gıda ve acil yardım ulaştırıyoruz."},
         ])])
_section("timeline-roadmap", "Proje yol haritası (durum takibi)", "Hakkımızda", "Tamamlandı, Devam Ediyor ve Planlandı durumlarıyla proje aşamaları.",
         [B("timeline", kicker="PROJE SÜRECİ", title="Su Kuyusu İnşaat Aşamaları", look="roadmap", items=[
             {"date": "1. Aşama", "status": "done", "title": "Fizibilite ve Zemin Etüdü", "text": "İhtiyaç duyulan köy belirlendi ve sondaj noktası onaylandı."},
             {"date": "2. Aşama", "status": "active", "title": "Sondaj ve Kuyu Açılışı", "text": "Derin su sondajı ve pompa montajı sahada devam ediyor."},
             {"date": "3. Aşama", "status": "upcoming", "title": "Açılış ve Video Raporu", "text": "Kuyu tabelası asılarak açılış videosu bağışçılara iletilecek."},
         ])])
_section("timeline-photo", "Görselli kuruluş hikâyesi", "Hakkımızda", "Her durakta saha fotoğrafı içeren anlatımlı tarihçe.",
         [B("timeline", kicker="HİKÂYEMİZ", title="Fotoğraflarla Yolculuğumuz", look="photo_story", items=[
             {"date": "2010", "image_url": "/demo/water.webp", "badge": "SU KUYULARI", "title": "İlk Temiz Su Kaynağı", "text": "Kurak bölgelerde açtığımız ilk kuyularla binlerce aile temiz suya kavuştu."},
             {"date": "2018", "image_url": "/demo/education.webp", "badge": "EĞİTİM", "title": "Öğrenci Yurtları ve Burslar", "text": "Yüzlerce öğrencinin eğitim masraflarını düzenli burslarla karşılamaya başladık."},
             {"date": "2025", "image_url": "/demo/food.webp", "badge": "AŞEVİ", "title": "Günlük Sıcak Yemek Sofraları", "text": "Kurduğumuz aşevlerinde her gün binlerce kişiye sıcak yemek ulaştırılıyor."},
         ])])
_section("timeline-compact", "Kompakt kronoloji listesi", "Hakkımızda", "Yılları ve kısa özetleri düzenli tablo akışında gösteren liste.",
         [B("timeline", kicker="ÖZET TARİHÇE", title="Önemli Dönüm Noktaları", look="compact", items=[
             {"date": "2008", "title": "Vakıf Resmi Kuruluşu", "text": "Resmi senedin tescili ve ilk genel kurul."},
             {"date": "2015", "title": "Yetim Destek Merkezi", "text": "500 yetim çocuğun düzenli eğitim ve barınma desteği."},
             {"date": "2023", "title": "Afet Koordinasyon Ağı", "text": "7/24 sahaya intikal eden mobil aşevi filosu."},
         ])])
_section("countdown-cards", "Geri sayım (ayrı kutular)", "Çağrı", "Beyaz gün-saat-dakika kutularıyla kampanya sayacı.",
         [B("countdown", kicker="YAKLAŞIYOR", title="Ramazan kampanyasına kalan süre", target="2027-02-08T00:00:00+03:00",
            button_label="Şimdi hazırlan", button_url="/kampanyalar", look="cards", tone="soft")])
_section("bank-compact", "Kompakt IBAN listesi", "Bağış", "Tek satırlı kopyalanabilir IBAN listesi.",
         [B("bank_accounts", kicker="BANKA HESAPLARI", title="Hızlı IBAN listesi", look="compact", items=[
             {"bank": "Vakıf Katılım", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 00", "currency": "TRY"},
             {"bank": "Kuveyt Türk", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 01", "currency": "TRY"},
             {"bank": "Ziraat Katılım", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 02", "currency": "USD"},
         ])])

# --- Sections built with the newer blocks ---------------------------------------------------

_section("features-work", "Çalışma alanları (6 kart)", "Özellikler", "Altı ikonlu kartta faaliyet alanları.",
         [section([B("features", kicker="NELER YAPIYORUZ", title="Çalışma alanlarımız", columns=3, look="card", items=[
             {"icon": "💧", "title": "Su kuyusu", "text": "Kurak bölgelerde kalıcı temiz su kaynakları açıyoruz."},
             {"icon": "📚", "title": "Eğitim", "text": "Burs, kırtasiye ve yatılı eğitim desteği veriyoruz."},
             {"icon": "🍲", "title": "Gıda", "text": "Aşevi, kumanya ve iftar sofralarıyla sofraları paylaşıyoruz."},
             {"icon": "🧒", "title": "Yetim", "text": "Yetim çocukların bakım ve eğitimini üstleniyoruz."},
             {"icon": "🏥", "title": "Sağlık", "text": "İlaç, tedavi ve katarakt ameliyatı desteği sağlıyoruz."},
             {"icon": "🚑", "title": "Acil yardım", "text": "Afetlerde ilk günden itibaren sahadayız."},
         ])], tone="soft")])
_section("features-why", "Neden biz? (simge solda)", "Özellikler", "Dört güvence maddesi, simgeler solda.",
         [B("features", kicker="NEDEN BİZ", title="Bağışınız emin ellerde", columns=2, look="icon_left", align="left", items=[
             {"icon": "🧾", "title": "Resmi makbuz", "text": "Her bağış için anında makbuz ve e-posta bildirimi."},
             {"icon": "🔍", "title": "Bağımsız denetim", "text": "Hesaplarımız her yıl bağımsız denetimden geçer."},
             {"icon": "🎥", "title": "Görüntülü bilgilendirme", "text": "Kurban ve kuyu bağışlarında video ve fotoğraf gönderilir."},
             {"icon": "🤲", "title": "Vekalet hassasiyeti", "text": "Zekat ve fitre, şartlarına uygun kişilere ulaştırılır."},
         ])])
_section("features-use", "Bağışınız nereye gidiyor?", "Özellikler", "Üç sade madde.",
         [B("features", kicker="ŞEFFAFLIK", title="Bağışınız nereye gidiyor?", columns=3, look="bordered", items=[
             {"icon": "🎯", "title": "%92 projeye", "text": "Bağışların büyük bölümü doğrudan sahaya aktarılır."},
             {"icon": "🚚", "title": "%5 lojistik", "text": "Nakliye, depolama ve dağıtım giderleri."},
             {"icon": "🏢", "title": "%3 yönetim", "text": "Kurumsal giderler ayrı bağışlarla karşılanır."},
         ])])
_section("tabs-activities", "Faaliyet sekmeleri", "Özellikler", "Görselli üç sekme: su, eğitim, gıda.",
         [B("tabs", title="Faaliyetlerimizi keşfedin", look="tabs", items=[
             {"label": "Su", "title": "Kalıcı su kaynakları", "image_url": "/demo/water.webp",
              "text": "Açtığımız her kuyu ortalama **400 kişiye** temiz su sağlıyor.\n\n- Sondaj ve el pompalı kuyular\n- Su deposu ve çeşmeler\n- Bakım ve onarım ekipleri", "button_label": "Kuyu açtır", "button_url": "/kampanyalar"},
             {"label": "Eğitim", "title": "Okusun diye", "image_url": "/demo/education.webp",
              "text": "Burs, yurt ve kırtasiye desteğiyle öğrencilerin yanındayız.\n\n- Aylık burs\n- Yatılı Kur'an kursları\n- Yaz okulları", "button_label": "Burs ver", "button_url": "/kampanyalar"},
             {"label": "Gıda", "title": "Paylaşılan sofralar", "image_url": "/demo/food.webp",
              "text": "Aşevlerimizde her gün sıcak yemek çıkıyor.\n\n- Günlük sıcak yemek\n- Ramazan kolileri\n- Kurban eti dağıtımı", "button_label": "Sofraya ortak ol", "button_url": "/kampanyalar"},
         ])])
_section("tabs-accordion", "Bilgi akordeonu", "Özellikler", "Açılır-kapanır bilgi başlıkları.",
         [B("tabs", title="Merak edilenler", look="accordion", items=[
             {"label": "Zekat kimlere verilir?", "text": "Zekat; fakir, miskin, borçlu ve yolda kalmış kişilere verilir. Zekat bağışları yalnızca bu şartları taşıyanlara ulaştırılır."},
             {"label": "Kurban vekaleti nasıl verilir?", "text": "Bağış sırasında işaretlediğiniz onay kutusu vekalet yerine geçer; dilerseniz telefonla da vekalet verebilirsiniz."},
             {"label": "Bağışım vergiden düşer mi?", "text": "Kamu yararına çalışan dernek statüsündeki bağışlar için makbuzunuzu mali müşavirinize iletebilirsiniz."},
         ])])
_section("tabs-vertical", "Solda sekmeli faaliyetler", "Özellikler", "Sol dikey menüden seçilen görselli faaliyet sekmeleri.",
         [B("tabs", kicker="HİZMET ALANLARIMIZ", title="Çalışma Modellerimiz", look="vertical", image_side="right", items=[
             {"icon": "💧", "label": "Su Kuyuları", "title": "Kalıcı Temiz Su Kaynakları", "image_url": "/demo/water.webp", "text": "Kurak bölgelerde sondaj ve şadırvanlı su kuyuları inşa ediyoruz.", "button_label": "Kuyu Açtır", "button_url": "/kampanyalar"},
             {"icon": "📚", "label": "Eğitim & Burs", "title": "Öğrenci Bursları ve Yurtlar", "image_url": "/demo/education.webp", "text": "İlköğretimden üniversiteye kadar düzenli eğitim desteği sağlıyoruz.", "button_label": "Burs Ver", "button_url": "/kampanyalar"},
             {"icon": "🍲", "label": "Aşevi & Gıda", "title": "Günlük Sıcak Yemek Sofraları", "image_url": "/demo/food.webp", "text": "İhtiyaç sahiplerine her gün sıcak yemek ve erzak kolisi ulaştırıyoruz.", "button_label": "Destek Ol", "button_url": "/kampanyalar"},
         ])])
_section("tabs-underline", "Altı çizgili kartlı sekmeler", "Özellikler", "Altı çizgili modern sekme çubuğu ve içerik paneli.",
         [B("tabs", kicker="ŞEFFAFLIK", title="Nasıl Denetleniyoruz?", look="underline", items=[
             {"icon": "🔍", "label": "Mali Denetim", "title": "Bağımsız Mali Denetim", "text": "Tüm gelir ve gider tablolarımız yıllık olarak bağımsız denetim kuruluşlarınca incelenir."},
             {"icon": "🎥", "label": "Saha Raporu", "title": "Video & Fotoğraf Geri Bildirimi", "text": "Kurban ve su kuyusu projelerinizde kişiye özel saha görüntüleri paylaşılır."},
             {"icon": "🧾", "label": "Resmi Makbuz", "title": "Anında Dijital Makbuz", "text": "Ödeme sonrası SMS ve e-posta ile resmi bağış belgeniz tarafınıza iletilir."},
         ])])
_section("tabs-steps", "Numaralı süreç sekmeleri", "Özellikler", "01, 02, 03 adımlarıyla etkileşimli süreç sekmeleri.",
         [B("tabs", kicker="BAĞIŞ SÜRECİ", title="Bir Su Kuyusu Nasıl Açılır?", look="numbered_steps", items=[
             {"label": "Talep & Niyet", "badge": "1. Gün", "title": "Kuyu Bölgesi ve Niyetinizi Belirleyin", "image_url": "/demo/water.webp", "text": "İhtiyaç haritamızdan bölgeyi seçip tabela ismini belirleyin."},
             {"label": "Sondaj & İnşaat", "badge": "2-4 Hafta", "title": "Zemin Etüdü ve Sondaj Çalışması", "text": "Yerel mühendis ekiplerimiz temiz su tabakasına ulaşana kadar sondaj yapar."},
             {"label": "Açılış & Video", "badge": "Teslim", "title": "GPS Konumu ve Açılış Videosu", "text": "Kuyu açılışı gerçekleştirilir ve video raporu telefonunuza gönderilir."},
         ])])
_section("timeline-history", "Tarihçe", "Hakkımızda", "Kuruluştan bugüne beş durak.",
         [B("timeline", kicker="TARİHÇEMİZ", title="Dünden bugüne", items=[
             {"date": "1995", "title": "Kuruluş", "text": "Bir avuç gönüllüyle mahalle yardımlaşması olarak yola çıktık."},
             {"date": "2004", "title": "İlk su kuyusu", "text": "Afrika'da ilk kuyumuzu açtık; bugün sayı binleri aştı."},
             {"date": "2012", "title": "Yetim sponsorluğu", "text": "Düzenli sponsorluk sistemiyle yetimlere aylık destek başladı."},
             {"date": "2020", "title": "Dijital bağış", "text": "Online bağış, makbuz ve raporlama altyapımız yenilendi."},
             {"date": "Bugün", "title": "27 ülkede", "text": "Binlerce gönüllü ve bağışçıyla çalışmalarımız sürüyor."},
         ])])
_section("team-board", "Yönetim kurulu", "Hakkımızda", "Dört kişilik ekip kartları (fotoğrafları siz ekleyin).",
         [B("team", kicker="EKİBİMİZ", title="Yönetim kurulu", columns=4, shape="round", items=[
             {"name": "Ahmet Yılmaz", "role": "Başkan"}, {"name": "Ömer Demir", "role": "Başkan Yardımcısı"},
             {"name": "Mehmet Kaya", "role": "Genel Sekreter"}, {"name": "Yusuf Arslan", "role": "Sayman"},
         ])])
_section("team-lead", "Başkan vurgulu + Yönetim kurulu", "Hakkımızda", "İlk üye üstte büyük vitrin kartında, diğer üyeler altta grid olarak gösterilir.",
         [B("team", kicker="YÖNETİM", title="Yönetim Kurulumuz", look="featured_lead", columns=3, shape="round", items=[
             {"badge": "Yönetim Kurulu Başkanı", "name": "Ahmet Yılmaz", "role": "Başkan", "text": "20 yılı aşkın sivil toplum tecrübesiyle insani yardım ve eğitim projelerine öncülük etmektedir."},
             {"name": "Ömer Demir", "role": "Başkan Yardımcısı", "text": "Saha operasyonları ve uluslararası partnerlik koordinasyonu."},
             {"name": "Mehmet Kaya", "role": "Genel Sekreter", "text": "Kurumsal yönetim, mevzuat ve şeffaflık süreçleri."},
             {"name": "Yusuf Arslan", "role": "Sayman", "text": "Mali işler, bütçe planlama ve bağımsız denetim takibi."},
         ])])
_section("team-portrait", "Tam boy portre ekip kartları", "Hakkımızda", "Dikey 3:4 tam boy portre fotoğraflı modern ekip vitrini.",
         [B("team", kicker="SAHA EKİBİ", title="Projelerimizin Arkasındaki Ekip", look="portrait_overlay", columns=4, items=[
             {"badge": "Koordinasyon", "name": "Zeynep Aydın", "role": "Saha Direktörü"},
             {"badge": "Eğitim", "name": "Mustafa Çelik", "role": "Burs & Yetim Koordinatörü"},
             {"badge": "Su & Sağlık", "name": "Fatma Şahin", "role": "Proje Uzmanı"},
             {"badge": "İletişim", "name": "Ali Koç", "role": "Bağışçı İlişkileri"},
         ])])
_section("team-detailed", "Danışma kurulu (detaylı liste)", "Hakkımızda", "Büyük portre ve detaylı özgeçmiş içeren iki sütunlu kurul listesi.",
         [B("team", kicker="DANIŞMA KURULU", title="Akademik ve İslami Danışma Kurulu", look="detailed_list", columns=2, shape="square", items=[
             {"badge": "Mütevelli Heyeti", "name": "Prof. Dr. İbrahim Yıldız", "role": "Kurul Başkanı", "text": "İslam hukuku ve vakıf yönetimi alanında çalışmalar yürütmekte; zekât ve sadaka fonlarının fıkhi uygunluğunu denetlemektedir."},
             {"badge": "Danışma Kurulu", "name": "Dr. Ayşe Karaca", "role": "Sosyal Politikalar Uzmanı", "text": "Yetim koruma programları ve sürdürülebilir kalkınma projelerinde danışmanlık yapmaktadır."},
         ])])
_section("team-compact", "Kompakt ekip / komisyon listesi", "Hakkımızda", "Kalabalık ekipler ve komisyonlar için yatay kompakt kartlar.",
         [B("team", kicker="KOMİSYONLAR", title="Çalışma Komisyonlarımız", look="compact", columns=3, shape="round", items=[
             {"name": "Hasan Tunç", "role": "Acil Yardım Sorumlusu", "text": "Afet ve kriz bölgesi ilk müdahale ekibi."},
             {"name": "Elif Aksoy", "role": "Gönüllü Koordinatörü", "text": "Üniversite ve şehir temsilcilikleri yönetimi."},
             {"name": "Emre Polat", "role": "Lojistik & Depo", "text": "Ayni yardım ve gıda kolisi sevkiyat planlaması."},
         ])])
_section("quote-verse", "Ayet / hadis (ortalı)", "Hakkımızda", "Büyük, ortalı alıntı.",
         [section([B("quote", text="Sevdiğiniz şeylerden Allah yolunda harcamadıkça iyiliğe asla erişemezsiniz.", source="Âl-i İmrân, 92", look="centered")], tone="soft")])
_section("quote-card", "Söz kartı", "Hakkımızda", "Kart içinde alıntı.",
         [B("quote", text="İnsanların en hayırlısı, insanlara en faydalı olandır.", source="Hadis-i Şerif", look="card")])
_section("quote-arabic", "Ayet / hadis (Arapça + Meal)", "Hakkımızda", "Üstte Arapça metni, altta Türkçe meali ve kaynağı olan ayet kartı.",
         [B("quote", kicker="AYET-İ KERİME", arabic_text="مَّثَلُ الَّذِينَ يُنفِقُونَ أَمْوَالَهُمْ فِي سَبِيلِ اللَّهِ كَمَثَلِ حَبَّةٍ أَنبَتَتْ سَبْعَ سَنَابِلَ", text="Mallarını Allah yolunda harcayanların durumu, yedi başak bitiren ve her başağında yüz dane bulunan bir tohum gibidir.", source="Bakara Suresi, 261", look="verse_arabic")])
_section("quote-portrait", "Başkan / kurucu sözü (portreli)", "Hakkımızda", "Fotoğraflı kurucu veya başkan mesajı kartı.",
         [B("quote", kicker="BAŞKANIN MESAJI", text="İyiliği sadece bir yardım değil, gönüller arasında kurulan kalıcı bir kardeşlik köprüsü olarak görüyoruz.", source="Ahmet Yılmaz", source_role="Yönetim Kurulu Başkanı", look="portrait_quote")])
_section("quote-ornate", "Süslemeli ayet / hadis kartı", "Hakkımızda", "Çift çerçeveli klasik editorial alıntı kartı.",
         [B("quote", kicker="HADİS-İ ŞERİF", text="Komşusu açken tok yatan bizden değildir.", source="Hâkim, Müstedrek", look="ornate_frame")])
_section("quote-side", "Yan çizgili editorial alıntı", "Hakkımızda", "Sol vurgu çizgili sade alıntı.",
         [B("quote", kicker="VİZYONUMUZ", text="Her çocuğun temiz suya, eğitime ve güvenli bir geleceğe ulaşması için çalışıyoruz.", source="Kurumsal İlke", look="side")])
_section("gallery-grid", "Görsel galerisi (ızgara)", "Hakkımızda", "Kare ızgara; tıklanınca büyür. Görselleri kendinizinkilerle değiştirin.",
         [B("image_gallery", kicker="SAHADAN", title="Fotoğraflarla çalışmalarımız", columns=4, aspect="1/1", items=[
             {"image_url": f"/demo/{name}.webp", "caption": caption} for name, caption in (
                 ("water", "Su kuyusu açılışı"), ("education", "Burs töreni"), ("food", "Aşevi"), ("orphan", "Yetim buluşması"),
                 ("kurban", "Kurban organizasyonu"), ("winter", "Kış yardımı"), ("relief", "Koli dağıtımı"), ("community", "Gönüllülerimiz"))])])
_section("gallery-masonry", "Görsel galerisi (karışık)", "Hakkımızda", "Orijinal oranlarıyla üç sütun.",
         [B("image_gallery", title="Galeri", columns=3, aspect="masonry", gap=16, items=[
             {"image_url": f"/demo/{name}.webp"} for name in ("mosque", "quran", "hands", "ramadan", "water", "kurban")])])
_section("gallery-bento", "Görsel galerisi (Bento vitrin)", "Hakkımızda", "İlk görseli büyük tutan asimetrik Bento galeri.",
         [B("image_gallery", kicker="SAHA VİTRİNİ", title="Öne Çıkan Kareler", layout="bento", gap=12, caption_mode="always", items=[
             {"image_url": "/demo/water.webp", "caption": "Temiz su kuyuları"},
             {"image_url": "/demo/education.webp", "caption": "Eğitim desteği"},
             {"image_url": "/demo/food.webp", "caption": "Aşevi sofraları"},
             {"image_url": "/demo/orphan.webp", "caption": "Yetim buluşmaları"},
             {"image_url": "/demo/kurban.webp", "caption": "Kurban organizasyonu"},
         ])])
_section("gallery-filterable", "Görsel galerisi (kategorili)", "Hakkımızda", "Kategori sekmeleriyle filtrelenebilen fotoğraf galerisi.",
         [B("image_gallery", kicker="ARŞİV", title="Faaliyet Alanlarına Göre Fotoğraflar", layout="filterable", columns=3, aspect="4/3", caption_mode="below", items=[
             {"image_url": "/demo/water.webp", "category": "Su Kuyusu", "caption": "Afrika temiz su açılışı"},
             {"image_url": "/demo/education.webp", "category": "Eğitim", "caption": "Öğrenci burs ve kırtasiye dağıtımı"},
             {"image_url": "/demo/food.webp", "category": "Gıda", "caption": "Günlük sıcak yemek dağıtımı"},
             {"image_url": "/demo/orphan.webp", "category": "Yetim", "caption": "Yetim eğitim merkezi"},
             {"image_url": "/demo/kurban.webp", "category": "Kurban", "caption": "Vekaletle kurban kesimi"},
             {"image_url": "/demo/winter.webp", "category": "Acil Yardım", "caption": "Kışlık giysi ve battaniye"},
         ])])
_section("gallery-spotlight", "Görsel galerisi (büyük vitrin + şerit)", "Hakkımızda", "Üstte büyük önizleme, altta tıklanabilir küçük fotoğraf şeridi.",
         [B("image_gallery", kicker="ALBÜM", title="Sahadan Hikâyeler", layout="spotlight", caption_mode="always", items=[
             {"image_url": "/demo/hands.webp", "caption": "Dayanışma ve kardeşlik"},
             {"image_url": "/demo/water.webp", "caption": "Su kuyusu açılış töreni"},
             {"image_url": "/demo/education.webp", "caption": "Medrese ve okul desteği"},
             {"image_url": "/demo/ramadan.webp", "caption": "Ramazan iftar sofraları"},
         ])])

_section("counters-plain", "Animasyonlu sayaçlar", "Etki & güven", "Ekrana gelince sıfırdan sayan dört rakam.",
         [B("counters", kicker="RAKAMLARLA", title="Birlikte başardıklarımız", look="plain", items=[
             {"icon": "💧", "value": 1250, "suffix": "+", "label": "Açılan su kuyusu"}, {"icon": "🎓", "value": 38000, "label": "Burslu öğrenci"},
             {"icon": "🧒", "value": 4600, "label": "Sponsorlu yetim"}, {"icon": "🌍", "value": 27, "label": "Ülke"}])])
_section("counters-band", "Sayaç bandı (renkli)", "Etki & güven", "Ana renkte tam genişlik sayaç bandı.",
         [B("counters", look="band", items=[
             {"value": 25, "suffix": " yıl", "label": "Tecrübe"}, {"value": 120000, "suffix": "+", "label": "Bağışçı"},
             {"value": 850, "label": "Gönüllü"}, {"value": 96, "prefix": "%", "label": "Memnuniyet"}])])
_section("counters-cards", "Sayaç kartları", "Etki & güven", "Açık zeminde kart kart sayaçlar.",
         [section([B("counters", title="Bu yıl", look="cards", items=[
             {"icon": "📦", "value": 18400, "label": "Gıda kolisi"}, {"icon": "🐑", "value": 6200, "label": "Kurban hissesi"}, {"icon": "🍲", "value": 410000, "label": "Kap sıcak yemek"}])], tone="soft")])
_section("counters-divided", "Ayırıcılı kurumsal sayaç şeridi", "Etki & güven", "Aralarında ince dikey çizgiler bulunan sade KPI şeridi.",
         [B("counters", kicker="YILLIK ETKİ", title="Rakamlarla Güven ve Şeffaflık", look="divided", items=[
             {"value": 1420, "suffix": "+", "label": "Açılan Su Kuyusu", "trend": "+%22 artış", "note": "2026 yılı"},
             {"value": 38500, "label": "Burslu Öğrenci", "note": "Aktif destek"},
             {"value": 27, "label": "Faaliyet Ülkesi", "note": "4 kıtada"},
             {"value": 98, "prefix": "%", "label": "Bağışçı Memnuniyeti", "trend": "Denetimli"},
         ])])
_section("counters-split", "Sol metin + sağ 2x2 istatistik", "Etki & güven", "Solda başlık ve rapor butonu, sağda 2x2 etki kartları.",
         [B("counters", kicker="ŞEFFAF RAPORLAMA", title="Her Kuruşun İzini Sürüyoruz", text="Sahada gerçekleştirdiğimiz tüm projeler bağımsız denetim ve video geri bildirim sistemiyle kayıt altındadır.", look="split", button_label="Faaliyet Raporunu İncele", button_url="/hakkimizda", items=[
             {"icon": "💧", "value": 1250, "suffix": "+", "label": "Su Kuyusu", "note": "Temiz suya erişim"},
             {"icon": "🧒", "value": 4600, "label": "Yetim Hamiliği", "note": "Aylık düzenli destek"},
             {"icon": "🍲", "value": 410, "suffix": "K", "label": "Sıcak Yemek", "note": "Günlük aşevi"},
             {"icon": "🏥", "value": 8900, "label": "Katarakt Ameliyatı", "note": "Sağlık projeleri"},
         ])])
_section("counters-dark", "Koyu zemin etki kartları", "Etki & güven", "Koyu kart tasarımıyla öne çıkan etki rakamları.",
         [B("counters", kicker="KÜRESEL ETKİ", title="Birlikte Büyüyen İyilik", look="dark_cards", items=[
             {"icon": "🌍", "value": 35, "label": "Ülkede Aktif Saha", "trend": "7/24 Koordinasyon"},
             {"icon": "🤝", "value": 145000, "suffix": "+", "label": "Kayıtlı Bağışçı", "trend": "+%18 bu yıl"},
             {"icon": "📦", "value": 92000, "label": "Ulaştırılan Koli", "note": "Ramazan & Acil Yardım"},
         ])])
_section("counters-rings", "Dairesel oran halkaları (%)", "Etki & güven", "Yüzdelik oranları SVG dairesel ilerleme halkasıyla gösterir.",
         [B("counters", kicker="MALİ ŞEFFAFLIK", title="Bağışlarınız Nasıl Değerlendiriliyor?", look="rings", items=[
             {"value": 92, "suffix": "%", "label": "Doğrudan Sahaya", "note": "Proje ve yardım harcaması"},
             {"value": 5, "suffix": "%", "label": "Lojistik & Sevkiyat", "note": "Depo ve nakliye"},
             {"value": 3, "suffix": "%", "label": "Kurumsal Yönetim", "note": "Ayrı bağışlarla karşılanır"},
         ])])
_section("progress-targets", "Hedef çubukları", "Etki & güven", "Proje hedeflerine ne kadar yaklaşıldığını gösterir.",
         [B("progress_bars", kicker="HEDEFLERİMİZ", title="2027 hedeflerinde neredeyiz?", items=[
             {"label": "100 yeni su kuyusu", "percent": 64, "note": "64 / 100 kuyu"}, {"label": "5.000 kışlık koli", "percent": 82, "note": "4.100 / 5.000 koli"},
             {"label": "1.000 yeni yetim sponsoru", "percent": 37, "note": "370 / 1.000"}])])
_section("progress-cards", "Kartlı proje hedefleri", "Etki & güven", "Üç sütunlu kartlarda simgeli ve linkli hedef takibi.",
         [B("progress_bars", kicker="KAMPANYA HEDEFLERİ", title="Aktif Projelerimizde Son Durum", look="cards", columns=3, items=[
             {"icon": "💧", "badge": "Öncelikli", "label": "Afrika Su Kuyusu Fonu", "percent": 76, "note": "76 / 100 Kuyu", "url": "/kampanyalar", "link_label": "Destek Ol"},
             {"icon": "📦", "label": "Ramazan Kumanya Kolisi", "percent": 88, "note": "4.400 / 5.000 Koli", "url": "/kampanyalar", "link_label": "Destek Ol"},
             {"icon": "🧒", "label": "Yetim Eğitim Sponsorluğu", "percent": 54, "note": "540 / 1.000 Öğrenci", "url": "/kampanyalar", "link_label": "Sponsor Ol"},
         ])])
_section("progress-split", "Sol özet + sağ hedef çubukları", "Etki & güven", "Solda açıklama ve buton, sağda proje ilerleme çubukları.",
         [B("progress_bars", kicker="YILLIK PLAN", title="2027 Hedeflerimize Birlikte Ulaşıyoruz", text="Her bağış sahadaki somut bir hedefi tamamlar; gerçekleşme oranlarını anlık olarak paylaşıyoruz.", look="split", button_label="Tüm Kampanyaları Gör", button_url="/kampanyalar", items=[
             {"icon": "🏥", "label": "Katarakt Ameliyatı Hedefi", "percent": 68, "note": "680 / 1.000 Ameliyat"},
             {"icon": "📚", "label": "Öğrenci Bursu Fonu", "percent": 81, "note": "810 / 1.000 Burs"},
             {"icon": "🍲", "label": "Aşevi Günlük Sıcak Yemek", "percent": 92, "note": "%92 Tamamlandı"},
         ])])
_section("progress-radial", "Dairesel hedef halkaları (%)", "Etki & güven", "Hedef yüzdelerini dairesel SVG halkalarla gösterir.",
         [B("progress_bars", kicker="GERÇEKLEŞME ORANI", title="Proje Tamamlanma Durumları", look="radial", columns=3, items=[
             {"icon": "💧", "badge": "Sahada", "label": "Su Kuyusu Projeleri", "percent": 84, "note": "84 / 100 Kuyu Açıldı"},
             {"icon": "🎓", "label": "Hafızlık & Eğitim Desteği", "percent": 72, "note": "360 / 500 Öğrenci"},
             {"icon": "🚑", "label": "Acil Yardım Fonu", "percent": 95, "note": "Hedefe Çok Yakın"},
         ])])
_section("progress-dark", "Koyu zemin hedef kartları", "Etki & güven", "Koyu arka planlı modern ilerleme kartları.",
         [B("progress_bars", kicker="HEDEFLERİMİZ", title="Dönem Projeleri İlerleme Durumu", look="dark_cards", columns=3, items=[
             {"icon": "🌍", "badge": "Aktif", "label": "Temiz Su Erişimi", "percent": 78, "note": "%78 Tamamlandı"},
             {"icon": "🍲", "label": "Sıcak Yemek Dağıtımı", "percent": 90, "note": "%90 Tamamlandı"},
             {"icon": "🏠", "label": "Briket Ev İnşası", "percent": 62, "note": "62 / 100 Konut"},
         ])])
_section("logos-partners", "İş ortakları şeridi", "Etki & güven", "Kendiliğinden kayan kurum adları/logoları.",
         [B("logos", title="Birlikte çalıştığımız kurumlar", marquee=True, grayscale=True, items=[
             {"name": "Belediye"}, {"name": "Kızılay"}, {"name": "AFAD"}, {"name": "Müftülük"}, {"name": "Üniversite"}, {"name": "Ticaret Odası"}])])
_section("logos-cards", "Kutulu partner logoları", "Etki & güven", "Dört sütunlu beyaz kutularda iş ortakları.",
         [B("logos", kicker="İŞ BİRLİKLERİMİZ", title="Çözüm Ortaklarımız ve Destekçilerimiz", look="cards", columns=4, items=[
             {"name": "Vakıf Katılım", "badge": "Finans Partneri"}, {"name": "Kızılay", "badge": "Saha İş Birliği"},
             {"name": "AFAD", "badge": "Acil Yardım"}, {"name": "TİKA", "badge": "Uluslararası Proje"},
         ])])
_section("logos-divided", "Çizgili logo matrisi", "Etki & güven", "Aralarında ince çizgiler bulunan kurumsal logo tablosu.",
         [B("logos", kicker="KURUMSAL AĞ", title="Güvenilir Kurumlarla El Ele", look="divided", columns=3, items=[
             {"name": "Belediyeler"}, {"name": "Üniversiteler"}, {"name": "Sivil Toplum"},
             {"name": "Bağımsız Denetim"}, {"name": "Katılım Bankaları"}, {"name": "Lojistik Ağlar"},
         ])])
_section("logos-split", "Sol tanıtım + sağ logolar", "Etki & güven", "Solda iş birliği çağrısı, sağda 2x3 logo kutuları.",
         [B("logos", kicker="KURUMSAL DESTEK", title="İyilikte Güç Birliği Yapıyoruz", text="Kurumsal sosyal sorumluluk projelerinizde saha tecrübemizle yanınızdayız.", look="split", columns=3, button_label="İş Birliği Teklifi Al", button_url="/iletisim", items=[
             {"name": "Anadolu Vakfı"}, {"name": "Eğitim Gönüllüleri"}, {"name": "Sağlık Platformu"},
             {"name": "Temiz Su Ağı"}, {"name": "Gençlik Meclisi"}, {"name": "Şeffaflık Derneği"},
         ])])
_section("logos-dark", "Koyu zemin logo bandı", "Etki & güven", "Koyu kurumsal arka plan üzerinde partner logoları.",
         [B("logos", kicker="DESTEKÇİLERİMİZ", title="Küresel İnsani Yardım Ağı", look="dark_band", columns=4, items=[
             {"name": "AFAD"}, {"name": "Kızılay"}, {"name": "TİKA"}, {"name": "YTB"},
         ])])
_section("steps", "Nasıl bağış yapılır?", "Etki & güven", "Dört adımda bağış süreci.", [B("steps", kicker="KOLAYCA", title="Dört adımda bağış")])
_section("steps-channels", "Bağış yöntemleri / kanalları", "Etki & güven", "Online kart, Havale/EFT, SMS ve düzenli bağış kanalları.",
         [B("steps", kicker="BAĞIŞ KANALLARI", title="Size En Uygun Yöntemle Bağış Yapın", text="Tüm kanallarımızda resmi makbuz ve anlık SMS bilgilendirmesi sağlanır.", look="channels", items=[
             {"icon": "💳", "badge": "En Hızlı", "title": "Online Kredi / Banka Kartı", "text": "3D Secure güvencesiyle saniyeler içinde güvenli ödeme.", "url": "/kampanyalar", "link_label": "Online Bağış Yap"},
             {"icon": "🏦", "badge": "Komisyonsuz", "title": "Havale / EFT (IBAN)", "text": "Katılım bankaları hesaplarımıza açıklama yazarak gönderin.", "url": "/hesap-numaralari", "link_label": "IBAN Numaralarını Gör"},
             {"icon": "📱", "title": "SMS ile Destek", "text": "Tek mesajla acil yardım ve kumanya kampanyalarına katılın.", "url": "/kampanyalar", "link_label": "Kampanyaları İncele"},
             {"icon": "🔁", "badge": "Düzenli İyilik", "title": "Aylık Düzenli Bağış", "text": "Yetim sponsorluğu veya aylık destek talimatı verin.", "url": "/kampanyalar", "link_label": "Talimat Oluştur"},
         ])])
_section("steps-split", "Sol tanıtım + sağ adımlar (Split)", "Etki & güven", "Solda açıklama ve buton, sağda numaralı bağış adımları.",
         [B("steps", kicker="NASIL ÇALIŞIR?", title="Bağışınız 4 Adımda İhtiyaç Sahibine Ulaşır", text="Şeffaf bağış sürecimiz sayesinde her aşamadan haberdar olursunuz.", look="split", image_url="/demo/hands.webp", button_label="Hemen Bağış Yap", button_url="/kampanyalar", items=[
             {"badge": "1. Adım", "title": "Kampanyanızı Seçin", "text": "Su kuyusu, yetim, eğitim veya acil yardım projelerinden birini belirleyin."},
             {"badge": "2. Adım", "title": "Tutar ve Niyetinizi Girin", "text": "Bağış tutarını ve dilerseniz vekalet/hisse bilgilerinizi ekleyin."},
             {"badge": "3. Adım", "title": "Güvenli Ödeme Yapın", "text": "3D Secure kart ödemesi veya IBAN havalesiyle işleminizi tamamlayın."},
             {"badge": "4. Adım", "title": "Makbuz & Video Alın", "text": "Makbuzunuz anında SMS ile, saha videonuz proje tamamlanınca gönderilir."},
         ])])
_section("steps-dark", "Koyu zemin bağış adımları", "Etki & güven", "Koyu kart tasarımıyla öne çıkan 4 adımlı bağış rehberi.",
         [B("steps", kicker="ADIM ADIM İYİLİK", title="Güvenli ve Hızlı Bağış Süreci", look="dark_cards", button_label="Kampanyalara Git", button_url="/kampanyalar")])
_section("testimonials-block", "Teşekkür mesajları (kaydırmalı)", "Etki & güven", "Bağışçı mesajları karuseli.",
         [B("testimonials", kicker="SİZDEN GELENLER", title="Bağışçılarımız anlatıyor", items=[
             {"quote": "Kurban videom aynı gün geldi, gözlerim doldu. Allah razı olsun.", "name": "Hasan T.", "role": "İstanbul"},
             {"quote": "Yıllardır düzenli bağış yapıyorum; her kuruşun raporunu görüyorum.", "name": "Mustafa E.", "role": "Konya"},
             {"quote": "Açtırdığımız kuyunun fotoğraflarını çocuklarımla izledik.", "name": "İbrahim S.", "role": "Almanya"},
         ])])
_section("testimonials-rated", "Yıldızlı & rozetli bağışçı yorumları", "Etki & güven", "Genel memnuniyet puanı ve kampanya rozetli doğrulanmış yorumlar.",
         [B("testimonials", kicker="BAĞIŞÇI MEMNUNİYETİ", title="Binlerce Bağışçımızın Güveniyle", summary_badge="4.9 / 5 · 1.400+ Doğrulanmış Bağışçı", look="grid", items=[
             {"rating": 5, "badge": "Kurban Bağışı", "quote": "Kesim videosu ve makbuz aynı gün SMS ile geldi. Gönül rahatlığıyla vekalet veriyoruz.", "name": "Mehmet K.", "role": "Ankara", "date": "2026"},
             {"rating": 5, "badge": "Su Kuyusu", "quote": "Ailemiz adına açılan kuyunun GPS konumunu ve açılış görüntülerini izledik.", "name": "Fatma A.", "role": "Bursa", "date": "2026"},
             {"rating": 5, "badge": "Yetim Hamiliği", "quote": "Her ay düzenli burs desteğimizin eğitim raporunu panelden takip ediyoruz.", "name": "Yusuf B.", "role": "Rotterdam", "date": "2026"},
         ])])
_section("testimonials-featured", "Öne çıkan + kompakt teşekkür kartları", "Etki & güven", "Solda büyük öne çıkan mesaj, sağda 4 kompakt kart.",
         [B("testimonials", kicker="GÖNÜL KÖPRÜSÜ", title="İyiliğe Ortak Olanların Sözleri", look="featured_grid", items=[
             {"rating": 5, "badge": "Doğrulanmış Bağışçı ✓", "quote": "Yıllardır birçok kurumla çalıştım ama hem saha hızını hem de kuruşu kuruşuna şeffaflığı burada gördüm. Allah emeği geçenlerden razı olsun.", "name": "Hacı Ahmet Ö.", "role": "İstanbul"},
             {"rating": 5, "quote": "Ramazan kumanyaları tam vaktinde ulaştı.", "name": "Zeynep D.", "role": "İzmir"},
             {"rating": 5, "quote": "Zekât hesaplayıcı çok pratik ve güvenilir.", "name": "Kemal S.", "role": "Almanya"},
             {"rating": 5, "quote": "Mobil bağış ve makbuz sistemi kusursuz.", "name": "Ayşe T.", "role": "Konya"},
             {"rating": 5, "quote": "Her projede video raporu görmek güven veriyor.", "name": "Ömer F.", "role": "Kayseri"},
         ])])
_section("testimonials-marquee", "Sürekli akan yorum şeridi (Marquee)", "Etki & güven", "Yatay kesintisiz akan sosyal kanıt duvarı.",
         [B("testimonials", kicker="SOSYAL KANIT", title="Sizden Gelen Güzel Sözler", look="marquee", items=[
             {"rating": 5, "badge": "Kurban", "quote": "Vekalet hassasiyeti ve hızlı bilgilendirme için teşekkürler.", "name": "Ali R.", "role": "İstanbul"},
             {"rating": 5, "badge": "Su Kuyusu", "quote": "Kuyu açılış videosu tüm ailemizi duygulandırdı.", "name": "Hatice Y.", "role": "Bursa"},
             {"rating": 5, "badge": "Eğitim", "quote": "Öğrencilere burs desteği ulaştırmak hiç bu kadar kolay olmamıştı.", "name": "Selim K.", "role": "Ankara"},
             {"rating": 5, "badge": "Acil Yardım", "quote": "Afet bölgesine ilk ulaşan ekipler arasında olduklarını gördük.", "name": "Meryem N.", "role": "Fransa"},
         ])])
_section("testimonials-masonry", "Asimetrik duvar (Masonry)", "Etki & güven", "Farklı uzunluktaki yorumları doğal sütunlara dizer.",
         [B("testimonials", kicker="TEŞEKKÜRLER", title="Bağışçı & Gönüllü Notları", look="masonry", items=[
             {"rating": 5, "quote": "İlk kez su kuyusu hissesine katıldım, her aşamada SMS geldi.", "name": "Burak M.", "role": "Antalya"},
             {"rating": 5, "quote": "Kurumunuzla tanıştıktan sonra düzenli bağış talimatı verdim. Şeffaflık raporlarınızı her yıl inceliyorum, emeğinize sağlık.", "name": "Sümeyye Ç.", "role": "İstanbul"},
             {"rating": 5, "quote": "Kurban organizasyonunuz çok düzenli.", "name": "Enes T.", "role": "Gaziantep"},
         ])])

_section("countdown-kurban", "Geri sayım: Kurban", "Çağrı", "Kurban Bayramı'na geri sayım (tarihi kendi yılınıza göre değiştirin).",
         [B("countdown", kicker="KURBAN 2027", title="Kurban kayıtlarının kapanmasına", text="Vekaletinizi son güne bırakmayın.", target="2027-05-15T18:00:00+03:00",
            button_label="Kurban bağışla", button_url="/kampanyalar", done_text="Kurban kayıtlarımız tamamlandı. Allah kabul etsin.", tone="brand")])
_section("countdown-ramadan", "Geri sayım: Ramazan", "Çağrı", "Ramazan başlangıcına geri sayım; koyu zemin.",
         [B("countdown", kicker="HOŞ GELDİN", title="Ramazan'a kalan süre", target="2027-02-08T00:00:00+03:00", button_label="Ramazan bağışları", button_url="/kampanyalar",
            done_text="Ramazan-ı Şerif mübarek olsun.", tone="dark")])
_section("countdown-ring", "Geri sayım: Dairesel halka", "Çağrı", "Gün, saat, dakika ve saniyeyi dairesel halkalarla gösteren modern sayaç.",
         [B("countdown", kicker="KAMPANYA SAYACI", title="Hedef tarihe kalan süre", text="Kampanya kapanmadan destek verebilirsiniz.", target="2027-05-15T18:00:00+03:00", button_label="Hemen destek ol", button_url="/kampanyalar", look="ring", tone="dark")])
_section("countdown-glass", "Geri sayım: Görsel üstü cam", "Çağrı", "Arka plan görseli üzerinde buzlu cam efektli geri sayım.",
         [B("countdown", kicker="ZEKAT & FİTRE", title="Ramazan bereketini paylaşın", text="İftar, kumanya ve zekat bağışlarınızla sofralara umut olun.", image_url="/demo/mosque.webp", target="2027-02-08T00:00:00+03:00", button_label="Bağış yap", button_url="/kampanyalar", button2_label="Zekat hesapla", button2_url="/zekat-hesapla", look="glass")])
_section("countdown-minimal", "Geri sayım: İnce şerit", "Çağrı", "Sayfa içi kompakt tek satırlık geri sayım çubuğu.",
         [B("countdown", kicker="SON GÜNLER", title="Kurban kayıtları kapanıyor", target="2027-05-15T18:00:00+03:00", button_label="Hisse ayırt", button_url="/kampanyalar", look="minimal", tone="accent")])
_section("marquee-brand", "Kayan yazı (ana renk)", "Çağrı", "Tam genişlik kayan duyuru şeridi.",
         [B("marquee", tone="brand", speed="normal", items=[{"text": "Zekat"}, {"text": "Fitre"}, {"text": "Kurban"}, {"text": "Su kuyusu"}, {"text": "Yetim sponsorluğu"}, {"text": "Burs"}])])
_section("marquee-accent", "Kayan duyuru (vurgu)", "Çağrı", "Vurgu renginde duyuru metinleri.",
         [B("marquee", tone="accent", speed="slow", separator="•", items=[{"text": "Kurban kayıtları başladı"}, {"text": "Bağışlarınız için resmi makbuz"}, {"text": "7/24 online bağış"}])])
_section("marquee-ticker", "Kayan yazı: Sabit etiketli ticker", "Çağrı", "Solda sabit etiket, sağda tıklanabilir kayan kampanya duyuruları.",
         [B("marquee", look="ticker", label="DUYURULAR", tone="dark", speed="normal", items=[
             {"icon": "🐑", "text": "Kurban vekalet kayıtları başladı", "url": "/kampanyalar"},
             {"icon": "💧", "text": "Afrika ve Asya'da yeni su kuyuları açıldı", "url": "/kampanyalar"},
             {"icon": "🌙", "text": "Zekat hesaplayıcı ile nisabınızı ölçün", "url": "/zekat-hesapla"},
         ])])
_section("marquee-pills", "Kayan yazı: İkonlu hap rozetler", "Çağrı", "Yumuşak zemin üzerinde ikonlu hap kutular halinde kayan alanlar.",
         [B("marquee", look="pills", tone="soft", speed="slow", items=[
             {"icon": "🍞", "text": "Gıda Yardımı", "url": "/kampanyalar"},
             {"icon": "💧", "text": "Temiz Su", "url": "/kampanyalar"},
             {"icon": "🎓", "text": "Eğitim & Burs", "url": "/kampanyalar"},
             {"icon": "🏥", "text": "Sağlık Desteği", "url": "/kampanyalar"},
             {"icon": "🏠", "text": "Barınma", "url": "/kampanyalar"},
         ])])
_section("marquee-display", "Kayan yazı: Büyük tipografik vitrin", "Çağrı", "Büyük puntolu, yüksek kontrastlı marka ve misyon şeridi.",
         [B("marquee", look="display", tone="dark", speed="slow", separator="—", items=[
             {"text": "İYİLİK PAYLAŞTIKÇA ÇOĞALIR"},
             {"text": "GÜVENİLİR VE ŞEFFAF YARDIM"},
             {"text": "SINIRLARI AŞAN DAYANIŞMA"},
         ])])
_section("announcement", "Duyuru çubuğu (kapatılabilir)", "Çağrı", "Sayfanın üstünde ince, kapatılabilir duyuru.",
         [B("announcement_bar", text="Kurban bağışları başladı — vekaletinizi hemen verin.", url="/kampanyalar", tone="danger", icon="🐑")])
_section("announcement-cta", "Duyuru çubuğu: Rozet & Butonlu", "Çağrı", "Rozet, duyuru metni ve ayrı aksiyon butonu içeren üst şerit.",
         [B("announcement_bar", look="pill_cta", badge="YENİ", text="2026 Ramazan kumanya ve iftar destekleri başladı.", button_label="Hemen bağış yap", url="/kampanyalar", tone="brand")])
_section("announcement-countdown", "Duyuru çubuğu: Geri sayımlı", "Çağrı", "Kampanya bitiş tarihine canlı geri sayan üst duyuru çubuğu.",
         [B("announcement_bar", look="countdown", badge="SON GÜNLER", text="Kurban hisse kayıtlarının kapanmasına kalan süre:", end_date="2027-06-15", button_label="Hisse ayırt", url="/kampanyalar", tone="dark")])
_section("announcement-rotator", "Duyuru çubuğu: Çoklu dönen", "Çağrı", "Birden fazla duyuru arasında otomatik geçiş yapan üst çubuk.",
         [B("announcement_bar", look="rotator", tone="accent", text="7/24 güvenli online bağış", items=[
             {"badge": "KURBAN", "text": "Kurban vekalet kayıtları devam ediyor", "url": "/kampanyalar"},
             {"badge": "ZEKAT", "text": "Güncel nisap miktarıyla zekatınızı hesaplayın", "url": "/zekat-hesapla"},
             {"badge": "ŞEFFAFLIK", "text": "Tüm bağışlarınız anında e-makbuz ile belgelenir", "url": "/hakkimizda"},
         ])])
_section("popup-campaign", "Açılır pencere (kampanya)", "Çağrı", "Sayfa açılınca bir kez görünen kampanya penceresi.",
         [B("popup", image_url="/demo/kurban.webp", kicker="KURBAN 2027", title="Kurban vekaletinizi verdiniz mi?", text="Kesim videonuz ve bilgilendirme mesajınız aynı gün gönderilir.",
            button_label="Kurban bağışla", button_url="/kampanyalar", delay=4, hide_days=3, size="md")])
_section("popup-split", "Açılır pencere: İki sütunlu vitrin", "Çağrı", "Solda kampanya görseli, sağda başlık ve çift butonlu modal.",
         [B("popup", look="split", image_url="/demo/relief.webp", kicker="ACİL DESTEK", title="Afet bölgelerine umut olun", text="Gıda, temiz su ve sağlık paketlerimizle sahadayız.",
            button_label="Hemen bağış yap", button_url="/kampanyalar", button2_label="Detayları gör", button2_url="/hakkimizda", delay=3, hide_days=2, size="lg")])
_section("popup-slide-in", "Açılır pencere: Sağ alt köşe", "Çağrı", "Sayfa %40 kaydırılınca sağ alttan açılan zarif bildirim kutusu.",
         [B("popup", look="slide_in", trigger="scroll", kicker="ZEKAT HATIRLATMASI", title="Zekatınızı hesapladınız mı?", text="Güncel nisap miktarıyla zekatınızı 30 saniyede hesaplayın.",
            button_label="Zekat hesapla", button_url="/zekat-hesapla", hide_days=1, size="sm")])
_section("popup-quick-donate", "Açılır pencere: Hızlı bağış tutarlı", "Çağrı", "İçinde 250 / 500 / 1000 ₺ hızlı tutar çipleri bulunan pencere.",
         [B("popup", look="quick_donate", image_url="/demo/water.webp", kicker="HIZLI BAĞIŞ", title="Bir damla iyilikle hayat değiştirin", text="Seçtiğiniz tutarla doğrudan bağış adımına geçin.",
            quick_amounts="250,500,1000", button_label="Diğer tutarlar", button_url="/bagis", delay=4, hide_days=2, size="md")])
_section("featured", "Acil kampanya vitrini", "Bağış", "Öne çıkan kampanyayı büyük vitrinde gösterir.", [B("featured_campaign", kicker="ACİL")])
_section("featured-overlay", "Acil Kampanya: Tam Ekran Banner", "Bağış", "Tam genişlik görsel veya video arka planlı acil çağrı vitrini.", [
    B("featured_campaign", look="overlay", kicker="ACİL YARDIM ÇAĞRISI", quick_amounts="200, 500, 1000, 2500", show_progress=True, show_countdown=True),
])
_section("featured-alert-bar", "Acil Kampanya: İnce Uyarı Şeridi", "Bağış", "Sayfa üstü veya bölüm arası acil yardım uyarı bandı.", [
    B("featured_campaign", look="alert_bar", kicker="ACİL", quick_amounts="150, 300, 500", show_countdown=True),
])
_section("featured-countdown", "Acil Kampanya: Geri Sayımlı Kriz Vitrini", "Bağış", "Canlı geri sayım kutulu ve hızlı bağış çipli acil vitrin.", [
    B("featured_campaign", look="countdown", kicker="SON GÜNLER", quick_amounts="250, 500, 1000", show_progress=True, show_countdown=True),
])
_section("featured-donate-box", "Acil Kampanya: Hızlı Bağış Kutulu", "Bağış", "Solda acil kampanya görseli, sağda hızlı tutar seçim kutusu.", [
    B("featured_campaign", look="donate_box", kicker="ACİL DESTEK", quick_amounts="150, 300, 750, 1500", show_progress=True),
])
_section("donation-cards", "Bağış kartları (sepetli)", "Bağış", "Tutar girip sepete eklenen kartlar; öne çıkan kampanyalardan.",
         [B("donation_cards", kicker="HIZLI BAĞIŞ", title="Bağış yapabilirsiniz", source="featured")])
_section("donation-cards-list", "Bağış kartları: Yatay liste", "Bağış", "Görseli solda, tutar ve sepet butonu sağda yatay bağış satırları.",
         [B("donation_cards", kicker="HIZLI KATALOG", title="Destek bekleyen projeler", source="featured", layout="list", show_progress=True, show_summary=True, limit=6)])
_section("donation-cards-tabs", "Bağış kartları: Sekmeli & kurlu", "Bağış", "Kurban, su, eğitim ve acil yardım sekmeli çoklu para birimli kartlar.",
         [B("donation_cards", kicker="BAĞIŞ TÜRLERİ", title="Dilediğiniz alanda bağış yapın", source="tabs", currency_switcher=True, tabs=[
             {"label": "Kurban", "tag": "kurban"},
             {"label": "Su Kuyusu", "tag": "su"},
             {"label": "Eğitim & Yetim", "tag": "egitim"},
             {"label": "Acil Yardım", "tag": "acil"},
         ])])
_section("donation-cards-compact", "Bağış kartları: Kompakt hızlı liste", "Bağış", "Görselsiz, aylık/tek seferlik seçicili yoğun hızlı bağış kartları.",
         [B("donation_cards", kicker="ANINDA DESTEK", title="Tek tıkla sepete ekleyin", source="latest", layout="compact", card_style="bordered", columns=3, allow_recurring=True, limit=6)])
_section("donation-cards-featured", "Bağış kartları: İlk kart vurgulu", "Bağış", "İlk kampanya tam genişlik yatay, diğerleri ızgara vitrin.",
         [B("donation_cards", kicker="ÖNE ÇIKAN PROJELER", title="İyiliğe ortak olun", source="featured", layout="featured_first", card_style="highlight", show_progress=True, show_summary=True, cta_label="Tüm Kampanyaları Gör", cta_url="/kampanyalar", limit=7)])
_section("bank-accounts", "Hesap numaraları", "Bağış", "IBAN kartları ve kopyala düğmesi (bilgileri kendinizinkilerle değiştirin).",
         [B("bank_accounts", kicker="HAVALE / EFT", title="Hesap numaralarımız", text="Açıklama kısmına bağış türünü yazmayı unutmayın.", items=[
             {"bank": "Vakıf Katılım", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 00", "currency": "TRY"},
             {"bank": "Kuveyt Türk", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 01", "currency": "TRY"},
             {"bank": "Ziraat Katılım", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 02", "currency": "USD"},
             {"bank": "Ziraat Katılım", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 03", "currency": "EUR"},
         ], note="Örnek açıklamalar: ZEKAT · FİTRE · KURBAN · SU KUYUSU · GENEL BAĞIŞ. Havale sonrası makbuz için bizi arayabilirsiniz.")])
_section("bank-tabs", "Hesap numaraları: Para birimi sekmeli", "Bağış", "TL, USD, EUR, GBP sekmeli ve SWIFT kodlu uluslararası hesap kartları.",
         [B("bank_accounts", kicker="ULUSLARARASI & YURT İÇİ", title="Döviz ve TL hesaplarımız", text="Para birimi seçerek ilgili IBAN ve SWIFT bilgilerini tek tıkla kopyalayabilirsiniz.", look="tabs", show_currency_filter=True, items=[
             {"bank": "Vakıf Katılım", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 00", "currency": "TRY", "reference_hint": "GENEL BAĞIŞ"},
             {"bank": "Kuveyt Türk", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 01", "swift": "KTEFTRISXXX", "currency": "USD", "reference_hint": "ZEKAT"},
             {"bank": "Ziraat Katılım", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 02", "swift": "ZKBATRISXXX", "currency": "EUR", "reference_hint": "SU KUYUSU"},
             {"bank": "Albaraka Türk", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 03", "swift": "BTFHTRISXXX", "currency": "GBP", "reference_hint": "ACİL YARDIM"},
         ])])
_section("bank-table", "Hesap numaraları: Kurumsal tablo", "Bağış", "Banka, şube, hesap sahibi, IBAN ve SWIFT sütunlu kurumsal tablo.",
         [B("bank_accounts", kicker="BANKA TABLOSU", title="Resmi bağış hesaplarımız", look="table", show_currency_filter=True, items=[
             {"bank": "Vakıf Katılım", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 00", "currency": "TRY"},
             {"bank": "Kuveyt Türk", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 01", "swift": "KTEFTRISXXX", "currency": "USD"},
             {"bank": "Ziraat Katılım", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 02", "swift": "ZKBATRISXXX", "currency": "EUR"},
         ])])
_section("bank-dark", "Hesap numaraları: Koyu vitrin", "Bağış", "Koyu tema zemin üzerinde yüksek kontrastlı IBAN ve SWIFT kartları.",
         [B("bank_accounts", kicker="GÜVENLİ HAVALE / EFT", title="Bağış hesap numaralarımız", look="dark", items=[
             {"bank": "Vakıf Katılım", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 00", "currency": "TRY", "reference_hint": "ZEKAT"},
             {"bank": "Kuveyt Türk", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 01", "swift": "KTEFTRISXXX", "currency": "USD", "reference_hint": "GENEL BAĞIŞ"},
         ])])
_section("contact-form", "Mesaj formu (görselli)", "SSS & iletişim", "Solda görsel ve rozet, sağda mesaj formu.",
         [B("contact_form", kicker="MESAJ GÖNDERİN", title="İyiliğe uzanan elimize destek olun", image_url="/demo/hands.webp", badge_value="70k", badge_text="Ulaşılan aile")])
_section("contact-centered", "Ortalı sade mesaj formu", "SSS & iletişim", "Görselsiz, odaklı tek kart iletişim formu.",
         [B("contact_form", kicker="BİZE YAZIN", title="Sorularınız İçin İletişime Geçin", text="Ekibimiz mesajlarınıza en kısa sürede dönüş yapacaktır.", look="centered", subjects="Genel Bilgi, Bağış & Makbuz, Kurban Vekaleti, Kurumsal İş Birliği")])
_section("contact-info-split", "İletişim bilgileri + mesaj formu", "SSS & iletişim", "Solda telefon, e-posta, adres ve çalışma saatleri; sağda form.",
         [B("contact_form", kicker="İLETİŞİM", title="Her Zaman Yanınızdayız", text="Bize telefon, e-posta veya aşağıdaki form üzerinden ulaşabilirsiniz.", look="split_info", working_hours="Hafta içi 09:00 - 18:00", kvkk_text="Kişisel verilerimin iletişim amacıyla işlenmesini onaylıyorum.")])
_section("contact-callback", "Sizi arayalım (hızlı form)", "SSS & iletişim", "Ad, telefon ve konu ile hızlı geri arama talebi.",
         [B("contact_form", kicker="HIZLI DESTEK", title="Numaranızı Bırakın, Sizi Arayalım", text="Bağış ve projelerimiz hakkında detaylı bilgi için ekibimiz sizi arasın.", look="callback", ask_email=False, subjects="Su Kuyusu Bilgi, Yetim Sponsorluğu, Kurumsal Bağış", button_label="Beni Arayın")])
_section("gallery-strip", "Galeri şeridi", "SSS & iletişim", "Galeri sayfanızdaki son görseller.", [B("gallery_strip", kicker="GALERİ", title="Sahadan kareler", limit=10)])
_section("gallery-strip-dual", "Çift sıra akan galeri duvarı", "SSS & iletişim", "Üst sıra sola, alt sıra sağa akan dinamik saha fotoğrafı duvarı.",
         [B("gallery_strip", kicker="SAHADAN", title="İyiliğin İzleri", text="Dünyanın dört bir yanındaki saha çalışmalarımızdan kareler.", look="dual_marquee", aspect="mixed", speed="normal", limit=12, show_album=True)])
_section("gallery-strip-carousel", "Kaydırmalı galeri şeridi (Lightbox)", "SSS & iletişim", "Oklarla gezilen ve tıklanınca büyüyen galeri şeridi.",
         [B("gallery_strip", kicker="FOTO & VİDEO", title="Çalışmalarımızdan Kareler", look="carousel", aspect="4/3", include_videos=True, caption_mode="always", click_action="lightbox", limit=10)])
_section("gallery-strip-polaroid", "Polaroid albüm şeridi", "SSS & iletişim", "Albüm etiketli, çerçeveli sıcak fotoğraf şeridi.",
         [B("gallery_strip", kicker="ALBÜM", title="Sahadan Hatıralar", look="polaroid", show_album=True, click_action="lightbox", limit=8)])

_section("header-classic", "Klasik header", "Header", "İletişim çubuğu + logo, menü ve bağış butonu.", default_header_blocks(), kind="header")
_section("header-centered", "Ortalı logo", "Header", "Duyuru çubuğu, ortada logo, altta sabit menü.", header_centered(), kind="header")
_section("header-dark", "Koyu tek satır", "Header", "Koyu zemin, ortada menü, sağda bağış.", header_dark(), kind="header")
_section("header-minimal", "Sade", "Header", "Beyaz, ince, sloganısız.", header_minimal(), kind="header")
_section("footer-classic", "Üç sütunlu footer", "Footer", "Tanıtım, alt menü, iletişim.", default_footer_blocks(), kind="footer")
_section("footer-four", "Dört sütunlu footer", "Footer", "İki menü, iletişim ve bağış butonu.", footer_four(), kind="footer")
_section("footer-minimal", "Sade ortalı footer", "Footer", "Açık zemin, ortalı logo ve bağlantılar.", footer_minimal(), kind="footer")

# --- Pro Slider, Carousel & Interactive Section Presets ---
_section("slider-coverflow", "Slider: 3D Coverflow Vitrini", "Kapak & Slider", "Yan slaytları 3D açıyla gösteren vitrin slider.", [
    B("slider", layout="coverflow", height="lg", effect="fade", autoplay=True, arrows=True, dots=True, slides=[
        {"image_url": "/demo/water.webp", "badge": "SU KUYUSU", "title": "Temiz Suya Kavuşan Köyler", "text": "Afrika ve Asya'da kalıcı su kuyuları açıyoruz.", "button_label": "Bağış Yap", "button_url": "/kampanyalar", "quick_amounts": "250, 500, 1000"},
        {"image_url": "/demo/kurban.webp", "badge": "KURBAN", "title": "Vekaletle Kurban Bereketi", "text": "Kesim videonuz ve bilgilendirme SMS'iniz aynı gün iletilir.", "button_label": "Hisse Al", "button_url": "/kampanyalar", "quick_amounts": "1000, 3500, 7000"},
        {"image_url": "/demo/orphan.webp", "badge": "YETİM", "title": "Bir Yetimin Elinden Tutun", "text": "Aylık düzenli destekle eğitim ve barınma ihtiyaçlarını karşılayın.", "button_label": "Sponsor Ol", "button_url": "/kampanyalar"},
    ]),
])
_section("slider-peek", "Slider: Sinematik Peek", "Kapak & Slider", "Ortada geniş ana slayt, yanlarda önceki/sonraki önizleme.", [
    B("slider", layout="peek", height="lg", effect="slide", autoplay=True, arrows=True, dots=True, slides=[
        {"image_url": "/demo/relief.webp", "badge": "ACİL YARDIM", "title": "Kriz Bölgelerine Hızlı İnsani Destek", "text": "Gıda, sağlık ve barınma yardımlarını doğrudan ulaştırıyoruz.", "button_label": "Acil Destek", "button_url": "/kampanyalar"},
        {"image_url": "/demo/education.webp", "badge": "EĞİTİM", "title": "Hafızlık ve Burs Destekleri", "text": "İlim yolundaki talebelerin yanında olun.", "button_label": "Burs Ver", "button_url": "/kampanyalar"},
        {"image_url": "/demo/hands.webp", "badge": "GÖNÜLLÜLÜK", "title": "İyiliği Birlikte Büyütelim", "text": "Sahada ve dijitalde gönüllü ağımıza katılın.", "button_label": "Başvur", "button_url": "/gonullu"},
    ]),
])
_section("slider-bento", "Slider: Bento Vitrin", "Kapak & Slider", "Ana slayt yanında iki tıklanabilir mini vitrin kartı.", [
    B("slider", layout="bento", height="lg", effect="fade", autoplay=True, arrows=True, slides=[
        {"image_url": "/demo/ramadan.webp", "badge": "RAMAZAN", "title": "İftar Sofraları Kuruluyor", "text": "Her akşam binlerce aileye sıcak yemek ulaştırıyoruz.", "button_label": "İftar Bağışla", "button_url": "/kampanyalar", "quick_amounts": "150, 300, 750"},
        {"image_url": "/demo/water.webp", "badge": "SU KUYUSU", "title": "Bir Damla Hayat", "button_label": "İncele", "button_url": "/kampanyalar"},
        {"image_url": "/demo/orphan.webp", "badge": "YETİM", "title": "Yetim Gülerse Dünya Güler", "button_label": "Sponsor Ol", "button_url": "/kampanyalar"},
    ]),
])
_section("slider-duotone", "Slider: Marka Renkli (Duotone)", "Kapak & Slider", "Görsel üstü kurumsal renk geçişli modern kapak.", [
    B("slider", layout="duotone", height="lg", effect="blur", nav="numbers", autoplay=True, slides=[
        {"image_url": "/demo/hands.webp", "badge": "ŞEFFAFLIK", "title": "Her Bağış Emanettir", "text": "Makbuz doğrulama ve görüntülü bilgilendirme ile tam güven.", "button_label": "Bağış Yap", "button_url": "/kampanyalar", "button2_label": "Makbuz Doğrula", "button2_url": "/verify"},
        {"image_url": "/demo/quran.webp", "badge": "EĞİTİM", "title": "Geleceği İlimle İnşa Ediyoruz", "text": "Kur'an kursları ve burs projelerimize destek olun.", "button_label": "Destek Ol", "button_url": "/kampanyalar"},
    ]),
])
_section("slider-icon-tabs", "Slider: İkonlu Kategori Sekmeleri", "Kapak & Slider", "Yuvarlatılmış kampanya kartı ve altında ikonlu kategori sekme çubuğu.", [
    B("slider", layout="card", nav="icon_tabs", height="lg", effect="fade", arrow_style="ghost", autoplay=True, arrows=True, dots=True, slides=[
        {"image_url": "/demo/winter.webp", "tab_label": "Kış", "tab_icon": "snowflake", "bg_color": "#EFF6FF", "title": "Kış Yardımları", "text": "Soğuk kış günlerinde ailelere yakacak, battaniye ve kışlık giyim ulaştırıyoruz.", "button_label": "Bağış Yap", "button_url": "/kampanyalar", "button2_label": "Detaylı Bilgi", "button2_url": "/hakkimizda"},
        {"image_url": "/demo/ramadan.webp", "tab_label": "Zekat", "tab_icon": "coins", "bg_color": "#ECFDF5", "title": "Zekat & Fitre", "text": "Zekatlarınızı gerçek ihtiyaç sahiplerine güvenle ve şeffaflıkla ulaştırıyoruz.", "button_label": "Zekat Ver", "button_url": "/kampanyalar", "button2_label": "Zekat Hesapla", "button2_url": "/zekat-hesapla"},
        {"image_url": "/demo/education.webp", "tab_label": "Eğitim", "tab_icon": "graduation-cap", "bg_color": "#FEFCE8", "title": "Eğitim & Burs", "text": "Öğrencilerin eğitim yolculuğuna burs ve kırtasiye desteğiyle ortak olun.", "button_label": "Burs Ver", "button_url": "/kampanyalar"},
        {"image_url": "/demo/food.webp", "tab_label": "Sofra", "tab_icon": "utensils", "bg_color": "#FFF7ED", "title": "Sıcak Yemek Sofrası", "text": "Aşevlerimizde her gün binlerce ihtiyaç sahibine sıcak yemek ikram ediyoruz.", "button_label": "Destek Ol", "button_url": "/kampanyalar"},
        {"image_url": "/demo/water.webp", "tab_label": "Su Kuyusu", "tab_icon": "droplets", "bg_color": "#F0F9FF", "title": "Temiz Su Kuyuları", "text": "Susuzluk çeken köylere kalıcı su kuyuları açarak hayat verin.", "button_label": "Kuyu Açtır", "button_url": "/kampanyalar"},
        {"image_url": "/demo/orphan.webp", "tab_label": "Yetim", "tab_icon": "smile", "bg_color": "#E0F2FE", "title": "Yetim Sponsorluğu", "text": "Siz de sponsor olun, bir yetimin hayatına iyilikle dokunun.", "button_label": "Sponsor Ol", "button_url": "/kampanyalar", "button2_label": "Detaylı Bilgi", "button2_url": "/hakkimizda"},
    ]),
])
_section("slider-vertical-thumbs", "Slider: Dikey Küçük Resimli Vitrin", "Kapak & Slider", "Sol ana vitrin ve sağda dikey slayt seçici liste.", [
    B("slider", layout="vertical_thumbs", height="lg", effect="fade", autoplay=True, arrows=True, slides=[
        {"image_url": "/demo/water.webp", "badge": "SU KUYUSU", "title": "Temiz Suya Kavuşan Köyler", "text": "Afrika ve Asya'da kalıcı su kuyuları açıyoruz.", "button_label": "Bağış Yap", "button_url": "/kampanyalar", "quick_amounts": "250, 500, 1000"},
        {"image_url": "/demo/kurban.webp", "badge": "KURBAN", "title": "Vekaletle Kurban Bereketi", "text": "Kesim videonuz ve bilgilendirme SMS'iniz aynı gün iletilir.", "button_label": "Hisse Al", "button_url": "/kampanyalar"},
        {"image_url": "/demo/orphan.webp", "badge": "YETİM", "title": "Bir Yetimin Elinden Tutun", "text": "Aylık düzenli destekle eğitim ve barınma ihtiyaçlarını karşılayın.", "button_label": "Sponsor Ol", "button_url": "/kampanyalar"},
        {"image_url": "/demo/education.webp", "badge": "EĞİTİM", "title": "Hafızlık ve Burs Destekleri", "text": "İlim yolundaki talebelerin yanında olun.", "button_label": "Burs Ver", "button_url": "/kampanyalar"},
    ]),
])
_section("slider-dual-sync", "Slider: Çift Yönlü Senkron (Dual-Sync)", "Kapak & Slider", "Sol bilgi paneli ve sağ görselin senkronize değiştiği modern vitrin.", [
    B("slider", layout="dual_sync", height="lg", effect="fade", nav="ring", autoplay=True, arrows=True, slides=[
        {"image_url": "/demo/relief.webp", "badge": "ACİL YARDIM", "title": "Kriz Bölgelerine Hızlı Destek", "text": "Gıda kolisi, temiz su ve sıcak yemek yardımlarını ulaştırıyoruz.", "button_label": "Acil Destek", "button_url": "/kampanyalar", "quick_amounts": "200, 500, 1000"},
        {"image_url": "/demo/hands.webp", "badge": "GÖNÜLLÜLÜK", "title": "İyiliği Birlikte Büyütelim", "text": "Sahada ve dijitalde gönüllü ağımıza katılın.", "button_label": "Gönüllü Ol", "button_url": "/gonullu"},
        {"image_url": "/demo/quran.webp", "badge": "EĞİTİM", "title": "Geleceği İlimle İnşa Ediyoruz", "text": "Kur'an kursları ve burs projelerimize destek olun.", "button_label": "Destek Ol", "button_url": "/kampanyalar"},
    ]),
])
_section("slider-magazine", "Slider: Editoryal Dergi Vitrini", "Kapak & Slider", "Perde açılış efektli ve sağ alt hikaye indeksli dergi vitrini.", [
    B("slider", layout="magazine", height="lg", effect="curtain", autoplay=True, arrows=True, slides=[
        {"image_url": "/demo/ramadan.webp", "badge": "RAMAZAN ÖZEL", "title": "İftar Sofralarında Kardeşlik", "text": "Her akşam binlerce aileye sıcak yemek ulaştırıyoruz.", "button_label": "İftar Bağışla", "button_url": "/kampanyalar", "quick_amounts": "150, 300, 750"},
        {"image_url": "/demo/water.webp", "badge": "SAHA RAPORU", "title": "42. Su Kuyusu Hizmete Açıldı", "text": "Yeni açılan kuyularla 15 bin kişiye temiz içme suyu sağlandı.", "button_label": "Detayları Gör", "button_url": "/kampanyalar"},
        {"image_url": "/demo/orphan.webp", "badge": "YETİM DESTEĞİ", "title": "Eğitimle Değişen Hayatlar", "text": "Yetim çocuklarımıza kırtasiye, okul ve burs desteği.", "button_label": "Sponsor Ol", "button_url": "/kampanyalar"},
    ]),
])
_section("slider-cube", "Slider: 3D Küp & Dairesel Sayaç", "Kapak & Slider", "3D küp dönüş efektli ve dairesel zamanlayıcı halkalı kapak slider.", [
    B("slider", layout="overlay", height="lg", effect="cube", nav="ring", autoplay=True, arrows=True, slides=[
        {"image_url": "/demo/kurban.webp", "badge": "VEKALET", "title": "Kurbanınız İhtiyaç Sahiplerine Ulaşsın", "text": "Güvenilir organizasyon ve şeffaf bilgilendirme ile vekalet kurban.", "button_label": "Hisse Bağışla", "button_url": "/kampanyalar", "quick_amounts": "1000, 3500, 7000"},
        {"image_url": "/demo/relief.webp", "badge": "ACİL YARDIM", "title": "Bir Koliyle Bir Aileyi Sevindirin", "text": "Temel gıda ve hijyen paketleri sahadaki ekiplerimizle teslim ediliyor.", "button_label": "Destek Ol", "button_url": "/kampanyalar"},
        {"image_url": "/demo/winter.webp", "badge": "KIŞ YARDIMI", "title": "Soğuk Günlerde Sıcak Bir El", "text": "Battaniye, yakacak ve kışlık giyim desteği.", "button_label": "Bağış Yap", "button_url": "/kampanyalar"},
    ]),
])
_section("carousel-coverflow", "Carousel: 3D Coverflow Kartlar", "Kapak & Slider", "3D derinlikli kaydırmalı proje kartları.", [
    B("carousel", kicker="PROJELER", title="Öne Çıkan Çalışmalarımız", look="coverflow", columns=3, aspect="4/3", autoplay=True, dots=True, arrows=True, arrow_style="round", items=[
        {"image_url": "/demo/water.webp", "badge": "Su Kuyusu", "title": "Temiz Su Projeleri", "text": "Kurak bölgelerde kalıcı sondaj kuyuları.", "button_label": "İncele", "button_url": "/kampanyalar"},
        {"image_url": "/demo/orphan.webp", "badge": "Yetim", "title": "Yetim Sponsorluğu", "text": "Eğitim, sağlık ve giyim desteği.", "button_label": "İncele", "button_url": "/kampanyalar"},
        {"image_url": "/demo/kurban.webp", "badge": "Kurban", "title": "Yurt Dışı Kurban", "text": "İhtiyaç sahiplerine bayram sevinci.", "button_label": "İncele", "button_url": "/kampanyalar"},
        {"image_url": "/demo/winter.webp", "badge": "Acil", "title": "Kış Yardımları", "text": "Yakacak, battaniye ve gıda kolisi.", "button_label": "İncele", "button_url": "/kampanyalar"},
    ]),
])
_section("carousel-center", "Carousel: Ortadaki Büyük (Center-Mode)", "Kapak & Slider", "Merkez odaklı kaydırmalı vitrin.", [
    B("carousel", kicker="SAHA HİKAYELERİ", title="Umut Olan Projeler", look="center", columns=3, aspect="16/9", autoplay=True, dots=True, items=[
        {"image_url": "/demo/relief.webp", "badge": "Gıda", "title": "Aşevi ve Sıcak Yemek", "text": "Günlük 2.500 kişilik sıcak yemek dağıtımı.", "button_label": "Katkıda Bulun", "button_url": "/kampanyalar"},
        {"image_url": "/demo/education.webp", "badge": "Burs", "title": "Üniversite ve Hafızlık Bursu", "text": "Yüzlerce öğrenciye aylık düzenli burs.", "button_label": "Katkıda Bulun", "button_url": "/kampanyalar"},
        {"image_url": "/demo/hands.webp", "badge": "Sağlık", "title": "Katarakt ve Sağlık Taramaları", "text": "Göz nurunu bekleyen hastalara umut.", "button_label": "Katkıda Bulun", "button_url": "/kampanyalar"},
    ]),
])
_section("carousel-ticker", "Carousel: Sürekli Akan Şerit (Marquee)", "Kapak & Slider", "Durmadan yatay akan fotoğraf/kart bandı.", [
    B("carousel", kicker="SAHADAN KARELER", title="Kesintisiz İyilik Hareketi", look="ticker", columns=4, aspect="4/3", speed=24, pause_on_hover=True, arrows=False, dots=False, items=[
        {"image_url": "/demo/water.webp", "badge": "Çad", "title": "Su Kuyusu Açılışı"},
        {"image_url": "/demo/kurban.webp", "badge": "Tanzanya", "title": "Kurban Dağıtımı"},
        {"image_url": "/demo/orphan.webp", "badge": "Bangladeş", "title": "Yetimhane Ziyareti"},
        {"image_url": "/demo/ramadan.webp", "badge": "Gazze", "title": "İftar Sofrası"},
        {"image_url": "/demo/winter.webp", "badge": "Suriye", "title": "Kışlık Kıyafet"},
    ]),
])
_section("carousel-multirow", "Carousel: 2 Satırlı Kompakt", "Kapak & Slider", "İki satır halinde çoklu proje kartı kaydırır.", [
    B("carousel", kicker="TÜM KATEGORİLER", title="Bağış Alanlarımız", look="multirow", columns=3, aspect="16/9", dots=True, items=[
        {"image_url": "/demo/water.webp", "badge": "Su", "title": "Su Kuyusu", "text": "Temiz suya erişim."},
        {"image_url": "/demo/orphan.webp", "badge": "Yetim", "title": "Yetim Bakımı", "text": "Aylık sponsorluk."},
        {"image_url": "/demo/kurban.webp", "badge": "Kurban", "title": "Adak & Akika", "text": "Yıl boyu kesim."},
        {"image_url": "/demo/ramadan.webp", "badge": "Gıda", "title": "Kumanya Kolisi", "text": "Ailelere gıda paketi."},
        {"image_url": "/demo/education.webp", "badge": "Eğitim", "title": "Hafızlık Bursu", "text": "Talebe desteği."},
        {"image_url": "/demo/winter.webp", "badge": "Kış", "title": "Yakacak Yardımı", "text": "Sıcak yuvalar."},
    ]),
])
_section("carousel-testimonials", "Carousel: Bağışçı & Gönüllü Yorumları", "Kapak & Slider", "Yıldızlı ve profil fotoğraflı referans/yorum kartları.", [
    B("carousel", kicker="GÖNÜL DOSTLARIMIZ", title="Bağışçılarımız Ne Diyor?", look="testimonial", columns=3, nav="progress", autoplay=True, arrows=True, items=[
        {"title": "Ahmet Yılmaz", "subtitle": "Düzenli Bağışçı • İstanbul", "rating": 5, "text": "Kurban kesim videosunun aynı gün telefonuma gelmesi ve makbuz doğrulama sistemi bana büyük güven veriyor."},
        {"title": "Fatma Kaya", "subtitle": "Yetim Sponsoru • Ankara", "rating": 5, "text": "Her ay bir yetim yavrumuzun eğitimine vesile olmak tarifsiz bir huzur. Süreç son derece şeffaf."},
        {"title": "Mehmet Demir", "subtitle": "Saha Gönüllüsü • Konya", "rating": 5, "text": "Su kuyusu açılışlarını yerinde takip ettim. Emanetlerin kuruşu kuruşuna yerine ulaştığına şahidim."},
        {"title": "Ayşe Şahin", "subtitle": "Zekat Bağışçısı • Bursa", "rating": 5, "text": "Zekat hesaplama aracı ve hızlı ödeme ekranı sayesinde bağışımı saniyeler içinde tamamladım."},
    ]),
])
_section("carousel-logos", "Carousel: Partner & Kurum Logoları", "Kapak & Slider", "Gri-tonlamalı, üzerine gelince renklenen sürekli akan logo şeridi.", [
    B("carousel", kicker="İŞ BİRLİKLERİMİZ", title="Destekçi Kurumlar", look="logo", speed=22, pause_on_hover=True, arrows=False, nav="none", items=[
        {"image_url": "/demo/water.webp", "title": "Su Kuyusu Vakfı"},
        {"image_url": "/demo/education.webp", "title": "İlim ve Hikmet Derneği"},
        {"image_url": "/demo/hands.webp", "title": "Gönül Köprüsü"},
        {"image_url": "/demo/relief.webp", "title": "Acil Yardım Ağı"},
        {"image_url": "/demo/orphan.webp", "title": "Yetim Himaye Platformu"},
    ]),
])
_section("carousel-deck", "Carousel: Kart Destesi (Stacked Deck)", "Kapak & Slider", "Üst üste binen etkileşimli hikaye kartları destesi.", [
    B("carousel", kicker="SAHA HİKAYELERİ", title="Değişen Hayatlar", look="deck", aspect="16/9", nav="numbers", autoplay=True, arrows=True, items=[
        {"image_url": "/demo/water.webp", "badge": "Su Kuyusu", "title": "Köye İlk Kez Temiz Su Geldi", "text": "Kilometrelerce yürümek zorunda kalan çocuklar artık okula zamanında gidiyor.", "button_label": "Hikayeyi Gör", "button_url": "/kampanyalar"},
        {"image_url": "/demo/orphan.webp", "badge": "Yetim", "title": "Yeni Okul Çantaları Dağıtıldı", "text": "Eğitim dönemine 500 yetim öğrencimiz yeni kırtasiye setleriyle başladı.", "button_label": "Destek Ol", "button_url": "/kampanyalar"},
        {"image_url": "/demo/ramadan.webp", "badge": "Ramazan", "title": "Binlerce Kişilik İftar Buluşması", "text": "Hayırseverlerimizin desteğiyle kurulan sofralarda kardeşlik pekişti.", "button_label": "İftar Bağışla", "button_url": "/kampanyalar"},
    ]),
])
_section("carousel-glass", "Carousel: Cam Kartlı Vitrin (Glass)", "Kapak & Slider", "Buzlu cam efektli modern çoklu proje kartları.", [
    B("carousel", kicker="VİTRİN", title="Öncelikli Projelerimiz", look="glass", columns=3, aspect="4/3", nav="progress", autoplay=True, arrows=True, items=[
        {"image_url": "/demo/kurban.webp", "badge": "Kurban", "title": "Vekaletle Kurban", "subtitle": "32 Ülkede Kesim", "text": "İslami usullere uygun kesim ve anında görüntülü bilgilendirme.", "button_label": "Hisse Al", "button_url": "/kampanyalar"},
        {"image_url": "/demo/relief.webp", "badge": "Acil", "title": "Gıda Kolisi", "subtitle": "Aylık Aile Paketi", "text": "Bir ailenin 1 aylık temel gıda ihtiyacını karşılayın.", "button_label": "Bağışla", "button_url": "/kampanyalar"},
        {"image_url": "/demo/quran.webp", "badge": "Eğitim", "title": "Kur'an-ı Kerim Hediyesi", "subtitle": "Hafızlık Talebelerine", "text": "İlim yolundaki öğrencilere Mushaf hediye edin.", "button_label": "Hediye Et", "button_url": "/kampanyalar"},
    ]),
])
_section("before-after-well", "Önce / Sonra Karşılaştırma", "Metin & medya", "Sürgülü önce/sonra görsel karşılaştırması.", [
    B("before_after", kicker="SAHADAN DEĞİŞİM", title="Bir Kuyunun Değiştirdiği Hayat", subtitle="Çizgiyi sağa sola kaydırarak çalışma öncesi ve sonrası farkı görün.",
      before_image="/demo/winter.webp", before_label="Önce", after_image="/demo/water.webp", after_label="Sonra", aspect="16/9", initial_position=50),
])
_section("bento-impact", "Bento Grid Vitrin", "Metin & medya", "Asimetrik modern Bento kutu düzeni.", [
    B("bento_grid", kicker="FAALİYETLER", title="İyiliği Her Alana Taşıyoruz", items=[
        {"image_url": "/demo/water.webp", "badge": "SU KUYUSU", "title": "320+ Su Kuyusu Açıldı", "text": "Yüz binlerce insan temiz suya kavuştu.", "span": "large", "tone": "dark", "url": "/kampanyalar"},
        {"badge": "ŞEFFAFLIK", "title": "%100 Doğrulanabilir Makbuz", "text": "Tüm bağışlarınız online takip edilir.", "span": "wide", "tone": "brand", "url": "/verify"},
        {"badge": "YETİM", "title": "1.400+ Yetim", "text": "Düzenli eğitim ve bakım desteği.", "span": "normal", "tone": "soft"},
        {"image_url": "/demo/education.webp", "badge": "EĞİTİM", "title": "Hafızlık Bursları", "span": "normal", "tone": "light", "url": "/kampanyalar"},
    ]),
])
_section("pricing-sponsorship", "Sponsorluk & Bağış Paketleri", "Bağış", "Kademeli aylık veya tek seferlik destek paketleri.", [
    B("pricing_tiers", kicker="DÜZENLİ DESTEK", title="İyilik Paketlerimiz", subtitle="Size en uygun destek paketini seçerek düzenli iyilik halkasına katılın.", columns=3, items=[
        {"badge": "Başlangıç", "title": "Kumanya Desteği", "amount": "500 ₺", "period": "/ ay", "description": "Bir ailenin aylık temel gıda ihtiyacına katkı.", "features": "Aylık 1 gıda kolisi\nSMS ile teslimat bilgisi\nResmi bağış makbuzu", "button_label": "Destek Ol", "button_url": "/kampanyalar"},
        {"badge": "En Çok Tercih Edilen", "title": "Yetim Sponsorluğu", "amount": "1.200 ₺", "period": "/ ay", "description": "Bir yetimin tüm eğitim, giyim ve bakım masrafları.", "features": "Eğitim ve kırtasiye\nSağlık ve beslenme\nYıllık gelişim raporu\nÖzel bağışçı paneli", "button_label": "Sponsor Ol", "button_url": "/kampanyalar", "highlighted": True},
        {"badge": "Eğitim", "title": "Hafızlık Bursu", "amount": "1.500 ₺", "period": "/ ay", "description": "Kur'an kursu talebelerinin eğitim ve iaşe desteği.", "features": "Barınma ve yemek\nKitap ve materyal\nVeli/bağışçı bilgilendirme", "button_label": "Burs Ver", "button_url": "/kampanyalar"},
    ]),
])
_section("video-gallery-field", "Video Galeri (Saha Çalışmaları)", "Metin & medya", "Açılır pencerede oynatılan video galerisi.", [
    B("video_gallery", kicker="VİDEO ARŞİVİ", title="Sahadan Görüntüler", columns=3, items=[
        {"title": "Afrika Su Kuyusu Açılışı", "thumbnail_url": "/demo/water.webp", "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "duration": "03:20", "category": "Su Kuyusu"},
        {"title": "Kurban Bayramı Dağıtımları", "thumbnail_url": "/demo/kurban.webp", "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "duration": "04:15", "category": "Kurban"},
        {"title": "Yetimhane Eğitim Merkezimiz", "thumbnail_url": "/demo/orphan.webp", "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "duration": "02:50", "category": "Yetim"},
    ]),
])
_section("regions-world", "Bölge / Ülke Faaliyetleri", "Etki & güven", "Faaliyet gösterilen bölgeler ve proje sayıları.", [
    B("region_cards", kicker="KÜRESEL ETKİ", title="Ulaştığımız Coğrafyalar", look="cards", columns=4, items=[
        {"flag": "🇹🇷", "region": "Türkiye", "count": "81 İl", "unit": "Sosyal Yardım", "summary": "Aşevi, burs ve kış yardımları.", "image_url": "/demo/hands.webp"},
        {"flag": "🌍", "region": "Afrika", "count": "240+", "unit": "Su Kuyusu", "summary": "Çad, Tanzanya, Nijer, Somali.", "image_url": "/demo/water.webp"},
        {"flag": "🇵🇸", "region": "Gazze & Kudüs", "count": "45.000+", "unit": "Sıcak Yemek", "summary": "Günlük sıcak yemek ve sağlık.", "image_url": "/demo/relief.webp"},
        {"flag": "🇧🇩", "region": "Güney Asya", "count": "850+", "unit": "Yetim & Talebe", "summary": "Eğitim ve barınma desteği.", "image_url": "/demo/orphan.webp"},
    ]),
])
_section("sticky-story-mission", "Yapışkan Hikaye Akışı", "Metin & medya", "Solda sabit görsel, sağda kayan hikaye adımları.", [
    B("sticky_story", kicker="NASIL ÇALIŞIYORUZ?", title="Bağışınızın Yolculuğu", image_url="/demo/hands.webp", image_side="left", steps=[
        {"badge": "01. ADIM", "title": "Online veya Havale ile Bağış", "text": "Güvenli ödeme altyapısıyla saniyeler içinde bağışınızı tamamlayın.", "metric": "7/24 Aktif"},
        {"badge": "02. ADIM", "title": "Otomatik Makbuz & Takip Kodu", "text": "Bağışınız onaylandığı anda SMS ve portal üzerinden makbuzunuz oluşur.", "metric": "Anlık SMS"},
        {"badge": "03. ADIM", "title": "Sahada Teslimat & Görüntülü Rapor", "text": "Ekiplerimiz emanetinizi ihtiyaç sahiplerine ulaştırır ve fotoğraf/video ile belgeler.", "metric": "%100 Şeffaf"},
    ]),
])
_section("faq-searchable", "Aramalı Sık Sorulan Sorular", "SSS & iletişim", "İçinde arama yapılabilen modern SSS bloğu.", [
    B("faq", title="Merak Edilenler", look="searchable", items=[
        {"question": "Bağış makbuzumu nasıl alabilirim?", "answer": "<p>Ödeme tamamlandıktan hemen sonra SMS ile gelen bağlantıdan veya Bağışçı Paneli üzerinden makbuzunuzu indirebilirsiniz.</p>"},
        {"question": "Kurban kesim videosu ne zaman gönderilir?", "answer": "<p>Kurbanınız kesildiği gün içerisinde adına kesim videosu bağışçı panelinize ve SMS numaranıza iletilir.</p>"},
        {"question": "Düzenli bağış talimatımı iptal edebilir miyim?", "answer": "<p>Evet, dilediğiniz zaman Bağışçı Paneli'ndeki Düzenli Bağış sekmesinden tek tıkla iptal edebilirsiniz.</p>"},
    ]),
])
_section("faq-split", "Sol destek CTA + sağ akordeon (Split)", "SSS & iletişim", "Solda başlık ve iletişim butonu, sağda açılır-kapanır sorular.", [
    B("faq", kicker="DESTEK MERKEZİ", title="Aklınıza Takılanları Hemen Yanıtlayalım", text="Aradığınız yanıtı bulamazsanız bağışçı destek ekibimizle doğrudan iletişime geçebilirsiniz.", look="split", open_first=True, button_label="Bize Ulaşın", button_url="/iletisim", items=[
        {"question": "Online bağış güvenli mi?", "answer": "<p>Tüm kart işlemleri 256-Bit SSL şifreleme ve banka 3D Secure doğrulaması üzerinden yapılır.</p>"},
        {"question": "Bağışımın nereye ulaştığını nasıl takip ederim?", "answer": "<p>Kurban ve su kuyusu gibi projelerde SMS ve e-posta ile fotoğraf/video raporu gönderilir.</p>"},
        {"question": "Zekât ve fitre bağışları ayrı mı değerlendiriliyor?", "answer": "<p>Evet, zekât ve fitre fonları fıkhi şartlarına uygun ihtiyaç sahiplerine ayrı hesaplarda ulaştırılır.</p>"},
    ]),
])
_section("faq-categorized", "Kategorili / sekmeli SSS", "SSS & iletişim", "Kategori haplarıyla filtrelenebilen sık sorulan sorular.", [
    B("faq", kicker="YARDIM REHBERİ", title="Konuya Göre Sık Sorulan Sorular", look="categorized", open_first=True, items=[
        {"category": "Ödeme & Makbuz", "question": "Havale/EFT yaparken açıklama kısmına ne yazmalıyım?", "answer": "<p>Ad-soyad, telefon numaranız ve bağış türünü (ör. Su Kuyusu, Zekât) yazmanız yeterlidir.</p>"},
        {"category": "Ödeme & Makbuz", "question": "Resmi bağış makbuzumu nereden alabilirim?", "answer": "<p>İşlem sonrası SMS ile gelen bağlantıdan PDF olarak indirebilirsiniz.</p>"},
        {"category": "Kurban", "question": "Kurban kesim videosu ne zaman gelir?", "answer": "<p>Bayram günleri içinde kesim tamamlandığında videonuz SMS ile iletilir.</p>"},
        {"category": "Zekât & Fitre", "question": "Zekât nisabı nasıl hesaplanır?", "answer": "<p>85 gram altın değerinde birikiminizin %2,5'ini zekât hesaplayıcımızla kolayca bulabilirsiniz.</p>"},
    ]),
])
_section("faq-dark", "Koyu zemin SSS akordeonu", "SSS & iletişim", "Koyu kurumsal arka planlı akordeon soru listesi.", [
    B("faq", kicker="SSS", title="Sık Sorulan Sorular", look="dark_cards", open_first=True, items=[
        {"question": "Düzenli bağış talimatımı nasıl yönetebilirim?", "answer": "<p>Bağışçı panelinizden tutar güncelleyebilir veya tek tıkla durdurabilirsiniz.</p>"},
        {"question": "Kurumsal bağış makbuzu düzenleniyor mu?", "answer": "<p>Evet, şirketiniz adına vergi numarası içeren resmi bağış belgesi hazırlanır.</p>"},
    ]),
])
_section("features-bento", "Bento Özellikler", "Metin & medya", "Yumuşak arka planlı Bento kartlarıyla özellikler.", [
    B("features", kicker="NEDEN BİZ?", title="Güven ve Şeffaflık İlkelerimiz", look="bento", columns=3, items=[
        {"icon": "🧾", "title": "Doğrulanabilir Makbuz", "text": "Her bağış resmi makbuz numarasıyla sistemde kayıt altındadır."},
        {"icon": "📹", "title": "Görüntülü Geri Bildirim", "text": "Kurban ve su kuyusu projelerinde kişiye özel video paylaşımı."},
        {"icon": "🛡️", "title": "256-Bit SSL & Güvenli Ödeme", "text": "Banka altyapısı üzerinden 3D Secure ile güvenli işlem."},
    ]),
])
_section("features-split", "Split Özellikler (Sol Başlık + Sağ Kartlar)", "Özellikler", "Solda sabit başlık ve buton, sağda 2 sütunlu özellik kartları.", [
    B("features", kicker="NEDEN BİZ?", title="Her Bağışta Tam Şeffaflık", text="Sahadaki tüm projelerimizi ölçülebilir raporlarla bağışçılarımıza sunuyoruz.", look="split", columns=2, button_label="Raporları İncele", button_url="/hakkimizda", items=[
        {"icon": "💧", "badge": "AKTİF", "title": "Kalıcı Su Kuyuları", "text": "Açılan her kuyu GPS konumu ve video raporuyla teslim edilir."},
        {"icon": "📚", "title": "Eğitim Bursları", "text": "Öğrencilerin aylık burs takibi düzenli olarak yapılır."},
        {"icon": "🧾", "title": "Anında Dijital Makbuz", "text": "Ödeme sonrası SMS ve e-posta ile resmi makbuzunuz iletilir."},
        {"icon": "🛡️", "title": "Bağımsız Denetim", "text": "Tüm mali tablolar yıllık olarak bağımsız denetimden geçer."},
    ]),
])
_section("features-checklist", "Onay Listesi (✓ Maddeli)", "Özellikler", "Sıkı aralıklı onay işaretli avantaj listesi.", [
    B("features", kicker="GÜVENCE", title="Bağış Sürecinde Sizi Neler Bekliyor?", look="checklist", columns=2, align="left", items=[
        {"title": "3D Secure ile Güvenli Ödeme", "text": "Kart bilgileriniz saklanmadan banka altyapısı üzerinden işlem."},
        {"title": "Anlık SMS & E-Posta Bildirimi", "text": "Bağışınızın her aşamasında otomatik bilgilendirme."},
        {"title": "Video & Fotoğraf Raporu", "text": "Kurban ve su kuyusu projelerinde kişiye özel saha görüntüsü."},
        {"title": "İstediğiniz Zaman İptal", "text": "Düzenli bağış talimatınızı panelinizden tek tıkla yönetin."},
    ]),
])
_section("features-dark", "Koyu Zemin Özellik Kartları", "Özellikler", "Koyu kart tasarımlı modern özellik vitrini.", [
    B("features", kicker="KURUMSAL STANDART", title="Güçlü Altyapı, Kalıcı Etki", look="dark_cards", columns=3, icon_style="circle", items=[
        {"icon": "🌍", "badge": "35+ ÜLKE", "title": "Küresel Saha Ağı", "text": "Yerel partnerlerimizle kriz bölgelerine saatler içinde ulaşıyoruz."},
        {"icon": "📊", "title": "Canlı Etki Takibi", "text": "Projelerin ilerleme oranlarını şeffaf biçimde izleyebilirsiniz."},
        {"icon": "🤝", "title": "Gönüllü Koordinasyonu", "text": "Binlerce gönüllümüzle iyiliği düzenli ve sürdürülebilir kılıyoruz."},
    ]),
])
_section("features-strip", "Kompakt Güven Şeridi", "Özellikler", "Üst veya alt alanlar için 4'lü yatay güven çubuğu.", [
    B("features", look="compact_strip", columns=4, icon_style="circle", items=[
        {"icon": "🔒", "title": "256-Bit SSL", "text": "Güvenli ödeme altyapısı"},
        {"icon": "🧾", "title": "Resmi Makbuz", "text": "Anında dijital belge"},
        {"icon": "📹", "title": "Saha Videosu", "text": "Kişiye özel bilgilendirme"},
        {"icon": "📞", "title": "7/24 Destek", "text": "Bağışçı iletişim hattı"},
    ]),
])
_section("hero-split-form", "Kapak: Gömülü Bağış Formlu", "Kapak & Slider", "Tek ekranda sol mesaj + sağda doğrudan hızlı bağış formu.", [
    B("hero", variant="split_form", badge="GÜVENİLİR YARDIM", title="İyiliğe Hemen Ortak Olun", subtitle="Bağışınızı saniyeler içinde tamamlayın, makbuzunuz anında oluşsun.", image_url="/demo/hands.webp", show_form=False),
])
_section("hero-bento", "Kapak: Bento Mozaik", "Kapak & Slider", "Sol ana başlık yanında 3'lü Bento görsel ve istatistik vitrini.", [
    B("hero", variant="bento_hero", badge="KÜRESEL ETKİ", title="Birlikte Daha Çok Gönüle Dokunuyoruz", subtitle="Su kuyuları, yetim sponsorluğu ve acil yardım projelerimizle sahadayız.", image_url="/demo/water.webp", stat_value="320+", stat_label="Tamamlanan Proje", show_form=False),
])
_section("hero-floating", "Kapak: Yüzen Rozet + Hızlı Tutar", "Kapak & Slider", "Sağda görsel üstü istatistik rozeti ve hızlı bağış tutar butonları.", [
    B("hero", variant="split_floating", badge="ŞEFFAF DESTEK", title="Her Bağış Yeni Bir Umuttur", subtitle="İhtiyaç sahiplerine aracısız ve şeffaf şekilde ulaşıyoruz.", image_url="/demo/orphan.webp", quick_amounts="150, 300, 500, 1000", stat_value="12.400+", stat_label="Mutlu Bağışçı", show_form=False),
])
_section("hero-minimal-typo", "Kapak: Tipografi Odaklı Minimal", "Kapak & Slider", "Görselsiz, dev başlıklı sade editorial kapak.", [
    B("hero", variant="minimal_typo", badge="KURUMSAL VAKIF", title="İnsanlık İçin Kalıcı İyilik", subtitle="Eğitim, gıda ve temiz su projeleriyle geleceği birlikte inşa ediyoruz.", show_form=False),
])
_section("hero-duotone", "Kapak: Marka Renkli Duotone", "Kapak & Slider", "Marka renkleriyle gradyanlı modern tam genişlik kapak.", [
    B("hero", variant="duotone", badge="ACİL YARDIM", title="Zor Günlerde Yanınızdayız", subtitle="Gıda, sağlık ve barınma desteklerini hızla ulaştırıyoruz.", image_url="/demo/relief.webp", show_form=False),
])
_section("section-card", "Yüzen kart bölüm kapsayıcısı", "Düzen", "Gölgeli ve yuvarlatılmış kutu içinde düzenli bölüm alanı.", [
    B("section", look="card", tone="soft", width="boxed", padding_y="normal", gap=16, children=[
        heading("Öne Çıkan Duyuru veya Çalışma", level="h2", center=False),
        text("Bu kart kapsayıcısının içine dilediğiniz başlık, metin, görsel veya buton bloklarını ekleyebilirsiniz."),
    ]),
])
_section("section-wave-gradient", "Dalgalı gradyan bölüm", "Düzen", "Üstü ve altı dalga ayırıcılı, marka gradyanlı vurgulu bölüm.", [
    B("section", look="gradient", width="boxed", padding_y="spacious", gap=20, shape_top="wave", shape_bottom="wave", children=[
        heading("Birlikte Daha Güçlüyüz", level="h2", center=True),
        text("Şeffaf, hızlı ve kalıcı iyilik projelerimizle her gün binlerce aileye ulaşıyoruz.", text_align="center"),
    ]),
])
_section("section-narrow-reading", "Dar okuma bölümü", "Düzen", "Makale, manifesto ve sade açıklamalar için dar ortalı kapsayıcı.", [
    B("section", look="bordered", tone="light", width="narrow", padding_y="normal", gap=14, children=[
        heading("Şeffaflık ve Hesap Verebilirlik İlkesi", level="h2", center=False),
        text("Tüm bağış süreçlerimiz bağımsız denetim ilkelerine uygun olarak kayıt altına alınır ve düzenli faaliyet raporlarıyla kamuoyuna sunulur."),
    ]),
])
_section("section-pattern-dark", "Desenli koyu kurumsal bölüm", "Düzen", "Hafif geometrik nokta dokulu koyu zeminli kapsayıcı.", [
    B("section", look="pattern", tone="dark", width="boxed", padding_y="spacious", gap=18, children=[
        heading("Kurumsal Destek ve İş Birliği", level="h2", center=False),
        text("Vakıf ve dernek projelerimize kurumsal sponsorluk veya düzenli bağışlarla katkı sağlayabilirsiniz."),
    ]),
])
_section("columns-cards-3", "3'lü eşit kart sütunları", "Düzen", "Eşit yükseklikte gölgeli 3 kart sütunu.", [
    B("columns", ratio="1-1-1", card_style="cards", gap=24, children=[
        B("column", children=[heading("Şeffaf Süreç", level="h3", center=False), text("Her bağış kayıt altına alınır ve makbuzlanır.")]),
        B("column", children=[heading("Hızlı Ulaşım", level="h3", center=False), text("Saha ekiplerimiz desteği doğrudan ulaştırır.")]),
        B("column", children=[heading("Düzenli Rapor", level="h3", center=False), text("Tamamlanan projeler görselleriyle paylaşılır.")]),
    ]),
])
_section("columns-divided-3", "Ayraçlı 3'lü bilgi sütunu", "Düzen", "Aralarında dikey çizgi bulunan 3 sütunlu özet satırı.", [
    B("columns", ratio="1-1-1", card_style="divided", gap=24, children=[
        B("column", children=[heading("42 Ülke", level="h3", center=False), text("Dünya genelinde aktif saha çalışması.")]),
        B("column", children=[heading("180+ Proje", level="h3", center=False), text("Eğitim, su kuyusu ve gıda yardımları.")]),
        B("column", children=[heading("7/24 Destek", level="h3", center=False), text("Bağışçı danışma hattımızla yanınızdayız.")]),
    ]),
])
_section("columns-sidebar-left", "Sol menü + geniş içerik (1/4 + 3/4)", "Düzen", "Sol tarafta dar bilgi/kart, sağda geniş içerik sütunu.", [
    B("columns", ratio="1-3", gap=32, children=[
        B("column", look="soft", padding="md", children=[heading("Hızlı Bilgi", level="h3", center=False), text("Hafta içi 09:00 - 18:00 arası bize ulaşabilirsiniz.")]),
        B("column", children=[heading("Çalışma İlkelerimiz", level="h2", center=False), text("İhtiyaç sahiplerinin onurunu koruyan, kalıcı ve sürdürülebilir projeler üretiyoruz.")]),
    ]),
])
_section("columns-asymmetric", "Asimetrik 2/5 + 3/5 sütun", "Düzen", "Solda vurgulu koyu kutu, sağda ana açıklama.", [
    B("columns", ratio="2-3", gap=28, valign="stretch", children=[
        B("column", look="dark", padding="lg", valign="center", children=[heading("Birlikte Başarabiliriz", level="h3", center=False), text("Küçük bir destekle büyük bir değişimin parçası olun.")]),
        B("column", look="bordered", padding="lg", valign="center", children=[heading("Sürdürülebilir İyilik Modeli", level="h2", center=False), text("Bağışlarınızı yalnızca anlık ihtiyaçlar için değil, eğitim ve temiz su gibi kalıcı çözümler için değerlendiriyoruz.")]),
    ]),
])
_section("location-map", "Konum & Harita", "SSS & iletişim", "Dernek merkezi konumu ve yol tarifi bağlantısı.", [
    B("map", kicker="ZİYARET EDİN", title="Genel Merkez Konumumuz", text="Hafta içi 09:00 - 18:00 saatleri arasında merkezimizi ziyaret edebilirsiniz.", address="Fatih, İstanbul", height=380, zoom=15, show_directions=True),
])
_section("reports-downloads", "Faaliyet Raporları & Belgeler", "Etki & güven", "İndirilebilir PDF raporlar ve mali şeffaflık belgeleri.", [
    B("downloads", kicker="ŞEFFAFLIK", title="Faaliyet Raporları ve Belgeler", text="Tüm dönem raporlarımızı ve denetim belgelerimizi inceleyebilirsiniz.", columns=2, items=[
        {"title": "2025 Yılı Faaliyet Raporu", "description": "Yıl boyunca ulaşılan aile, proje ve bölge özetleri.", "file_url": "/belgeler/faaliyet-raporu.pdf", "file_type": "PDF", "file_size": "2.4 MB"},
        {"title": "Bağımsız Mali Denetim Raporu", "description": "Gelir-gider tabloları ve bağış kullanım oranları.", "file_url": "/belgeler/mali-rapor.pdf", "file_type": "PDF", "file_size": "1.1 MB"},
    ]),
])
_section("newsletter-band", "E-Bülten Abonelik Bandı", "Çağrı", "Ziyaretçilerin e-posta ile bültene abone olmasını sağlar.", [
    B("newsletter", kicker="HABERDAR OLUN", title="İyilik Haberlerini E-Postanıza Alın", text="Yeni kampanyalarımızdan ve saha raporlarımızdan aylık bültenle haberdar olun.", placeholder="E-posta adresiniz", button_label="Abone Ol", privacy_note="KVKK kapsamında verileriniz güvendedir.", band="soft"),
])
_section("principles-icon-list", "Öne Çıkan İlkeler (İkonlu Liste)", "Özellikler", "Kurumsal ilkeler ve güven maddeleri listesi.", [
    B("icon_list", kicker="NEDEN BİZ?", title="Çalışma İlkelerimiz", columns=2, items=[
        {"icon": "✓", "title": "%100 Şeffaf Süreç", "text": "Her bağış kayıt altına alınır ve makbuzla belgelenir."},
        {"icon": "🌍", "title": "Doğrudan Saha Ekipleri", "text": "Yardımlar aracı olmadan ihtiyaç sahiplerine ulaştırılır."},
        {"icon": "📸", "title": "Görsel Raporlama", "text": "Tamamlanan projeler fotoğraf ve video ile paylaşılır."},
        {"icon": "🛡️", "title": "Güvenli Altyapı", "text": "256-bit SSL korumalı güvenli ödeme ve veri gizliliği."},
    ]),
])

SECTION_BY_KEY = {s["key"]: s for s in SECTIONS}


def _blocks(*keys: str) -> list:
    return [b for key in keys for b in SECTION_BY_KEY[key]["blocks"]]


def _page_hero(title: str, kicker: str, image: str) -> dict:
    return B("banner", layout="image", image_url=image, kicker=kicker, title=title, align="center", style={"desktop": {"min_height": 320}})


# --- Page templates --------------------------------------------------------------------

PAGE_TEMPLATES: list[dict] = [
    {"key": "about", "label": "Hakkımızda", "slug": "hakkimizda-sayfasi", "description": "Tanıtım, misyon, rakamlar, yorumlar ve çağrı.",
     "blocks": [_page_hero("Hakkımızda", "KURUMUMUZ", "/demo/mosque.webp"), *_blocks("about", "mission-3", "stats-dark", "testimonials", "cta-pattern")]},
    {"key": "campaign-landing", "label": "Kampanya açılış sayfası", "slug": "kampanya", "description": "Kapak, bağış formu, hikaye, etki ve SSS.",
     "blocks": _blocks("hero-split", "donate-band", "story", "stats-dark", "faq", "cta-band")},
    {"key": "ramadan", "label": "Ramazan", "slug": "ramazan", "description": "Ramazan kapağı, kategoriler, zekat ve kampanyalar.",
     "blocks": _blocks("hero-mosque", "categories", "zakat", "campaigns-grid", "faq")},
    {"key": "contact", "label": "İletişim", "slug": "bize-ulasin", "description": "İletişim kartları, SSS ve güven bandı.",
     "blocks": [_page_hero("Bize ulaşın", "İLETİŞİM", "/demo/pattern.webp"), *_blocks("contact", "faq", "trust")]},
    {"key": "volunteer", "label": "Gönüllü ol", "slug": "gonullu-ol", "description": "Gönüllülük çağrısı, alanlar ve SSS.",
     "blocks": [*_blocks("volunteer"),
                section([heading("Nerelerde gönüllü olabilirsiniz?", kicker="ALANLAR"),
                         card_columns("1-1-1", [card("Saha", "Dağıtım, kurban organizasyonu ve afet bölgesi çalışmaları.", "🚚"),
                                                card("Eğitim", "Öğrencilere ders desteği ve mentorluk.", "📚"),
                                                card("Dijital", "Tasarım, sosyal medya ve çeviri desteği.", "💻")])]),
                *_blocks("testimonials")]},
    {"key": "transparency", "label": "Şeffaflık", "slug": "seffaflik", "description": "Güvence maddeleri, rakamlar ve SSS.",
     "blocks": [_page_hero("Şeffaflık ve hesap verebilirlik", "GÜVEN", "/demo/pattern.webp"), *_blocks("text-center", "values-4", "stats-auto", "faq")]},
]

_KURBAN_FAQ = B("faq", title="Kurban hakkında sık sorulanlar", items=[
    {"question": "Vekaleti nasıl veriyorum?", "answer": "Bağış formundaki onay kutusunu işaretlemeniz vekalet yerine geçer."},
    {"question": "Kesim ne zaman yapılıyor?", "answer": "Kurbanlar bayramın ilk üç günü içinde, İslami usullere uygun kesilir."},
    {"question": "Kesim videosu geliyor mu?", "answer": "Evet. Kesim sırasında isminiz okunur; video ve bilgilendirme mesajı telefonunuza gönderilir."},
    {"question": "Hisseli kurbana girebilir miyim?", "answer": "Büyükbaş kurbanlarda 1'den 7'ye kadar hisse alabilirsiniz."},
    {"question": "Adak ve akika kurbanı kesiyor musunuz?", "answer": "Evet; adak, akika ve şükür kurbanlarınızı yıl boyunca kesiyoruz."},
])

PAGE_TEMPLATES += [
    {"key": "kurban", "label": "Kurban", "slug": "kurban", "description": "Kurban slider'ı, geri sayım, adımlar, sayaçlar ve SSS.",
     "blocks": [*_blocks("slider-kurban", "countdown-kurban", "steps", "donation-cards", "counters-plain"), _KURBAN_FAQ, *_blocks("bank-accounts")]},
    {"key": "bank", "label": "Hesap numaraları", "slug": "hesap-numaralari", "description": "IBAN kartları, açıklama notu ve iletişim.",
     "blocks": [_page_hero("Hesap numaralarımız", "HAVALE / EFT", "/demo/pattern.webp"), *_blocks("bank-accounts", "features-why", "contact")]},
    {"key": "history", "label": "Tarihçe", "slug": "tarihce", "description": "Zaman çizelgesi, alıntı ve sayaçlar.",
     "blocks": [_page_hero("Tarihçemiz", "KURUMSAL", "/demo/ramadan.webp"), *_blocks("timeline-history", "quote-verse", "counters-band", "cta-pattern")]},
    {"key": "team", "label": "Ekibimiz", "slug": "ekibimiz", "description": "Yönetim kurulu, değerler ve gönüllü çağrısı.",
     "blocks": [_page_hero("Ekibimiz", "KURUMSAL", "/demo/hands.webp"), *_blocks("team-board", "mission-3", "volunteer")]},
    {"key": "report", "label": "Faaliyet raporu", "slug": "faaliyet-raporu", "description": "Sayaçlar, hedef çubukları, kullanım dağılımı ve galeri.",
     "blocks": [_page_hero("2026 faaliyet raporu", "ŞEFFAFLIK", "/demo/pattern.webp"), *_blocks("counters-plain", "progress-targets", "features-use", "gallery-grid", "logos-partners")]},
    {"key": "faq", "label": "Sık sorulan sorular", "slug": "sss", "description": "SSS, bilgi akordeonu ve mesaj formu.",
     "blocks": [_page_hero("Sık sorulan sorular", "YARDIM", "/demo/pattern.webp"), *_blocks("faq", "tabs-accordion", "contact-form")]},
    {"key": "winter", "label": "Kış yardımı kampanyası", "slug": "kis-yardimi", "description": "Kış slider'ı, hedefler, bağış bandı ve yorumlar.",
     "blocks": _blocks("slider-winter", "progress-targets", "donate-band", "features-work", "testimonials-block", "cta-band")},
    {"key": "water", "label": "Su kuyusu kampanyası", "slug": "su-kuyusu", "description": "Kapak, hikaye, sayaçlar, galeri ve SSS.",
     "blocks": [B("banner", layout="image", image_url="/demo/water.webp", kicker="SU KUYUSU", title="Bir kuyu, bir köyün hayatını değiştirir",
                  text="Adınıza ya da sevdikleriniz adına kuyu açtırın.", button_label="Kuyu açtır", button_url="/kampanyalar", style={"desktop": {"min_height": 480}}),
                *_blocks("story", "counters-plain", "donate-band", "gallery-grid", "faq")]},
    {"key": "activities", "label": "Faaliyetlerimiz", "slug": "faaliyetlerimiz", "description": "Çalışma alanları, sekmeler, haberler ve galeri.",
     "blocks": [_page_hero("Faaliyetlerimiz", "SAHADAN", "/demo/relief.webp"), *_blocks("features-work", "tabs-activities", "news", "gallery-strip")]},
    {"key": "orphan-sponsorship", "label": "Yetim sponsorluğu", "slug": "yetim-sponsorlugu", "description": "Yetim slider'ı, sponsorluk adımları, hikayeler ve bağış kartları.",
     "blocks": _blocks("slider-stacked-impact", "steps", "carousel-featured-2", "donation-cards", "testimonials-block", "faq")},
    {"key": "zakat-guide", "label": "Zekat & fitre rehberi", "slug": "zekat-rehberi", "description": "Zekat bandı, ayet, akordeon bilgi, bağış kartları ve SSS.",
     "blocks": [_page_hero("Zekat ve Fitre", "İBADET & PAYLAŞIM", "/demo/mosque.webp"), *_blocks("zakat", "quote-verse", "tabs-accordion", "donation-cards", "faq")]},
    {"key": "projects-showcase", "label": "Projeler vitrini", "slug": "projelerimiz", "description": "Sekmeli slider, 3'lü ve 4'lü proje carousel'leri, hedefler ve galeri.",
     "blocks": _blocks("slider-tabs-projects", "carousel-projects-3", "carousel-overlay-4", "progress-targets", "carousel-gallery")},
]

# "Hayır Kapısı" (HAKDER look): its own pages join the page templates.
_HK = hayir_kapisi()
_HK_PAGE_KEYS = []
for _slug, (_title, _page_blocks) in _HK["pages"].items():
    _HK_PAGE_KEYS.append(f"hk-{_slug}")
    PAGE_TEMPLATES.append({"key": f"hk-{_slug}", "label": _title, "slug": _slug, "description": f"Hayır Kapısı demosu: {_title}.", "blocks": _page_blocks})

# Every part of the Hayır Kapısı site is also a section of its own, so it can be mixed into other designs.
_HK_PARTS = (
    ("hk-slider", "Poster slider", "Yuvarlak köşeli, kutulu büyük slider."),
    ("hk-edevlet", "e-Devlet sorgulama bandı", "Gül kırmızısı ince bilgi bandı."),
    ("hk-stats", "İkonlu istatistik kartı", "Kampanya, bağışçı, yardım ve gönüllü sayıları tek kartta."),
    ("hk-cards", "Sepetli bağış kartları", "Başlık + kaydırmalı bağış kartları (tutar, adet, sepete ekle)."),
    ("hk-testimonials", "Bağışçılarımız anlatıyor", "Yeşil zeminde kaydırmalı teşekkür mesajları."),
    ("hk-contact", "Görselli mesaj formu", "Rozetli görsel ve mesaj formu."),
    ("hk-news", "Faaliyetler karuseli", "Tarih rozetli, kaydırmalı faaliyet kartları."),
)
for (_key, _label, _description), _block in zip(_HK_PARTS, _HK["home"]):
    _section(_key, _label, "Hayır Kapısı", _description, [_block])
_section("hk-header", "Hayır Kapısı header", "Header", "Duyuru çubuğu, yeşil bilgi bandı, mega menü ve iki butonlu header.", _HK["header"], kind="header")
_section("hk-footer", "Hayır Kapısı footer", "Footer", "Dört sütun, Çağrı Merkezi kutusu, alt menü ve telefon alt çubuğu.", _HK["footer"], kind="footer")

_section("slider-floating-donate", "Hızlı Bağış Kartlı Slider", "Hero", "Slayt üzerinde sağda yüzen tutar seçicili hızlı bağış kartı.", [
    B("slider", layout="floating_donate", height="lg", nav="progress", autoplay=True, slides=[
        {"image_url": "/demo/water.webp", "badge": "ACİL YARDIM", "title": "Bir Damla Hayat Olun", "text": "Temiz suya erişemeyen köylerde kalıcı su kuyuları açıyoruz.", "button_url": "/bagis/su-kuyusu", "button_label": "Bağış Yap", "quick_amounts": "250,500,1000,2500"},
        {"image_url": "/demo/orphan.webp", "badge": "YETİM SPONSORLUĞU", "title": "Bir Yetimin Yüzü Gülsün", "text": "Eğitim, gıda ve barınma desteğiyle yanlarındayız.", "button_url": "/bagis", "button_label": "Sponsor Ol", "quick_amounts": "500,1000,2000"},
    ]),
])
_section("slider-spotlight", "Koyu Vitrin Çerçeveli Slider", "Hero", "Koyu zemin üzerinde çerçeveli modern slider vitrini.", [
    B("slider", layout="spotlight", height="lg", nav="numbers", autoplay=True, slides=[
        {"image_url": "/demo/relief.webp", "badge": "İNSANİ YARDIM", "title": "Sofralara Bereket Taşıyoruz", "text": "Gıda kolileri ve sıcak yemek dağıtımlarıyla ihtiyaç sahiplerinin yanındayız.", "button_url": "/bagis", "button_label": "Destek Ol"},
        {"image_url": "/demo/education.webp", "badge": "EĞİTİM", "title": "İlimle Yetişen Nesiller", "text": "Öğrencilerimize burs ve eğitim materyali desteği sağlıyoruz.", "button_url": "/bagis/egitim", "button_label": "Burs Ver"},
    ]),
])
_section("carousel-story-916", "9:16 Dikey Hikaye Kartları", "Carousel", "Instagram/Shorts tarzı dikey 9:16 saha hikayeleri ve video kartları.", [
    B("carousel", look="story_916", kicker="SAHADAN HİKAYELER", title="İyilik Yolculuğumuzdan Kareler", columns=4, items=[
        {"image_url": "/demo/water.webp", "badge": "Su Kuyusu", "title": "Çad Su Kuyusu Açılışı", "button_label": "İncele", "button_url": "/bagis"},
        {"image_url": "/demo/orphan.webp", "badge": "Yetim", "title": "Bayramlık Sevinci", "button_label": "Destek Ol", "button_url": "/bagis"},
        {"image_url": "/demo/relief.webp", "badge": "Gıda", "title": "Sıcak Yemek Dağıtımı", "button_label": "Katkı Sağla", "button_url": "/bagis"},
        {"image_url": "/demo/education.webp", "badge": "Eğitim", "title": "Medrese Bursları", "button_label": "Burs Ver", "button_url": "/bagis"},
    ]),
])
_section("carousel-polaroid", "Polaroid Hatıra Kartları", "Carousel", "Hafif açılı fotoğraf albümü tarzı proje ve faaliyet kartları.", [
    B("carousel", look="polaroid", kicker="FAALİYETLERİMİZ", title="Sahadan Anılar", columns=3, items=[
        {"image_url": "/demo/water.webp", "title": "Afrika Su Kuyuları", "subtitle": "120+ Köy", "text": "Temiz suya kavuşan yüzlerce aile."},
        {"image_url": "/demo/orphan.webp", "title": "Yetim Hamiliği", "subtitle": "Aylık Destek", "text": "Düzenli eğitim ve yaşam desteği."},
        {"image_url": "/demo/relief.webp", "title": "Acil Gıda Yardımı", "subtitle": "Kriz Bölgeleri", "text": "Hızlı ulaşan temel gıda paketleri."},
    ]),
])
_section("stats-bento-dark", "Koyu Bento İstatistikler", "Güven", "Koyu zemin üzerinde büyük vurgulu etki sayıları.", [
    B("stats", variant="bento_dark", mode="manual", kicker="ŞEFFAF ETKİ", title="Sizinle Büyüyen İyilik", items=[
        {"value": "120", "suffix": "+", "label": "Açılan Su Kuyusu"},
        {"value": "4500", "suffix": "+", "label": "Düzenli Desteklenen Yetim"},
        {"value": "85000", "label": "Ulaştırılan Gıda Paketi"},
        {"value": "18", "label": "Aktif Yardım Bölgesi"},
    ]),
])
_section("slider-split-dark", "Koyu 2 Sütun Hero Slider", "Hero", "Koyu zeminli iki sütun vitrin slider.", [
    B("slider", layout="split_dark", height="lg", autoplay=True, slides=[
        {"image_url": "/demo/water.webp", "badge": "SU KUYUSU", "title": "Temiz Suya Açılan Kapı", "text": "Kurak bölgelerde kalıcı su kuyuları açarak yüzlerce aileye umut oluyoruz.", "button_url": "/bagis/su-kuyusu", "button_label": "Bağış Yap"},
        {"image_url": "/demo/education.webp", "badge": "EĞİTİM", "title": "Geleceği İlimle İnşa Edin", "text": "Öğrencilerimize burs ve eğitim materyali desteği sağlıyoruz.", "button_url": "/bagis/egitim", "button_label": "Burs Ver"},
    ]),
])
_section("slider-grid-collage", "3'lü Mozaik Kolaj Slider", "Hero", "Sol başlık + sağda 3'lü asimetrik fotoğraf kolajı.", [
    B("slider", layout="grid_collage", height="lg", autoplay=True, slides=[
        {"image_url": "/demo/orphan.webp", "badge": "YETİM DESTEĞİ", "title": "Her Çocuk Gülümsemeyi Hak Eder", "text": "Yetim yavrularımızın eğitim, gıda ve giyim ihtiyaçlarını karşılıyoruz.", "button_url": "/bagis", "button_label": "Sponsor Ol"},
        {"image_url": "/demo/relief.webp", "badge": "ACİL YARDIM", "title": "Kriz Bölgelerine Hızlı Destek", "text": "Sıcak yemek ve temel gıda kolilerini ihtiyaç sahiplerine ulaştırıyoruz.", "button_url": "/bagis", "button_label": "Destek Ol"},
        {"image_url": "/demo/water.webp", "badge": "SU KUYUSU", "title": "Bir Kuyu, Bin Hayat", "text": "Temiz suya erişemeyen köyler için kalıcı çözümler üretiyoruz.", "button_url": "/bagis/su-kuyusu", "button_label": "Katkı Sağla"},
    ]),
])
_section("carousel-quote-card", "Tırnaklı Hikaye & Referans Carousel", "Carousel", "Büyük tırnak ikonlu bağışçı ve saha hikayesi kartları.", [
    B("carousel", look="quote_card", kicker="SAHADAN SESLER", title="İyiliğin Hikayeleri", columns=3, items=[
        {"title": "Köyümüze ilk kez temiz su geldi", "subtitle": "Çad Su Kuyusu Projesi", "text": "Çocuklarımız artık kilometrelerce yürümek zorunda kalmıyor.", "rating": 5},
        {"title": "Eğitim bursumla üniversiteyi kazandım", "subtitle": "İlim Bursu Öğrencisi", "text": "Destek veren tüm hayırseverlere gönülden teşekkür ederim.", "rating": 5},
        {"title": "Kurban hissemizin videosunu aynı gün izledik", "subtitle": "Bağışçı · İstanbul", "text": "Şeffaf ve güvenilir süreç için teşekkür ederiz.", "rating": 5},
    ]),
])
_section("banner-floating-card", "Yüzen Kartlı Modern Banner", "Banner", "Tam genişlik görsel üzerinde sağda yüzen cam/beyaz kart.", [
    B("banner", layout="floating_card", kicker="RAMAZAN & ZEKAT", title="Zekatlarınız Emanetimizdir", text="İhtiyaç sahiplerine ulaştırılan her kuruş şeffaf makbuzlarla kayıt altındadır.", button_label="Zekat Hesapla", button_url="/zekat-hesapla", image_url="/demo/relief.webp"),
])
_section("steps-zigzag", "Zikzak Bağış Adımları", "Güven", "Sağlı-sollu dönüşümlü modern bağış adımları.", [
    B("steps", look="zigzag", kicker="NASIL ÇALIŞIR?", title="4 Adımda Güvenli Bağış"),
])
_section("testimonials-masonry", "Sosyal Duvar Teşekkür Mesajları", "Güven", "Çok sütunlu modern bağışçı yorum duvarı.", [
    B("testimonials", look="masonry", kicker="SİZDEN GELENLER", title="Bağışçılarımız Ne Diyor?"),
])
_section("pricing-impact", "Somut Etki Karşılığı Paketler", "Bağış", "Her bağış tutarının somut karşılığını gösteren paket kartları.", [
    B("pricing_tiers", look="impact_equivalents", kicker="ETKİ KARŞILIĞI", title="Bağışınız Neye Dönüşür?", columns=3, items=[
        {"amount": "500 ₺", "title": "1 Aylık Gıda Kolisi", "description": "Bir ailenin temel mutfak ihtiyacını karşılar.", "button_label": "Destek Ol", "button_url": "/bagis?tutar=500"},
        {"amount": "1.500 ₺", "title": "1 Yetim Eğitim Bursu", "description": "Bir öğrencinin kırtasiye ve eğitim giderlerini destekler.", "button_label": "Destek Ol", "button_url": "/bagis?tutar=1500", "highlighted": True},
        {"amount": "5.000 ₺", "title": "Temiz Su Hissesi", "description": "Kurak bölgelerde su kuyusu inşasına hisse katkısı sağlar.", "button_label": "Destek Ol", "button_url": "/bagis?tutar=5000"},
    ]),
])
_section("bento-magazine", "Asimetrik Bento Dergi Vitrini", "Medya", "Büyük manşet kutusu ve yanında destekleyici proje kutuları.", [
    B("bento_grid", look="magazine_asymmetric", kicker="ÖNE ÇIKAN PROJELER", title="Sahadaki Çalışmalarımız", items=[
        {"image_url": "/demo/water.webp", "badge": "SU KUYUSU", "title": "Afrika ve Asya'da Temiz Su", "text": "Bugüne kadar 1.200'den fazla kuyu açıldı."},
        {"tone": "brand", "badge": "YETİM", "title": "Yetim Sponsorluğu", "text": "Aylık düzenli eğitim ve gıda desteği."},
        {"tone": "soft", "badge": "SAĞLIK", "title": "Katarakt Ameliyatları", "text": "Yeniden görmeye vesile olun."},
    ]),
])
_section("bank-qr", "QR Kodlu Banka Hesapları", "Bağış", "FAST / IBAN QR kodlu modern banka hesap kartları.", [
    B("bank_accounts", look="qr_showcase", kicker="HAVALE / EFT / FAST", title="Resmi Banka Hesaplarımız", items=[
        {"bank": "Kuveyt Türk", "holder": "Dernek Genel Merkezi", "iban": "TR00 0020 5000 0000 0000 0000 01", "currency": "TRY"},
        {"bank": "Ziraat Katılım", "holder": "Dernek Genel Merkezi", "iban": "TR00 0020 9000 0000 0000 0000 02", "currency": "TRY"},
    ]),
])
_section("video-reels", "Dikey Saha Reels Galerisi", "Medya", "9:16 dikey kısa saha videoları ızgarası.", [
    B("video_gallery", layout="reels_vertical", kicker="SAHADAN KISA VİDEOLAR", title="Anlık İyilik Hikayeleri", items=[
        {"title": "Çad Su Kuyusu Açılışı", "thumbnail_url": "/demo/water.webp", "duration": "00:45"},
        {"title": "Ramazan Kumanya Dağıtımı", "thumbnail_url": "/demo/relief.webp", "duration": "00:58"},
        {"title": "Yetim Okul Şenliği", "thumbnail_url": "/demo/orphan.webp", "duration": "01:12"},
    ]),
])
_section("region-metrics", "Ülke Bazlı Etki Rakamları", "Güven", "Faaliyet gösterilen ülke ve bölgelerdeki dev etki sayıları.", [
    B("region_cards", look="world_metrics", kicker="KÜRESEL ETKİ", title="Nerelerde Çalışıyoruz?", columns=4, items=[
        {"flag": "🇹🇷", "region": "Türkiye", "count": "81", "unit": "İl Yardım Ağı"},
        {"flag": "🇵🇸", "region": "Gazze", "count": "120.000+", "unit": "Sıcak Yemek"},
        {"flag": "🇹🇩", "region": "Çad", "count": "420", "unit": "Su Kuyusu"},
        {"flag": "🇸🇾", "region": "Suriye", "count": "8.500", "unit": "Aile Desteği"},
    ]),
])
_section("downloads-shelf", "Faaliyet Raporu Yayın Rafı", "Güven", "Şeffaflık ve yıllık faaliyet raporları indirme rafı.", [
    B("downloads", look="shelf", kicker="ŞEFFAFLIK", title="Faaliyet ve Denetim Raporları", columns=2, items=[
        {"title": "2025 Yıllık Faaliyet Raporu", "description": "Tüm saha projeleri ve mali özetler.", "file_type": "PDF", "file_size": "3.2 MB", "file_url": "/raporlar"},
        {"title": "Bağımsız Denetim Beyannamesi", "description": "DERBİS ve mali denetim özeti.", "file_type": "PDF", "file_size": "1.8 MB", "file_url": "/raporlar"},
    ]),
])
_section("newsletter-inline", "Tek Satır E-Bülten Bandı", "İletişim", "Başlık solda, e-posta abonelik formu sağda yatay bant.", [
    B("newsletter", look="inline_bar", kicker="E-BÜLTEN", title="İyilik Haberlerinden Haberdar Olun", text="Aylık saha raporları ve acil yardım duyuruları e-postanıza gelsin."),
])
_section("cta-whatsapp", "WhatsApp Hızlı Destek Bandı", "Banner", "Tek tıkla WhatsApp bağış hattına yönlendiren aksiyon bandı.", [
    B("cta_band", look="whatsapp_direct", kicker="CANLI DESTEK", title="Sorularınız İçin WhatsApp Hattımız", text="Kurban, zekat ve düzenli bağış süreçleri hakkında anında bilgi alın.", button_label="WhatsApp ile Yazın", button_url="/iletisim"),
])
_section("zakat-nisab", "Nisap Göstergeli Zekat Bandı", "Bağış", "Altın/gümüş nisap eşiği rozetiyle hızlı zekat hesaplama bandı.", [
    B("zakat_band", look="nisab_ticker", kicker="ZEKAT REHBERİ", title="Zekatınızı Kolayca Hesaplayın"),
])
_section("hero-search", "Aramalı & Kategorili Kapak", "Kapak", "Kampanya arama çubuğu ve hızlı kategori etiketli açılış kapağı.", [
    B("hero", variant="full_search_hero", badge="GÜVENİLİR YARDIM", title="İyiliğe Ulaşmanın En Hızlı Yolu", subtitle="Destek olmak istediğiniz projeyi veya bölgeyi hemen arayın."),
])
_section("live-donations-feed", "Canlı Bağış Akışı", "Güven", "Son bağışları sosyal kanıt olarak listeleyen canlı akış.", [
    B("live_donations", look="feed_cards", kicker="CANLI AKIŞ", title="Son Bağışlar", items=[
        {"donor": "Ahmet Y.", "amount": "500 ₺", "campaign": "Su Kuyusu Projesi", "time_ago": "3 dk önce", "city": "İstanbul"},
        {"donor": "Fatma K.", "amount": "1.500 ₺", "campaign": "Yetim Sponsorluğu", "time_ago": "12 dk önce", "city": "Ankara"},
        {"donor": "Mehmet A.", "amount": "750 ₺", "campaign": "Gıda Kolisi", "time_ago": "28 dk önce", "city": "Bursa"},
    ]),
])
_section("fidyah-calc", "Fitre / Fidye Hesaplayıcı", "Bağış", "Kişi ve gün sayısına göre fitre/fidye tutarını hesaplayan araç.", [
    B("fidyah_calculator", look="split_explainer", kicker="RAMAZAN HESAPLAMA", title="Fitre ve Fidye Hesaplayın", unit_amount=180, default_people=1, default_days=30),
])
_section("transparency-seals", "Resmi İzin & Şeffaflık Bandı", "Güven", "Valilik izni, DERBİS kodu ve fon dağılım oranlarını gösteren güven bandı.", [
    B("transparency_bar", look="ledger_summary", kicker="ŞEFFAFLIK", title="Her Kuruş Kayıt Altında", permit_no="34-2025/128", field_pct=92, ops_pct=8),
])
_section("audio-studio", "Ses / Sohbet Oynatıcı", "Medya", "Tilavet ve saha röportajları için gömülü ses oynatıcı.", [
    B("audio_player", look="playlist_card", kicker="SES ARŞİVİ", title="Sohbetler ve Saha Sesleri", items=[
        {"title": "Ramazan ve İnfak Bilinci", "speaker": "Kurumsal Sohbetler", "duration": "14:20"},
    ]),
])
_section("volunteer-roles", "Gönüllü Başvuru & Roller", "İletişim", "Gönüllü görev alanlarını tanıtan ve başvuruya yönlendiren blok.", [
    B("volunteer_cta", look="role_cards", kicker="GÖNÜLLÜ OLUN", title="İyilik Ekibimize Katılın", items=[
        {"icon": "📦", "title": "Lojistik & Dağıtım", "text": "Koli hazırlama ve saha dağıtım organizasyonlarında yer alın."},
        {"icon": "📸", "title": "Medya & İletişim", "text": "Fotoğraf, video ve içerik üretimiyle iyiliği duyurun."},
        {"icon": "🎓", "title": "Eğitim & Rehberlik", "text": "Öğrenci ve yetim etkinliklerine gönüllü destek verin."},
    ]),
])
_section("press-wall", "Basında Biz", "Güven", "Haber kanalları ve basında yer alan kurum haberleri.", [
    B("press_mentions", look="newspaper_cards", kicker="BASINDA BİZ", title="Haberlerde Kurumumuz", items=[
        {"outlet": "Ulusal Haber", "quote": "Afrika'da 400'üncü temiz su kuyusu törenle hizmete açıldı.", "date": "2026"},
        {"outlet": "İyilik Bülteni", "quote": "Şeffaf bağış takibiyle binlerce yetime düzenli burs ulaştırılıyor.", "date": "2026"},
    ]),
])
_section("impact-proof", "Saha Dağıtım Kanıtları", "Güven", "Fotoğraflı ve konum bazlı tamamlanan dağıtım raporları.", [
    B("impact_reports", look="proof_grid", kicker="SAHADAN KANITLAR", title="Tamamlanan Dağıtımlar", columns=3, items=[
        {"image_url": "/demo/relief.webp", "location": "Gazze", "date": "Mart 2026", "beneficiaries": "2.400 Aile", "title": "Sıcak Yemek ve Gıda Kolisi Dağıtımı"},
        {"image_url": "/demo/water.webp", "location": "Çad", "date": "Şubat 2026", "beneficiaries": "1.800 Kişi", "title": "Güneş Enerjili Su Kuyusu Açılışı"},
        {"image_url": "/demo/orphan.webp", "location": "Türkiye", "date": "Ocak 2026", "beneficiaries": "650 Öğrenci", "title": "Kışlık Kıyafet ve Kırtasiye Desteği"},
    ]),
])
_section("qurbani-shares", "Kurban Hisse & Doluluk Kartları", "Bağış", "7 hisseli kurban doluluk çubukları ve hisse fiyatları.", [
    B("qurbani_tracker", look="share_cards", kicker="KURBAN HİSSE", title="Aktif Kurban Grupları", columns=3, items=[
        {"flag": "🌍", "title": "Afrika Büyükbaş Hisse", "amount": "4.500 ₺", "taken": 5, "total": 7},
        {"flag": "🇹🇷", "title": "Yurt İçi Büyükbaş Hisse", "amount": "16.500 ₺", "taken": 6, "total": 7},
        {"flag": "🇵🇸", "title": "Gazze / Kudüs Hisse", "amount": "8.500 ₺", "taken": 4, "total": 7},
    ]),
])
_section("water-wells-status", "Su Kuyusu Durum & Takip", "Güven", "Açılan ve sondaj aşamasındaki su kuyuları galerisi.", [
    B("water_well_showcase", look="status_cards", kicker="KALICI ESER", title="Su Kuyuları Durum Takibi", columns=3, items=[
        {"image_url": "/demo/water.webp", "status": "opened", "country": "Çad", "title": "Mescid-i Aksa Su Kuyusu", "beneficiaries": "1.500 Kişi Faydalanıyor"},
        {"image_url": "/demo/water.webp", "status": "drilling", "country": "Nijer", "title": "Umut Kuyusu #42", "beneficiaries": "Sondaj Devam Ediyor"},
        {"image_url": "/demo/water.webp", "status": "planned", "country": "Bangladeş", "title": "Bereket Kuyusu #18", "beneficiaries": "Bağış Bekliyor"},
    ]),
])
_section("scholarship-plans", "Burs & Hafızlık Paketleri", "Bağış", "Öğrenci bursu ve hafızlık destek paketleri.", [
    B("scholarship_showcase", look="student_impact", kicker="İLİM & EĞİTİM", title="Bir Öğrencinin Geleceğine Dokun", columns=3, items=[
        {"icon": "📖", "badge": "Aylık", "title": "Hafızlık Öğrenci Bursu", "amount": "1.500 ₺ / ay", "text": "Kur'an kursu öğrencisinin barınma ve eğitim giderlerini karşılar."},
        {"icon": "🎓", "badge": "Yıllık", "title": "Üniversite Bursu", "amount": "2.000 ₺ / ay", "text": "İhtiyaç sahibi üniversite öğrencilerine düzenli aylık burs."},
        {"icon": "🎒", "badge": "Tek Seferlik", "title": "Kırtasiye & Kitap Seti", "amount": "750 ₺", "text": "Dönem başı tüm okul ve kitap ihtiyaçlarını karşılar."},
    ]),
])
_section("impact-matrix", "Tek Seferlik vs Düzenli Etki", "Bağış", "Düzenli bağış ile tek seferlik bağışın etkisini kıyaslar.", [
    B("impact_comparison", look="side_by_side_matrix", kicker="ETKİ KIYASLAMA", title="Düzenli İyiliğin Gücü", items=[
        {"badge": "Tek Seferlik", "title": "Anlık Destek", "amount": "500 ₺", "points": "1 Aylık gıda kolisi\nAnında SMS makbuzu\nAcil ihtiyaç karşılama"},
        {"badge": "Aylık Düzenli", "title": "Sürdürülebilir İyilik", "amount": "500 ₺ / ay", "highlighted": True, "points": "Yıl boyu 12 aileye gıda\nYetim ve öğrenci takibi\nÖncelikli saha raporları"},
    ]),
])
_section("corporate-csr", "Kurumsal Sponsorluk Paketleri", "Bağış", "Şirketler için sosyal sorumluluk sponsorluk kademeleri.", [
    B("corporate_giving", look="tier_cards", kicker="KURUMSAL DESTEK", title="Şirketinizle İyiliğe Ortak Olun", items=[
        {"badge": "Bronz Partner", "title": "Proje Destekçisi", "amount": "50.000 ₺", "text": "Kurumsal teşekkür sertifikası ve faaliyet raporu paylaşımı."},
        {"badge": "Gümüş Partner", "title": "Su Kuyusu Sponsoru", "amount": "150.000 ₺", "text": "Firmanızın adına özel su kuyusu ve açılış videosu."},
        {"badge": "Altın Partner", "title": "Stratejik İyilik Ortağı", "amount": "500.000 ₺+", "text": "Yıllık okul/yetimhane veya kapsamlı saha projesi ortaklığı."},
    ]),
])
_section("donation-finder", "Etkileşimli Yardım Alanı Seçici", "Etkileşim", "Ziyaretçiyi ilgi alanına göre uygun bağışa yönlendirir.", [
    B("donation_quiz", look="card_selector", kicker="NEREYE DESTEK OLMAK İSTERSİNİZ?", title="İyilik Yolunuzu Seçin", items=[
        {"icon": "🚨", "title": "Acil Yardım", "text": "Kriz bölgelerine sıcak yemek ve gıda", "suggested_amount": 500, "url": "/bagis"},
        {"icon": "💧", "title": "Su Kuyusu", "text": "Kurak köylere temiz su hissesi", "suggested_amount": 1000, "url": "/bagis"},
        {"icon": "👧", "title": "Yetim Sponsorluğu", "text": "Bir yetimin aylık eğitim ve gıda desteği", "suggested_amount": 1500, "url": "/bagis"},
        {"icon": "📖", "title": "Hafızlık Bursu", "text": "İlim talebelerine burs katkısı", "suggested_amount": 750, "url": "/bagis"},
    ]),
])
_section("ramadan-prayer", "Ramazan & Mübarek Günler", "Banner", "Altın varaklı koyu Ramazan ve mübarek günler takvim bandı.", [
    B("prayer_calendar", look="dark_gold_card", kicker="MÜBAREK GÜNLER", title="Rahmet ve Bereket Mevsimi", hijri_date="Ramazan 1447", items=[
        {"date": "1 Ramazan", "title": "İftar Sofraları Başlangıcı", "note": "Her gün binlerce kişiye sıcak iftar"},
        {"date": "27 Ramazan", "title": "Kadir Gecesi Özel", "note": "Zekat, fitre ve sadaka seferberliği"},
        {"date": "1 Şevval", "title": "Ramazan Bayramı", "note": "Yetimlere bayramlık sevinci"},
    ]),
])
_section("daily-micro", "Günlük / Mikro İnfak", "Bağış", "Küçük günlük katkıların yıllık etkisini gösteren mikro bağış bloğu.", [
    B("daily_charity", look="micro_cards", kicker="MİKRO İNFAK", title="Her Gün Küçük Bir İyilik", items=[
        {"icon": "🍞", "daily_amount": "20 ₺ / gün", "title": "Günlük Ekmek Desteği", "yearly_impact": "Yılda 7.300 ₺ = 1.460 Ekmek"},
        {"icon": "💧", "daily_amount": "50 ₺ / gün", "title": "Temiz Su Kumbarası", "yearly_impact": "Yılda 18.250 ₺ = 18 Hisse"},
        {"icon": "📖", "daily_amount": "50 ₺ / gün", "title": "Hafız Destek Kumbarası", "yearly_impact": "1 Öğrencinin Yıllık Bursu"},
    ]),
])
_section("perpetual-projects", "Sadaka-i Cariye / Kalıcı Eser", "Bağış", "Cami, okul, aşevi inşaatları için tuğla/hisse bazlı vitrin.", [
    B("perpetual_charity", look="project_cards", kicker="SADAKA-İ CARİYE", title="Kalıcı Eser Projelerimiz", columns=3, items=[
        {"image_url": "/demo/water.webp", "stage": "Kaba İnşaat %65", "title": "Afrika Külliye & Mescit", "unit_price": "1.000 ₺", "percent": 65},
        {"image_url": "/demo/orphan.webp", "stage": "Çatı Aşaması %80", "title": "Yetim Eğitim Kompleksi", "unit_price": "1.500 ₺", "percent": 80},
        {"image_url": "/demo/relief.webp", "stage": "Temel %35", "title": "Mobil Aşevi Tırı", "unit_price": "750 ₺", "percent": 35},
    ]),
])
_section("family-sponsorship-cards", "Kardeş Aile Eşleştirme", "Bağış", "Anonim aile kodu ve ihtiyaç kalemleriyle aile destek kartları.", [
    B("family_sponsorship", look="anonymized_cards", kicker="KARDEŞ AİLE", title="Bir Ailenin Umudu Olun", columns=3, items=[
        {"code": "AİLE-402", "location": "İstanbul", "members": "5 Kişi · 3 Çocuk", "need": "Aylık Gıda & Kira Desteği", "amount": "2.500 ₺ / ay"},
        {"code": "AİLE-518", "location": "Gaziantep", "members": "4 Kişi · 2 Yetim", "need": "Eğitim & Yakacak Desteği", "amount": "2.000 ₺ / ay"},
        {"code": "AİLE-609", "location": "Şanlıurfa", "members": "6 Kişi · 4 Çocuk", "need": "Temel Mutfak & Sağlık", "amount": "3.000 ₺ / ay"},
    ]),
])
_section("fiqh-rulings", "Fıkhi Bağış Rehberi", "Etkileşim", "Zekat, kurban, adak ve akika hükümleri özet kartları.", [
    B("fiqh_guide", look="topic_cards", kicker="BAĞIŞ REHBERİ", title="Sıkça Sorulan Fıkhi Konular", items=[
        {"badge": "Zekat", "title": "Zekat Kimlere Verilir?", "summary": "Tevbe Suresi 60. ayette belirtilen sekiz sınıf ihtiyaç sahibine ulaştırılır."},
        {"badge": "Kurban", "title": "Vekaletle Kurban Kesimi", "summary": "Bağışçının vekaleti alınarak İslami usullere uygun kesim gerçekleştirilir."},
    ]),
])
_section("events-list", "Etkinlik & Kermes Takvimi", "İletişim", "Yaklaşan hayır kermesi, iftar ve canlı yayın takvimi.", [
    B("events_calendar", look="event_cards", kicker="ETKİNLİKLER", title="Yaklaşan Programlarımız", items=[
        {"image_url": "/demo/hands.webp", "date": "22 Mayıs · 14:00", "location": "Genel Merkez", "title": "Bahar Hayır Kermesi"},
        {"image_url": "/demo/water.webp", "date": "30 Mayıs · 16:00", "location": "Canlı Yayın", "title": "Çad Su Kuyusu Açılış Programı"},
        {"image_url": "/demo/quran.webp", "date": "12 Haziran · 19:00", "location": "Konferans Salonu", "title": "Hafızlık İcazet Merasimi"},
    ]),
])
_section("sms-codes", "SMS & Kısa Kod Bağışı", "Bağış", "Operatör kısa kodlarıyla tek SMS bağış çağrısı.", [
    B("sms_donate", look="operator_cards", kicker="TEK SMS İLE İYİLİK", title="SMS Bağış Kanallarımız", items=[
        {"keyword": "YARDIM", "shortcode": "4042", "amount": "50 ₺", "note": "Genel acil yardım fonuna katkı sağlar."},
        {"keyword": "SU", "shortcode": "4042", "amount": "100 ₺", "note": "Su kuyusu projelerine destek olur."},
        {"keyword": "YETİM", "shortcode": "4042", "amount": "150 ₺", "note": "Yetim eğitim ve gıda desteğine aktarılır."},
    ]),
])
_section("app-download", "Mobil Uygulama & WhatsApp Kanalı", "Banner", "Mobil uygulama ve WhatsApp duyuru kanalı tanıtımı.", [
    B("app_promo", look="phone_mockup_split", kicker="CEBİNİZDEKİ İYİLİK", title="Mobil Uygulamamızı İndirin", text="Bağışlarınızı anlık takip edin, kuyu ve kurban videolarınızı telefonunuzdan izleyin.", ios_url="/", android_url="/", whatsapp_url="/iletisim"),
])
_section("proxy-intents", "Adak, Akika & Şükür Vekalet", "Bağış", "Kurban niyet türlerini seçtiren vekalet bloğu.", [
    B("proxy_donation", look="intent_cards", kicker="VEKALETLE KURBAN", title="Niyetinize Göre Kurban Bağışı", items=[
        {"icon": "🐑", "title": "Adak Kurbanı", "amount": "4.500 ₺", "text": "Adağınızı ihtiyaç sahiplerine ulaştırın."},
        {"icon": "👶", "title": "Akika Kurbanı", "amount": "4.500 ₺", "text": "Yeni doğan evladınız için şükür vesilesi."},
        {"icon": "🤲", "title": "Şükür Kurbanı", "amount": "4.500 ₺", "text": "Nimetlere şükür için mazlumlara ikram."},
        {"icon": "💚", "title": "Şifa Kurbanı", "amount": "4.500 ₺", "text": "Hastalarımıza şifa niyetiyle sadaka."},
    ]),
])
_section("impact-breakdown", "Fon Dağılım & Etki Grafiği", "Güven", "Bağışların alanlara göre yüzde dağılımını gösteren şeffaflık grafiği.", [
    B("impact_chart", look="horizontal_bars", kicker="FON DAĞILIMI", title="Bağışlarınız Nerelere Ulaşıyor?", items=[
        {"label": "Gıda & Acil İnsani Yardım", "percent": 42, "amount": "%42"},
        {"label": "Su Kuyuları & Kalıcı Eser", "percent": 28, "amount": "%28"},
        {"label": "Yetim & Öğrenci Bursları", "percent": 20, "amount": "%20"},
        {"label": "Sağlık & Katarakt", "percent": 10, "amount": "%10"},
    ]),
])
_section("branches-list", "Şubeler & Temsilcilikler", "İletişim", "Şehir ve bölge bazlı şube iletişim kartları.", [
    B("branches_directory", look="city_cards", kicker="TEMSİLCİLİKLERİMİZ", title="Şubelerimiz", columns=3, items=[
        {"city": "İstanbul Genel Merkez", "address": "Fatih, İstanbul", "phone": "+90 212 000 00 00"},
        {"city": "Ankara Temsilciliği", "address": "Kızılay, Ankara", "phone": "+90 312 000 00 00"},
        {"city": "Bursa Şubesi", "address": "Osmangazi, Bursa", "phone": "+90 224 000 00 00"},
    ]),
])
_section("gift-cert", "Hediye Bağış & Sertifika", "Bağış", "Sevdikleriniz adına özel dijital sertifika önizlemeli bağış bloğu.", [
    B("gift_certificate", look="certificate_preview", kicker="HEDİYE BAĞIŞ", title="Sevdiklerinize İyilik Hediye Edin", items=[
        {"icon": "🎂", "title": "Doğum Günü", "text": "Sevdiklerinize unutulmaz bir iyilik hatırası."},
        {"icon": "💐", "title": "Anneler / Babalar Günü", "text": "Onların adına bir yetimi sevindirin."},
        {"icon": "🕊️", "title": "Taziye & Başsağlığı", "text": "Merhum/merhume adına sadaka-i cariye."},
        {"icon": "🎉", "title": "Tebrik & Bayram", "text": "Özel günleri hayra vesile kılın."},
    ]),
])
_section("help-desk", "Canlı Destek & Danışma Kartı", "İletişim", "Telefon, WhatsApp ve e-posta destek kanalları kartı.", [
    B("help_desk_card", look="floating_support_card", kicker="DESTEK HATTI", title="Size Nasıl Yardımcı Olabiliriz?", phone="+90 212 000 00 00", whatsapp="905000000000", email="bilgi@kurum.org", hours="Hafta içi 09:00 - 18:00"),
])
_section("milestone-phases", "Proje Aşama Takipçisi", "Güven", "Büyük bir saha projesinin faz bazlı ilerleme durumu.", [
    B("milestone_tracker", look="horizontal_stepper", kicker="PROJE TAKİBİ", title="Külliye İnşaat Aşamaları", items=[
        {"step": "Faz 1", "title": "Arsa & İzinler", "status": "done", "date": "Ocak 2026"},
        {"step": "Faz 2", "title": "Temel & Kaba İnşaat", "status": "done", "date": "Mart 2026"},
        {"step": "Faz 3", "title": "İç Donanım & Mefruşat", "status": "active", "date": "Mayıs 2026"},
        {"step": "Faz 4", "title": "Açılış & Eğitim", "status": "pending", "date": "Eylül 2026"},
    ]),
])
_section("awards-wall", "Ödüller & Akreditasyonlar", "Güven", "Kamu yararı statüsü, ISO belgeleri ve ödüller.", [
    B("awards_badges", look="gold_crests", kicker="AKREDİTASYON", title="Belgelerimiz ve Ödüllerimiz", items=[
        {"icon": "🏛️", "year": "2024", "title": "Kamu Yararına Dernek", "issuer": "T.C. İçişleri Bakanlığı"},
        {"icon": "🛡️", "year": "2025", "title": "ISO 9001 Kalite", "issuer": "Uluslararası Standart"},
        {"icon": "🧾", "year": "2025", "title": "Bağımsız Mali Denetim", "issuer": "Yeminli Mali Müşavirlik"},
        {"icon": "🏆", "year": "2026", "title": "Şeffaf STK Ödülü", "issuer": "Sivil Toplum Platformu"},
    ]),
])
_section("iftar-meals", "İftar & Kumanya Hedef Sayacı", "Bağış", "Günlük iftar ve kumanya hedef çubuğu + 1/5/10 adet butonları.", [
    B("iftar_counter", look="dark_gold_iftar", kicker="RAMAZAN SOFRALARI", title="Bugünkü İftar & Kumanya Hedefimiz", items=[
        {"icon": "🍲", "title": "1 Kişilik Sıcak İftar", "unit_price": 150, "collected_count": 380, "target_count": 500},
        {"icon": "📦", "title": "Aile Ramazan Kumanyası", "unit_price": 750, "collected_count": 145, "target_count": 200},
        {"icon": "🥐", "title": "Sahur İkram Paketi", "unit_price": 120, "collected_count": 210, "target_count": 300},
    ]),
])
_section("kulliye-rooms", "Külliye / Yetimhane Bölüm Sponsorluğu", "Bağış", "Sınıf, mescit, kütüphane ve yemekhane sponsorluk kartları.", [
    B("facility_rooms", look="room_cards", kicker="KÜLLİYE PROJESİ", title="Bölüm Sponsorlukları", columns=3, items=[
        {"icon": "🕌", "title": "Mescit Bölümü", "amount": "250.000 ₺", "status": "%70 Tamamlandı"},
        {"icon": "📚", "title": "Kütüphane & Etüt", "amount": "120.000 ₺", "status": "%45 Tamamlandı"},
        {"icon": "🍽️", "title": "Öğrenci Yemekhanesi", "amount": "180.000 ₺", "status": "%85 Tamamlandı"},
    ]),
])
_section("memory-notes", "Bağışçı Dilek & Hatıra Duvarı", "Güven", "Bağışçı duaları ve merhum yakınlar adına hayır notları.", [
    B("memory_wall", look="wish_cards", kicker="HATIRA DUVARI", title="İyilik Notları & Dualar", items=[
        {"author": "Ayşe T.", "dedicated_to": "Merhum Babam Adına", "note": "Rabbim kabul buyursun, mazlumlara şifa olsun.", "date": "2026"},
        {"author": "Hasan K.", "dedicated_to": "Gazze Kardeşlerimize", "note": "Dualarımız ve desteğimiz sizinle.", "date": "2026"},
        {"author": "Zeynep M.", "dedicated_to": "Ailemiz Adına", "note": "Bir yetimin gülümsemesine vesile olmak en büyük mutluluk.", "date": "2026"},
    ]),
])
_section("medical-aid", "Sağlık & Katarakt Yardımları", "Bağış", "Katarakt ameliyatı ve sağlık yardımı paketleri.", [
    B("medical_relief", look="treatment_cards", kicker="SAĞLIK DESTEĞİ", title="Yeniden Görmeye Vesile Olun", columns=3, items=[
        {"image_url": "/demo/relief.webp", "badge": "1 Ameliyat", "title": "Katarakt Ameliyatı", "amount": "3.000 ₺", "text": "Afrika'da bir hastanın yeniden görmesini sağlar."},
        {"image_url": "/demo/hands.webp", "badge": "Medikal", "title": "Tekerlekli Sandalye", "amount": "4.500 ₺", "text": "Engelli kardeşlerimize hareket özgürlüğü kazandırır."},
        {"image_url": "/demo/relief.webp", "badge": "Acil Sağlık", "title": "İlaç & Tıbbi Malzeme", "amount": "1.000 ₺", "text": "Kriz bölgelerindeki kliniklere acil ilaç desteği."},
    ]),
])
_section("alumni-success", "Mezun & Öğrenci Hikayeleri", "Güven", "Burs desteğiyle mezun olan öğrencilerin başarı hikayeleri.", [
    B("alumni_stories", look="story_cards", kicker="BAŞARI HİKAYELERİ", title="Burslarımızla Yetişen Değerler", items=[
        {"name": "Dr. Yusuf A.", "program": "Tıp Fakültesi Mezunu", "quote": "Üniversite yıllarımdaki burs desteği sayesinde bugün doktor olarak hizmet ediyorum."},
        {"name": "Hafız Ömer K.", "program": "Hafızlık İcazet", "quote": "Medrese eğitimim boyunca sağlanan destek için tüm hayırseverlere duacıyım."},
        {"name": "Meryem S.", "program": "Mühendislik Öğrencisi", "quote": "Eğitim bursum benim için en büyük motivasyon kaynağı oldu."},
    ]),
])
_section("relief-needs", "Acil İhtiyaç Listesi", "Bağış", "Birim tutarlı ve aciliyet rozetli acil yardım malzemeleri.", [
    B("relief_checklist", look="supply_grid", kicker="ACİL İHTİYAÇLAR", title="Bölgedeki Öncelikli İhtiyaçlar", items=[
        {"icon": "🛏️", "title": "Kışlık Battaniye", "amount": "250 ₺", "urgency": "critical"},
        {"icon": "🍼", "title": "Bebek Maması & Bez", "amount": "350 ₺", "urgency": "critical"},
        {"icon": "⛺", "title": "Barınma Çadırı", "amount": "4.500 ₺", "urgency": "high"},
        {"icon": "🍞", "title": "Günlük Ekmek Desteği", "amount": "150 ₺", "urgency": "high"},
    ]),
])
_section("social-squares", "Sosyal Medya Saha Kareleri", "Medya", "Kare fotoğraf ızgarası ve sosyal medya takip çağrısı.", [
    B("social_feed_grid", look="instagram_grid", kicker="SAHADAN KARELER", title="Sosyal Medyada Biz", handle="@kurumresmi", profile_url="/iletisim", items=[
        {"image_url": "/demo/water.webp", "caption": "Çad'da temiz su sevinci"},
        {"image_url": "/demo/relief.webp", "caption": "Sıcak yemek dağıtımı"},
        {"image_url": "/demo/orphan.webp", "caption": "Yetim öğrencilerimizle şenlik"},
        {"image_url": "/demo/hands.webp", "caption": "Gönüllülerimizle el ele"},
    ]),
])
_section("recurring-kumbara", "Düzenli Aylık İnfak Planlayıcı", "Bağış", "Aylık tutar seçimi ve yıllık etki hesaplayıcı.", [
    B("recurring_planner", look="slider_calc", kicker="DÜZENLİ İNFAK", title="Aylık Kumbara ile Sürekli İyilik", default_amount=300, unit_label="Her 100 ₺, 1 ihtiyaç sahibine sıcak yemek olarak ulaşır.", unit_price=100, button_label="Düzenli Bağışa Başla", button_url="/bagis"),
])
_section("field-reps", "İl & Ülke Temsilcileri", "Güven", "Şehir ve bölge bazlı gönüllü temsilci rehberi.", [
    B("field_representatives", look="cards_grid", kicker="TEMSİLCİLİKLER", title="Bölge ve İl Temsilcilerimiz", items=[
        {"region": "Marmara", "city": "İstanbul (Genel Merkez)", "name": "Ahmet Yılmaz", "phone": "0212 000 00 00", "whatsapp": "905000000000", "status": "Aktif Merkez"},
        {"region": "İç Anadolu", "city": "Ankara", "name": "Mehmet Demir", "phone": "0312 000 00 00", "whatsapp": "905000000001", "status": "Aktif Saha"},
        {"region": "Güneydoğu", "city": "Gaziantep Lojistik", "name": "Mustafa Kaya", "phone": "0342 000 00 00", "whatsapp": "905000000002", "status": "Sevkiyat Üssü"},
    ]),
])
_section("convoy-logistics", "Yardım Konvoyu & Tır Takibi", "Güven", "Yola çıkan yardım tırlarının rota ve ulaşım durumu.", [
    B("convoy_tracker", look="route_cards", kicker="LOJİSTİK TAKİP", title="Yoldaki Yardım Konvoylarımız", items=[
        {"code": "TIR-104", "title": "İstanbul → Gazze İnsani Yardım Koridoru", "cargo": "24 Ton Un, Bebek Maması & Hijyen Kiti", "progress": 82, "status": "Sınır Kapısında"},
        {"code": "TIR-105", "title": "Ankara → Suriye Kışlık Sevkiyatı", "cargo": "1.500 Adet Çadır Sobası & Battaniye", "progress": 100, "status": "Teslim Edildi"},
    ]),
])
_section("impact-bundles-row", "Hazır Yardım Paketleri", "Bağış", "Birden fazla yardım kalemini birleştiren paketler.", [
    B("impact_bundles", look="bundle_cards", kicker="HAZIR PAKETLER", title="Bir Paketle Çoklu İyilik", items=[
        {"badge": "En Çok Tercih Edilen", "title": "Tam Aile Kış Paketi", "price": "1.750 ₺", "contents": "1 Aylık Gıda Kumanyası\n2 Adet Kışlık Battaniye\nÇocuk Mont & Bot Seti", "url": "/bagis"},
        {"badge": "Bebek & Anne", "title": "Yeni Doğan Destek Seti", "price": "1.200 ₺", "contents": "1 Aylık Bebek Maması\nBebek Bezi & Bakım Çantası\nTermal Bebek Kıyafeti", "url": "/bagis"},
        {"badge": "Eğitim", "title": "Yetim Okul Hazırlık Paketi", "price": "950 ₺", "contents": "Ortopedik Okul Çantası\nTam Kırtasiye Seti\nOkul Kıyafeti & Ayakkabı", "url": "/bagis"},
    ]),
])
_section("publications-archive", "Yayınlar & Faaliyet Dergileri", "Medya", "Vakıf dergisi, yıllık rapor ve PDF kitap rafı.", [
    B("publications_shelf", look="magazine_grid", kicker="YAYINLARIMIZ", title="Dergi, Bülten ve Faaliyet Kitapları", items=[
        {"image_url": "/demo/relief.webp", "issue": "Sayı 42 · 2026", "title": "İyilik Bülteni — Saha Özel", "summary": "Afrika ve Ortadoğu su kuyusu ve sağlık taraması raporu.", "file_url": "/iletisim"},
        {"image_url": "/demo/education.webp", "issue": "Yıllık Rapor · 2025", "title": "2025 Faaliyet & Şeffaflık Almanağı", "summary": "Tüm yılın gelir-gider ve saha dağıtım istatistikleri.", "file_url": "/iletisim"},
        {"image_url": "/demo/orphan.webp", "issue": "Özel Dosya", "title": "Yetim Gülerse Dünya Güler", "summary": "Yetim eğitim merkezlerimizden başarı öyküleri.", "file_url": "/iletisim"},
        {"image_url": "/demo/water.webp", "issue": "Rehber Kitap", "title": "Sadaka-i Cariye ve İnfak Rehberi", "summary": "Kalıcı eserler ve vakıf kültürü üzerine derleme.", "file_url": "/iletisim"},
    ]),
])
_section("tax-exemption", "Vergi Muafiyeti & Kurumsal Bilgi", "Güven", "Kamu yararına dernek vergi indirimi ve dekont avantajları.", [
    B("tax_exemption_info", look="split_summary", kicker="RESMİ AVANTAJLAR", title="Vergi İndirimi ve Şeffaf Dekont", law_ref="GVK Md. 89/4 · KVK Md. 10/1-c", button_label="Kurumsal Destek Al", button_url="/iletisim", items=[
        {"badge": "Kurumsal", "title": "Kurumlar Vergisi Matrah İndirimi", "text": "Resmi bağış makbuzu ve banka dekontu ile mevzuat kapsamındaki indirim haklarından yararlanın."},
        {"badge": "Bireysel", "title": "Anında E-Dekont & Doğrulama", "text": "Online bağışlarınızda karekodlu dijital bağış makbuzu e-posta adresinize iletilir."},
        {"badge": "Denetim", "title": "Bağımsız Mali Denetim", "text": "Tüm gelir ve giderlerimiz yıllık bağımsız denetim raporlarıyla kamuoyuna açık paylaşılır."},
    ]),
])
_section("qurbani-lookup", "Kurban Kesim & Vekalet Durumu", "Bağış", "Bağış kodu ile kesim durumu ve video süreci vitrini.", [
    B("qurbani_status", look="lookup_card", kicker="VEKALET TAKİBİ", title="Kurban Kesim ve Video Durumu Sorgula", placeholder="Bağış kodunuz veya 05XX...", support_url="/iletisim", items=[
        {"step": "01", "title": "Vekalet & Kayıt", "detail": "Bağışınız sonrası SMS ve e-posta ile hisse kodunuz oluşturulur."},
        {"step": "02", "title": "İslami Usullere Göre Kesim", "detail": "Bayram günlerinde isimler okunarak veteriner eşliğinde kesim yapılır."},
        {"step": "03", "title": "Video & Fotoğraf Teslimi", "detail": "Kesim ve dağıtım videosu WhatsApp / SMS üzerinden size ulaştırılır."},
    ]),
])
_section("crisis-command", "Küresel Kriz Bölgeleri Panosu", "Güven", "Kriz bölgeleri aciliyet durumu ve aktif saha ekipleri.", [
    B("crisis_regions_map", look="status_grid", kicker="ACİL MÜDAHALE", title="Aktif Kriz Bölgelerimiz", items=[
        {"flag": "🇵🇸", "region": "Gazze & Filistin", "urgency": "critical", "teams": "8 Saha Ekibi", "need": "Sıcak yemek, tıbbi malzeme ve temiz su", "url": "/bagis"},
        {"flag": "🇸🇩", "region": "Sudan", "urgency": "high", "teams": "4 Saha Ekibi", "need": "Gıda kolisi ve acil barınma", "url": "/bagis"},
        {"flag": "🇸🇾", "region": "Kuzey Suriye", "urgency": "active", "teams": "12 Lojistik Noktası", "need": "Ekmek fırını, yakacak ve eğitim", "url": "/bagis"},
    ]),
])
_section("nisab-rates", "Nisap, Fitre & Fidye Birimleri", "Bağış", "Altın/gümüş nisap eşiği, fitre ve fidye tutarları.", [
    B("nisab_rates_bar", look="cards_row", kicker="GÜNCEL ÖLÇÜLER", title="Zekat Nisabı, Fitre ve Fidye Tutarları", items=[
        {"icon": "🪙", "label": "Altın Nisabı", "value": "80.18 gr", "note": "Zekat farziyet ölçüsü"},
        {"icon": "🍽️", "label": "Fitre Bedeli", "value": "180 ₺", "note": "Kişi başı asgari tutar"},
        {"icon": "🤲", "label": "Günlük Fidye", "value": "180 ₺", "note": "1 günlük oruç bedeli"},
        {"icon": "💧", "label": "Su Kuyusu Hissesi", "value": "1.000 ₺", "note": "Ortak kuyu katılımı"},
    ]),
])
_section("mushaf-aid", "Mushaf & Eğitim Materyali Dağıtımı", "Güven", "Ülke bazlı Mushaf dağıtım sayacı ve birim bedel.", [
    B("mushaf_distribution", look="counter_cards", kicker="İLİM VE KUR'AN", title="Mushaf-ı Şerif Dağıtımlarımız", unit_price="150 ₺", button_label="Mushaf Hediye Et", button_url="/bagis", items=[
        {"country": "Çad & Nijer", "count": "18.400+", "note": "Hafızlık medreseleri"},
        {"country": "Bangladeş", "count": "12.200+", "note": "Arakan kampları"},
        {"country": "Suriye", "count": "9.850+", "note": "Kur'an kursları"},
        {"country": "Somali", "count": "7.500+", "note": "Köy okulları"},
    ]),
])
_section("governance-team", "Yönetim & Denetim Kurulu", "Güven", "Kurul üyeleri ve denetim komisyonu şeması.", [
    B("governance_board", look="board_grid", kicker="KURUMSAL YAPI", title="Yönetim ve Denetim Kurulumuz", items=[
        {"name": "Dr. Ahmet Kaya", "role": "Yönetim Kurulu Başkanı", "committee": "Genel Koordinasyon"},
        {"name": "Av. Zeynep Arslan", "role": "Hukuk & Mevzuat", "committee": "Denetim Kurulu"},
        {"name": "SMMM Murat Demir", "role": "Mali İşler Sorumlusu", "committee": "Bütçe & Şeffaflık"},
        {"name": "İbrahim Çelik", "role": "Saha Operasyonları", "committee": "Dış Yardımlar"},
    ]),
])
_section("donor-honor-tiers", "Hayırsever Destek Kademeleri", "Bağış", "Manevi destek kademeleri ve kalıcı eser katkıları.", [
    B("donor_tiers_wall", look="tier_cards", kicker="DESTEK KADEMELERİ", title="İyilikte Öncü Olun", items=[
        {"icon": "💧", "title": "Su Kuyusu Banisi", "amount": "Tam Kuyu / Hisse", "impact": "Yüzlerce insanın temiz suya kavuşmasına vesile olun.", "url": "/bagis"},
        {"icon": "🎒", "title": "Yetim Hamisi", "amount": "Aylık 750 ₺", "impact": "Bir yetim yavrumuzun eğitim, giyim ve gıda giderini üstlenin.", "url": "/bagis"},
        {"icon": "📖", "title": "Hafız Destekçisi", "amount": "Aylık 1.000 ₺", "impact": "Bir hafızlık öğrencisinin tüm iaşe ve eğitim masraflarını karşılayın.", "url": "/bagis"},
    ]),
])
_section("sacred-days-cta", "Mübarek Günler & Kandil Çağrısı", "Banner", "Kandil ve mübarek gecelere özel sadaka çağrısı.", [
    B("sacred_days_banner", look="ornate_dark", occasion="Mübarek Üç Aylar & Kandil", date_label="Bereket Mevsimi", title="Bu Mübarek Gecede Bir Mazlumun Duasına Ortak Olun", text="Kandil sadakanızla sıcak yemek, yetim tebessümü ve temiz su ulaştırın.", button_label="Kandil Sadakası Ver", button_url="/bagis"),
])
_section("doc-spotlight", "Saha Belgeseli & Röportaj", "Medya", "Ana belgesel ve bölüm zaman damgaları.", [
    B("documentary_spotlight", look="theater_split", kicker="SAHA BELGESELİ", title="Umut Yolculuğu: Afrika Su Kuyuları", poster_url="/demo/water.webp", video_url="/iletisim", duration="14:20", items=[
        {"time": "00:45", "title": "Bölgeye Varış ve Su İhtiyacı Tespiti"},
        {"time": "04:10", "title": "Sondaj Çalışmaları ve İlk Suyun Çıkışı"},
        {"time": "09:30", "title": "Köy Halkının Sevinci ve Açılış Duası"},
    ]),
])
_section("iban-helper", "Havale / EFT Açıklama Rehberi", "Bağış", "Bağış türüne göre doğru havale açıklama kodları.", [
    B("iban_reference_helper", look="interactive_cards", kicker="BANKA REHBERİ", title="Havale / EFT Açıklama Kodları", recipient_name="Örnek İnsani Yardım Derneği", items=[
        {"code": "ZEKAT + TEL", "label": "Zekat Bağışı", "example": "Örn: ZEKAT 05XX XXX XX XX"},
        {"code": "FITRE + ADET", "label": "Fitre / Fidye", "example": "Örn: FITRE 4 KISI 05XX..."},
        {"code": "KURBAN + NIYET", "label": "Kurban / Adak", "example": "Örn: ADAK AHMET YILMAZ 05XX..."},
        {"code": "SU-KUYUSU", "label": "Su Kuyusu Hissesi", "example": "Örn: SU-KUYUSU 05XX..."},
    ]),
])
_section("qurbani-animals", "Kurban Hayvan & Bölge Seçenekleri", "Bağış", "Küçükbaş, Büyükbaş Hisse ve Tam Büyükbaş seçenekleri.", [
    B("qurbani_animal_types", look="animal_cards", kicker="KURBAN SEÇENEKLERİ", title="Bölge ve Türlere Göre Kurban Bağışı", items=[
        {"icon": "🐑", "badge": "Afrika · Asya", "title": "Küçükbaş Kurban", "price": "4.500 ₺", "detail": "1 Tam Hisse · Kesim videosu ile teslim", "url": "/bagis"},
        {"icon": "🐄", "badge": "Afrika · Asya", "title": "Büyükbaş 1/7 Hisse", "price": "5.250 ₺", "detail": "7 hisseli büyükbaş kurban katılımı", "url": "/bagis"},
        {"icon": "🇵🇸", "badge": "Gazze & Yurt İçi", "title": "Adak / Akika Küçükbaş", "price": "9.500 ₺", "detail": "İhtiyaç sahiplerine taze et dağıtımı", "url": "/bagis"},
    ]),
])
_section("fatwa-qa", "Zekat & İnfak Fetva Kartları", "Güven", "Fıkhi sorular ve net hüküm özetleri.", [
    B("fatwa_cards", look="ruled_cards", kicker="FIKHİ REHBER", title="Sık Sorulan Zekat & Kurban Fetvaları", items=[
        {"category": "Zekat", "question": "Altın ve döviz birikimlerim için zekat nasıl hesaplanır?", "ruling": "Nisap miktarına (80.18 gr altın karşılığı) ulaşıp üzerinden 1 kameri yıl geçtikten sonra %2,5 (1/40) oranında zekat verilir."},
        {"category": "Fitre", "question": "Fitre Ramazan ayı içinde önceden verilebilir mi?", "ruling": "Evet, Ramazan ayı içerisinde ihtiyaç sahiplerinin bayram hazırlığı yapabilmesi için bayramdan önce verilmesi daha faziletlidir."},
    ]),
])
_section("soup-kitchen", "Aşevi & Günlük Sıcak Yemek", "Güven", "Günlük pişen öğün sayısı ve aşevi noktaları.", [
    B("soup_kitchen_status", look="kitchen_cards", kicker="AŞEVİ SEFERBERLİĞİ", title="Günlük Sıcak Yemek Dağıtımlarımız", daily_meals="18.500 Öğün / Gün", meal_price="85 ₺", button_label="Sıcak Yemek İkram Et", button_url="/bagis", items=[
        {"location": "Gazze Güney Aşevi", "count": "8.000 Öğün", "menu": "Sıcak çorba, pilav ve ekmek"},
        {"location": "İdlib / Halep Aşevi", "count": "6.500 Öğün", "menu": "Aile boyu sıcak yemek"},
        {"location": "Çad Medrese Mutfağı", "count": "4.000 Öğün", "menu": "Öğrenciler için günlük öğün"},
    ]),
])
_section("well-compare", "Su Kuyusu Türleri Karşılaştırması", "Bağış", "Tulumba, Şadırvan ve Derin Sondaj kuyuları karşılaştırması.", [
    B("well_types_compare", look="spec_cards", kicker="SU KUYUSU MODELLERİ", title="İhtiyaca Göre Su Kuyusu Türleri", items=[
        {"badge": "Asya / Afrika", "title": "Tulumba Su Kuyusu", "price": "1.800 $", "depth": "25-40 Metre", "beneficiaries": "300-500 Kişi", "duration": "3-5 Hafta", "url": "/bagis"},
        {"badge": "Afrika", "title": "Güneş Panelli Şadırvan", "price": "4.500 $", "depth": "60-90 Metre", "beneficiaries": "1.500+ Kişi", "duration": "6-8 Hafta", "url": "/bagis"},
        {"badge": "Kurak Bölgeler", "title": "Derin Sondaj Kuyusu", "price": "7.500 $", "depth": "120+ Metre", "beneficiaries": "3.000+ Kişi", "duration": "8-12 Hafta", "url": "/bagis"},
    ]),
])
_section("field-diary-feed", "Saha Ekibi Günlükleri", "Medya", "Saha ekiplerinden tarihli notlar ve fotoğraflar.", [
    B("field_diaries", look="photo_notes_grid", kicker="SAHA GÜNLÜĞÜ", title="Ekiplerimizden Son Notlar", items=[
        {"image_url": "/demo/water.webp", "date": "18 Kasım", "location": "Çad / Abeche", "title": "Yeni Kuyunun İlk Suyu Çıktı", "note": "Köy halkı ve çocukların sevinci görülmeye değerdi."},
        {"image_url": "/demo/relief.webp", "date": "15 Kasım", "location": "Suriye / İdlib", "title": "Kışlık Yakacak & Battaniye Dağıtımı", "note": "320 çadır ailesine kışlık destek ulaştırıldı."},
        {"image_url": "/demo/orphan.webp", "date": "12 Kasım", "location": "Somali / Mogadişu", "title": "Yetimhane Kütüphanesi Açıldı", "note": "Öğrencilerimiz yeni ders kitaplarına kavuştu."},
    ]),
])
_section("sponsor-plaques", "Kurumsal Sponsor & Teşekkür Plaketleri", "Güven", "Kurumsal destekçiler ve sosyal etki özetleri.", [
    B("sponsor_certificates", look="plaque_grid", kicker="KURUMSAL DESTEKÇİLER", title="İyilikte Yanımızda Olan Kurumlar", items=[
        {"company": "Anadolu Lojistik A.Ş.", "tier": "Konvoy Sponsoru", "impact": "4 Yardım Tırı · 96 Ton Gıda"},
        {"company": "Bereket Gıda Grubu", "tier": "Kumanya Partneri", "impact": "2.500 Aileye Ramazan Kumanyası"},
        {"company": "Marmara Teknoloji", "tier": "Su Kuyusu Sponsoru", "impact": "3 Güneş Panelli Su Kuyusu"},
    ]),
])
_section("surgery-cases", "Katarakt & Acil Ameliyat Desteği", "Bağış", "Ameliyat bekleyen vakalar ve birim maliyet.", [
    B("surgery_sponsorship", look="case_cards", kicker="SAĞLIK DESTEĞİ", title="Bir Ameliyat ile Hayata Işık Olun", items=[
        {"icon": "👁️", "waiting": "140 Hasta Bekliyor", "title": "Katarakt Ameliyatı", "cost": "3.500 ₺", "url": "/bagis"},
        {"icon": "🩺", "waiting": "45 Hasta Bekliyor", "title": "Acil Ortopedi Müdahalesi", "cost": "12.000 ₺", "url": "/bagis"},
        {"icon": "💊", "waiting": "300+ Aile", "title": "Kronik İlaç & Medikal Set", "cost": "950 ₺", "url": "/bagis"},
    ]),
])
_section("mobile-sms-hub", "Mobil Uygulama, SMS & WhatsApp Merkezi", "İletişim", "SMS kısa kod, WhatsApp ve mobil uygulama bağlantıları.", [
    B("mobile_channels_hub", look="split_device_hub", kicker="HIZLI ERİŞİM", title="Her An Yanınızda: SMS, WhatsApp & Mobil", sms_code="İNFAK yazıp 3480'e gönderin (50 ₺)", whatsapp_url="/iletisim", ios_url="#", android_url="#"),
])

SECTION_BY_KEY = {s["key"]: s for s in SECTIONS}

PAGE_TEMPLATES += [
    {"key": "asevi-sicak-yemek", "label": "Günlük Sıcak Yemek & Aşevi Seferberliği", "slug": "asevi-sicak-yemek",
     "description": "Aşevi günlük öğün durumu, saha günlükleri ve hızlı erişim.",
     "blocks": [_page_hero("Günlük Sıcak Yemek ve Aşevi Sofraları", "AŞEVİ SEFERBERLİĞİ", "/demo/relief.webp"), *_blocks("soup-kitchen", "field-diary-feed", "mobile-sms-hub")]},
    {"key": "su-kuyusu-cesitleri", "label": "Su Kuyusu Türleri & Teknik Karşılaştırma", "slug": "su-kuyusu-cesitleri",
     "description": "Tulumba, şadırvan ve derin sondaj kuyuları teknik karşılaştırması.",
     "blocks": [_page_hero("Kalıcı Su Kuyusu Modelleri", "TEMİZ SU", "/demo/water.webp"), *_blocks("well-compare", "sponsor-plaques")]},
    {"key": "zekat-fetvalari", "label": "Zekat, Fitre & Kurban Fıkhi Sorular", "slug": "zekat-fetvalari",
     "description": "Fetva kartları, güncel nisap birimleri ve fitre/fidye hesaplayıcı.",
     "blocks": [_page_hero("Zekat, Fitre ve İnfak Fıkhı", "FIKHİ REHBER", "/demo/hands.webp"), *_blocks("fatwa-qa", "nisab-rates", "fidyah-calc")]},
    {"key": "katarakt-saglik", "label": "Katarakt & Acil Ameliyat Sponsorluğu", "slug": "katarakt-saglik",
     "description": "Ameliyat bekleyen vakalar, tıbbi destek ve saha günlükleri.",
     "blocks": [_page_hero("Katarakt ve Acil Sağlık Desteği", "SAĞLIK UMUDU", "/demo/relief.webp"), *_blocks("surgery-cases", "field-diary-feed")]},
    {"key": "kurban-secenekleri", "label": "Küçükbaş, Büyükbaş Hisse & Bölge Fiyatları", "slug": "kurban-secenekleri",
     "description": "Kurban hayvan/bölge seçenekleri, kesim durumu sorgu ve fetva kartları.",
     "blocks": [_page_hero("Kurban Hisse ve Bölge Seçenekleri", "KURBAN ORGANİZASYONU", "/demo/hands.webp"), *_blocks("qurbani-animals", "qurbani-lookup", "fatwa-qa")]},
    {"key": "kriz-bolgeleri", "label": "Küresel Kriz Bölgeleri & Acil Müdahale", "slug": "kriz-bolgeleri",
     "description": "Aktif kriz bölgeleri, saha belgeseli ve yardım konvoyu takibi.",
     "blocks": [_page_hero("Küresel Kriz Bölgeleri ve Acil Yardım", "ACİL MÜDAHALE", "/demo/relief.webp"), *_blocks("crisis-command", "convoy-logistics", "doc-spotlight")]},
    {"key": "mushaf-dagitimi", "label": "Mushaf & Eğitim Materyali Dağıtımı", "slug": "mushaf-dagitimi",
     "description": "Ülkelere göre Mushaf dağıtımı, hafızlık desteği ve kademeler.",
     "blocks": [_page_hero("Mushaf-ı Şerif ve İlim Seferberliği", "EĞİTİM & İLİM", "/demo/education.webp"), *_blocks("mushaf-aid", "donor-honor-tiers")]},
    {"key": "yonetim-kurulu", "label": "Yönetim, Denetim Kurulu & Kurumsal Yapı", "slug": "yonetim-kurulu",
     "description": "Yönetim ve denetim kurulu, resmi vergi muafiyeti ve şeffaflık.",
     "blocks": [_page_hero("Kurumsal Yönetim ve Şeffaflık", "YÖNETİM KURULU", "/demo/hands.webp"), *_blocks("governance-team", "tax-exemption")]},
    {"key": "kandil-ozel", "label": "Mübarek Günler & Üç Aylar İnfak Sayfası", "slug": "kandil-ozel",
     "description": "Kandil çağrısı, nisap/fitre oranları ve düzenli infak planlayıcısı.",
     "blocks": [_page_hero("Mübarek Günler ve Bereket İnfakı", "MANEVİ MEVSİM", "/demo/relief.webp"), *_blocks("sacred-days-cta", "nisab-rates", "recurring-kumbara")]},
    {"key": "havale-rehberi", "label": "Havale / EFT Açıklama & Nisap Rehberi", "slug": "havale-rehberi",
     "description": "Banka havale açıklama kodları, nisap birimleri ve IBAN kartları.",
     "blocks": [_page_hero("Havale / EFT ve Bağış Rehberi", "BANKA BİLGİLERİ", "/demo/hands.webp"), *_blocks("iban-helper", "nisab-rates", "bank-qr")]},
    {"key": "duzenli-bagis", "label": "Düzenli İnfak & Kumbara Programı", "slug": "duzenli-bagis",
     "description": "Aylık düzenli bağış planlayıcısı, hazır yardım paketleri ve vergi avantajları.",
     "blocks": [_page_hero("Düzenli Bağış ile Sürekli İyilik", "AYLIK KUMBARA", "/demo/hands.webp"), *_blocks("recurring-kumbara", "impact-bundles-row", "tax-exemption")]},
    {"key": "yardim-konvoylari", "label": "Yardım Konvoyları & Lojistik Takibi", "slug": "yardim-konvoylari",
     "description": "Yoldaki yardım tırları, acil ihtiyaç listesi ve saha fotoğrafları.",
     "blocks": [_page_hero("Yardım Konvoyları ve Saha Lojistiği", "CANLI TAKİP", "/demo/relief.webp"), *_blocks("convoy-logistics", "relief-needs", "social-squares")]},
    {"key": "yayinlarimiz", "label": "Yayınlar, Dergi & Faaliyet Kitapları", "slug": "yayinlarimiz",
     "description": "Dergi arşivi, yıllık şeffaflık almanağı ve saha bültenleri.",
     "blocks": [_page_hero("Yayınlar ve Faaliyet Arşivi", "KÜTÜPHANE", "/demo/education.webp"), *_blocks("publications-archive", "tax-exemption")]},
    {"key": "temsilciliklerimiz", "label": "İl & Ülke Temsilciliklerimiz", "slug": "temsilciliklerimiz",
     "description": "Şehir ve bölge temsilcileri, kurban vekalet takibi ve iletişim.",
     "blocks": [_page_hero("Temsilciliklerimiz ve Gönüllü Ağı", "SAHA AĞIMIZ", "/demo/hands.webp"), *_blocks("field-reps", "qurbani-lookup")]},
    {"key": "saglik-yardimlari", "label": "Sağlık & Katarakt Yardımları", "slug": "saglik-yardimlari",
     "description": "Katarakt ameliyatı, medikal destek ve saha dağıtım kanıtları sayfası.",
     "blocks": [_page_hero("Sağlık ve Katarakt Yardımları", "SAĞLIK DESTEĞİ", "/demo/relief.webp"), *_blocks("medical-aid", "impact-proof", "donation-cards")]},
    {"key": "kulliye-projesi", "label": "Külliye / Yetimhane Bölüm Sponsorluğu", "slug": "kulliye-projesi",
     "description": "Bölüm sponsorlukları, faz takipçisi ve hatıra duvarı ile külliye sayfası.",
     "blocks": [_page_hero("Kalıcı Eser Külliye Projesi", "BÖLÜM SPONSORLUĞU", "/demo/hands.webp"), *_blocks("kulliye-rooms", "milestone-phases", "memory-notes")]},
    {"key": "acil-ihtiyaclar", "label": "Acil İhtiyaç Listesi (Lojistik)", "slug": "acil-ihtiyaclar",
     "description": "Öncelikli acil ihtiyaç kalemleri, canlı bağış akışı ve QR IBAN.",
     "blocks": [_page_hero("Acil İhtiyaç Seferberliği", "LOJİSTİK", "/demo/relief.webp"), *_blocks("relief-needs", "live-donations-feed", "bank-qr")]},
    {"key": "iftar-kumanya", "label": "İftar & Kumanya Seferberliği", "slug": "iftar-kumanya",
     "description": "Canlı iftar hedef sayacı, fitre hesaplayıcı ve bağış kartları.",
     "blocks": [_page_hero("İftar ve Kumanya Sofraları", "RAMAZAN", "/demo/relief.webp"), *_blocks("iftar-meals", "fidyah-calc", "social-squares")]},
    {"key": "hediye-bagis", "label": "Sevdikleriniz Adına Hediye Bağış", "slug": "hediye-bagis",
     "description": "Dijital sertifika önizlemeli hediye bağış ve özel günler sayfası.",
     "blocks": [_page_hero("Sevdikleriniz Adına İyilik", "HEDİYE BAĞIŞ", "/demo/hands.webp"), *_blocks("gift-cert", "donation-cards", "testimonials-masonry")]},
    {"key": "subelerimiz", "label": "Şubeler & Temsilcilikler", "slug": "subelerimiz",
     "description": "Şube rehberi, canlı destek kartı ve iletişim formu.",
     "blocks": [_page_hero("Şubelerimiz ve Temsilciliklerimiz", "İLETİŞİM AĞI", "/demo/hands.webp"), *_blocks("branches-list", "help-desk", "contact-form")]},
    {"key": "mali-seffaflik", "label": "Yıllık Mali Şeffaflık & Dağılım", "slug": "mali-seffaflik",
     "description": "Fon dağılım grafiği, akreditasyon belgeleri ve faaliyet raporları.",
     "blocks": [_page_hero("Mali Şeffaflık ve Hesap Verebilirlik", "DENETİM", "/demo/hands.webp"), *_blocks("impact-breakdown", "awards-wall", "downloads-shelf")]},
    {"key": "adak-akika", "label": "Adak, Akika & Şükür Kurbanı", "slug": "adak-akika",
     "description": "Kurban vekalet niyetleri, hisse doluluk durumu ve SSS.",
     "blocks": [_page_hero("Vekaletle Adak ve Akika Kurbanı", "VEKALET", "/demo/relief.webp"), *_blocks("proxy-intents", "qurbani-shares", "faq-searchable")]},
    {"key": "bagis-kanallari", "label": "SMS & Hızlı Bağış Kanalları", "slug": "bagis-kanallari",
     "description": "SMS kısa kodları, QR IBAN hesapları ve mobil uygulama tanıtımı ile tüm bağış kanalları.",
     "blocks": [_page_hero("Tüm Bağış Kanallarımız", "KOLAY BAĞIŞ", "/demo/hands.webp"), *_blocks("sms-codes", "bank-qr", "app-download")]},
    {"key": "kalici-eserler", "label": "Kalıcı Eserler (Sadaka-i Cariye)", "slug": "kalici-eserler",
     "description": "Cami, okul, aşevi inşaatları ve günlük mikro infak seçenekleri.",
     "blocks": [_page_hero("Nesiller Boyu Süren Sadaka-i Cariye", "KALICI ESERLER", "/demo/water.webp"), *_blocks("perpetual-projects", "daily-micro", "family-sponsorship-cards")]},
    {"key": "bagis-rehberi", "label": "Fıkhi Bağış Rehberi", "slug": "bagis-rehberi",
     "description": "Zekat, kurban, fitre ve fıkhi sorular rehberi.",
     "blocks": [_page_hero("Fıkhi Bağış Rehberi", "BİLGİLENDİRME", "/demo/quran.webp"), *_blocks("fiqh-rulings", "fidyah-calc", "faq-searchable")]},
    {"key": "etkinlikler", "label": "Etkinlikler & Kermes Takvimi", "slug": "etkinlikler",
     "description": "Yaklaşan kermes, icazet ve saha açılış programları.",
     "blocks": [_page_hero("Etkinlikler ve Programlar", "TAKVİM", "/demo/hands.webp"), *_blocks("events-list", "volunteer-roles", "newsletter-inline")]},
    {"key": "su-kuyusu-takip", "label": "Su Kuyusu İnşaat & Takip", "slug": "su-kuyusu-takip",
     "description": "Kuyu durum takibi, önce/sonra karşılaştırma ve bağış kartlarıyla özel su kuyusu sayfası.",
     "blocks": [_page_hero("Temiz Suyla Gelen Hayat", "SU KUYULARI", "/demo/water.webp"), *_blocks("water-wells-status", "before-after-well", "donation-cards")]},
    {"key": "burs-destegi", "label": "Hafızlık & Öğrenci Bursu", "slug": "burs-destegi",
     "description": "Burs paketleri, etki kıyaslama matrisi ve mesaj formu ile burs sayfası.",
     "blocks": [_page_hero("İlim ve Hafızlık Bursu", "EĞİTİM DESTEĞİ", "/demo/quran.webp"), *_blocks("scholarship-plans", "impact-matrix", "testimonials-masonry")]},
    {"key": "kurumsal-destek", "label": "Kurumsal Sponsorluk (CSR)", "slug": "kurumsal-destek",
     "description": "Şirketler için sponsorluk kademeleri, resmi izin bandı ve faaliyet raporları.",
     "blocks": [_page_hero("Kurumsal Sosyal Sorumluluk", "KURUMSAL ORTAKLIK", "/demo/hands.webp"), *_blocks("corporate-csr", "transparency-seals", "downloads-shelf", "contact-form")]},
    {"key": "gonullu-ol", "label": "Gönüllülük & Temsilcilik", "slug": "gonullu-ol",
     "description": "Gönüllü rolleri, yardım alanı seçici ve başvuru formu.",
     "blocks": [_page_hero("İyilik Hareketine Katılın", "GÖNÜLLÜ OL", "/demo/hands.webp"), *_blocks("volunteer-roles", "donation-finder", "contact-form")]},
    {"key": "ramazan-ozel", "label": "Ramazan & İftar Özel Sayfası", "slug": "ramazan",
     "description": "Geri sayım, fitre/fidye hesaplayıcı, canlı bağış akışı ve zekat bandı ile Ramazan kampanya sayfası.",
     "blocks": [_page_hero("Ramazan Bereketini Paylaşalım", "RAMAZAN 2026", "/demo/relief.webp"), *_blocks("fidyah-calc", "zakat-nisab", "live-donations-feed", "donation-cards")]},
    {"key": "kurban-ozel", "label": "Kurban Organizasyonu Sayfası", "slug": "kurban",
     "description": "Kurban hisse paketleri, bölge kartları, video galeri ve SSS ile tam kurban sayfası.",
     "blocks": [_page_hero("Vacip ve Adak Kurbanlarınız Emanetimiz", "KURBAN ORGANİZASYONU", "/demo/relief.webp"), *_blocks("pricing-impact", "region-metrics", "video-reels", "faq-searchable")]},
    {"key": "acil-kriz", "label": "Acil Kriz & İnsani Yardım Sayfası", "slug": "acil-kriz",
     "description": "Acil uyarı vitrini, saha dağıtım kanıtları ve QR banka hesaplarıyla kriz sayfası.",
     "blocks": [_page_hero("Acil İnsani Yardım Seferberliği", "ACİL YARDIM", "/demo/relief.webp"), *_blocks("featured", "impact-proof", "bank-qr", "cta-whatsapp")]},
    {"key": "kurumsal-seffaflik", "label": "Kurumsal Şeffaflık & DERBİS", "slug": "kurumsal-seffaflik",
     "description": "Resmi izin ve fon dağılım bandı, faaliyet raporları rafı ve basında biz sayfası.",
     "blocks": [_page_hero("Şeffaflık ve Hesap Verebilirlik", "KURUMSAL", "/demo/hands.webp"), *_blocks("transparency-seals", "downloads-shelf", "press-wall", "volunteer-roles")]},
    {"key": "su-kuyusu-ozel", "label": "Su Kuyusu Kampanya Sayfası", "slug": "su-kuyusu",
     "description": "Önce/sonra karşılaştırma, bölge faaliyetleri, sayaçlar ve bağış kartlarıyla özel su kuyusu sayfası.",
     "blocks": [_page_hero("Bir Damla Hayat: Su Kuyuları", "SU KUYUSU", "/demo/water.webp"), *_blocks("before-after-well", "regions-world", "donation-cards", "faq-searchable")]},
    {"key": "yetim-sponsorluk", "label": "Yetim Sponsorluğu Sayfası", "slug": "yetim-sponsorlugu",
     "description": "Kademeli sponsorluk paketleri, hikaye akışı ve bağışçı yorumlarıyla yetim sayfası.",
     "blocks": [_page_hero("Bir Yetimin Yüzü Sizinle Gülsün", "YETİM SPONSORLUĞU", "/demo/orphan.webp"), *_blocks("pricing-sponsorship", "sticky-story-mission", "testimonials-block", "cta-pattern")]},
    {"key": "acil-yardim-ozel", "label": "Acil Yardım Özel Sayfası", "slug": "acil-yardim",
     "description": "Acil yardım vitrini, canlı hedef çubukları ve hızlı bağış kartları.",
     "blocks": [_page_hero("Kriz Bölgelerine Acil İnsani Yardım", "ACİL YARDIM", "/demo/relief.webp"), *_blocks("featured", "progress-targets", "donation-cards", "bank-accounts")]},
    {"key": "medrese-hafizlik", "label": "Hafızlık & Medrese Tanıtım", "slug": "hafizlik-medrese",
     "description": "Kur'an kursu tanıtımı, burs paketleri, veli bilgilendirme ve mesaj formu.",
     "blocks": [_page_hero("İlim ve Hafızlık Yolculuğu", "EĞİTİM & MEDRESE", "/demo/quran.webp"), *_blocks("quote-verse", "features-bento", "pricing-sponsorship", "contact-form")]},
    {"key": "seffaflik-raporu", "label": "Şeffaflık & Etki Raporu", "slug": "seffaflik-raporu",
     "description": "Bento etki vitrini, bölge sayıları, sayaçlar ve aramalı SSS.",
     "blocks": [_page_hero("Şeffaflık ve Yıllık Etki Raporu", "ŞEFFAFLIK", "/demo/hands.webp"), *_blocks("bento-impact", "counters-cards", "regions-world", "faq-searchable")]},
    {"key": "bagis-paketleri", "label": "Aylık Destek Paketleri", "slug": "destek-paketleri",
     "description": "Düzenli bağış ve sponsorluk paketlerinin karşılaştırmalı sayfası.",
     "blocks": [_page_hero("Düzenli İyilik Paketleri", "DESTEK PAKETLERİ", "/demo/hands.webp"), *_blocks("pricing-sponsorship", "sticky-story-mission", "donation-cards")]},
    {"key": "saha-videolari", "label": "Saha Videoları & Belgeseller", "slug": "saha-videolari",
     "description": "Video galeri, akan fotoğraf şeridi ve çağrı bandı.",
     "blocks": [_page_hero("Sahadan Video ve Belgeseller", "VİDEO ARŞİVİ", "/demo/relief.webp"), *_blocks("video-gallery-field", "carousel-ticker", "cta-pattern")]},
    {"key": "bolge-faaliyetleri", "label": "Ülke & Bölge Çalışmaları", "slug": "bolge-calismalari",
     "description": "Ülke/bölge kartları, Bento vitrin ve 3D Coverflow proje karuseli.",
     "blocks": [_page_hero("Dünya Genelinde Yardım Çalışmalarımız", "BÖLGELER", "/demo/water.webp"), *_blocks("regions-world", "carousel-coverflow", "bento-impact")]},
    {"key": "privacy-policy", "label": "KVKK & Gizlilik Politikası", "slug": "gizlilik-politikasi",
     "description": "Kişisel verilerin korunması ve gizlilik aydınlatma metni.",
     "blocks": [
         _page_hero("KVKK & Gizlilik Politikası", "YASAL BİLGİLENDİRME", "/demo/pattern.webp"),
         section([
             heading("1. Veri Sorumlusu ve Amaç", level="h2", center=False),
             text("Kurumumuz, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında bağışçılarımızın ve ziyaretçilerimizin kişisel verilerinin güvenliğini en üst düzeyde korumayı taahhüt eder."),
             heading("2. İşlenen Veriler ve Güvenlik", level="h2", center=False),
             text("Bağış işlemleri, makbuz düzenleme ve bilgilendirme süreçleri için paylaşılan ad, soyad, iletişim ve ödeme bilgileri yalnızca yasal yükümlülükler ve şeffaf bağış takibi amacıyla işlenir; üçüncü taraflarla izinsiz paylaşılmaz."),
             heading("3. Haklarınız ve Başvuru", level="h2", center=False),
             text("KVKK'nın 11. maddesi kapsamındaki bilgi talep etme, düzeltme ve silme haklarınız için iletişim sayfamız üzerinden bize her zaman ulaşabilirsiniz."),
         ]),
     ]},
    {"key": "cookie-policy", "label": "Çerez Politikası", "slug": "cerez-politikasi",
     "description": "Web sitesinde kullanılan çerezler ve tercih yönetimi hakkında bilgilendirme.",
     "blocks": [
         _page_hero("Çerez (Cookie) Politikası", "YASAL BİLGİLENDİRME", "/demo/pattern.webp"),
         section([
             heading("Çerez Nedir ve Neden Kullanılır?", level="h2", center=False),
             text("Ziyaretçi deneyimini iyileştirmek, bağış sepeti oturumunu korumak ve site güvenliğini sağlamak amacıyla zorunlu ve işlevsel çerezler kullanılmaktadır."),
             heading("Çerez Tercihlerini Yönetme", level="h2", center=False),
             text("Tarayıcı ayarlarınız üzerinden çerezleri dilediğiniz zaman silebilir veya engelleyebilirsiniz. Zorunlu oturum çerezlerinin kapatılması bağış adımlarında kısıtlamalara yol açabilir."),
         ]),
     ]},
    {"key": "terms-refund", "label": "Kullanım Şartları & Bağış İade", "slug": "kullanim-sartlari",
     "description": "Site kullanım koşulları, bağış onay ve iptal/iade esasları.",
     "blocks": [
         _page_hero("Kullanım Şartları & Bağış İade", "YASAL BİLGİLENDİRME", "/demo/pattern.webp"),
         section([
             heading("Genel Kullanım Koşulları", level="h2", center=False),
             text("Bu web sitesi üzerinden gerçekleştirilen tüm bağış ve destek işlemleri, ilgili kampanya ve faaliyet alanları doğrultusunda kayıt altına alınır."),
             heading("Hatalı İşlem ve İade Talepleri", level="h2", center=False),
             text("Sehven yapılan mükerrer veya hatalı tutardaki bağış işlemleri için 7 iş günü içerisinde iletişim kanallarımız üzerinden dekont bilgisiyle başvurulması halinde inceleme sonrası iade süreci başlatılır."),
         ]),
     ]},
    {"key": "corporate-partnership", "label": "Kurumsal İş Birliği & Sponsorluk", "slug": "kurumsal-is-birligi",
     "description": "Kurumlar ve şirketler için sosyal sorumluluk ve sponsorluk sayfası.",
     "blocks": [
         _page_hero("Kurumsal İş Birliği & Sosyal Sorumluluk", "KURUMSAL DESTEK", "/demo/hands.webp"),
         *_blocks("mission-3", "stats-dark", "cta-band", "contact"),
     ]},
    {"key": "thank-you", "label": "Bağış Teşekkür Sayfası", "slug": "tesekkurler",
     "description": "Bağış sonrası teşekkür mesajı, etki özeti ve paylaşım çağrısı.",
     "blocks": [
         _page_hero("Bağışınız İçin Teşekkür Ederiz", "İYİLİKTE BULUŞTUK", "/demo/relief.webp"),
         section([
             heading("Desteğiniz Umut Olmaya Devam Ediyor", level="h2"),
             text("Katkınız ihtiyaç sahiplerine ulaştırılmak üzere kayıt altına alınmıştır. Bağış makbuzunuz ve süreç bilgilendirmeleri e-posta/SMS yoluyla paylaşılacaktır."),
         ]),
         *_blocks("trust", "cta-pattern"),
     ]},
]

PAGE_BY_KEY = {p["key"]: p for p in PAGE_TEMPLATES}


# --- Demos -------------------------------------------------------------------------------

DEMOS: list[dict] = [
    {"key": "su-ve-yardim", "label": "Su & insani yardım", "kit": "ferah-turkuaz", "image": "/demo/water.webp",
     "description": "Slider kapak, kampanyalar, hikaye ve etki rakamları. Su kuyusu ve acil yardım dernekleri için.",
     "header": header_dark(), "footer": footer_four(),
     "home": _blocks("hero-slider", "campaigns-grid", "story", "stats-dark", "donate-band", "testimonials", "news", "cta-pattern"),
     "pages": ["about", "campaign-landing", "contact"]},
    {"key": "cami-vakif", "label": "Cami & vakıf", "kit": "arabi-altin", "image": "/demo/mosque.webp",
     "description": "Ortalı logo, Ramazan kapağı, bağış kategorileri ve zekat bandı.",
     "header": header_centered(), "footer": default_footer_blocks(),
     "home": _blocks("hero-mosque", "categories", "campaigns-carousel", "zakat", "about", "faq", "news"),
     "pages": ["ramadan", "about", "contact"]},
    {"key": "egitim", "label": "Eğitim & burs", "kit": "klasik-yesil", "image": "/demo/education.webp",
     "description": "Kapak + bağış formu, misyon kartları, burs kampanyaları ve gönüllülük.",
     "header": default_header_blocks(), "footer": default_footer_blocks(),
     "home": _blocks("hero-form", "mission-3", "campaigns-grid", "stats-dark", "volunteer", "news"),
     "pages": ["about", "volunteer", "contact"]},
    {"key": "yardim-dernegi", "label": "Yardım derneği", "kit": "modern-lacivert", "image": "/demo/relief.webp",
     "description": "Yan yana kapak, acil yardım, güvence maddeleri ve şeffaflık sayfası.",
     "header": header_minimal(), "footer": footer_four(),
     "home": _blocks("hero-split", "campaigns-ending", "values-4", "donate-band", "stats-auto", "cta-band", "faq"),
     "pages": ["transparency", "campaign-landing", "contact"]},
    {"key": "yetim", "label": "Yetim & aile", "kit": "sicak-toprak", "image": "/demo/orphan.webp",
     "description": "Sıcak tonlar, sponsorluk hikayesi, yorumlar ve sade footer.",
     "header": default_header_blocks(), "footer": footer_minimal(),
     "home": [B("banner", layout="image", image_url="/demo/orphan.webp", kicker="SPONSORLUK", title="Bir yetimin yüzü sizinle gülsün",
                text="Aylık sponsorlukla bir çocuğun eğitimini ve bakımını üstlenin.", button_label="Sponsor ol", button_url="/kampanyalar",
                style={"desktop": {"min_height": 520}}),
              *_blocks("donate-band", "mission-3", "campaigns-grid", "testimonials", "faq")],
     "pages": ["about", "volunteer", "contact"]},
]

DEMOS += [
    {"key": "ramazan", "label": "Ramazan kampanyası", "kit": "gece-mavisi", "image": "/demo/ramadan.webp",
     "description": "Ramazan slider'ı, kayan yazı, geri sayım, kategoriler, sepetli bağış kartları ve ayet.",
     "header": header_dark(), "footer": footer_four(),
     "home": _blocks("slider-ramadan", "marquee-accent", "categories", "countdown-ramadan", "donation-cards", "quote-verse", "counters-plain", "zakat", "faq"),
     "pages": ["ramadan", "bank", "faq"]},
    {"key": "kurban", "label": "Kurban organizasyonu", "kit": "klasik-yesil", "image": "/demo/kurban.webp",
     "description": "Kurban slider'ı, geri sayım, adımlar, bağış kartları, sayaç bandı ve hesap numaraları.",
     "header": default_header_blocks(), "footer": footer_four(),
     "home": [*_blocks("announcement", "slider-kurban", "countdown-kurban", "steps", "donation-cards", "counters-band", "testimonials-block"), _KURBAN_FAQ, *_blocks("bank-accounts")],
     "pages": ["kurban", "bank", "contact"]},
    {"key": "kurumsal-vakif", "label": "Kurumsal vakıf", "kit": "zarif-bordo", "image": "/demo/hands.webp",
     "description": "Tam ekran slider, çalışma alanları, sayaç bandı, tarihçe, ekip, iş ortakları ve mesaj formu.",
     "header": header_centered(), "footer": footer_four(),
     "home": _blocks("slider-fullscreen", "features-work", "counters-band", "about", "tabs-activities", "timeline-history", "team-board", "logos-partners", "contact-form"),
     "pages": ["history", "team", "report", "activities"]},
    {"key": "kis-yardimi", "label": "Kış & acil yardım", "kit": "modern-lacivert", "image": "/demo/winter.webp",
     "description": "Kış slider'ı, acil kampanya vitrini, hedef çubukları, kampanyalar ve galeri.",
     "header": header_minimal(), "footer": default_footer_blocks(),
     "home": _blocks("slider-winter", "featured", "progress-targets", "campaigns-grid", "features-why", "gallery-grid", "cta-pattern"),
     "pages": ["winter", "water", "bank"]},
    {"key": "kuran-kursu", "label": "Kur'an kursu & medrese", "kit": "arabi-altin", "image": "/demo/quran.webp",
     "description": "Eğitim slider'ı, ayet, çalışma alanları, sayaçlar, sekmeler ve ön kayıt çağrısı.",
     "header": header_centered(), "footer": footer_minimal(),
     "home": _blocks("slider-education", "quote-verse", "mission-3", "counters-cards", "tabs-activities", "campaigns-grid", "gallery-masonry", "volunteer"),
     "pages": ["about", "team", "activities", "contact"]},
]

DEMOS.append({
    "key": "hayir-kapisi", "label": "Hayır Kapısı (sepetli bağış)", "kit": "hakder", "image": "/demo/relief.webp",
    "description": "Duyuru çubuğu, yeşil çift header ve mega menü, poster slider, sayaçlar, sepete eklenen bağış kartları "
                   "(niyet, hisse, süre, döviz), mesaj formu ve Çağrı Merkezi'li footer. Mesafeli sözleşme, iade ve çerez sayfalarıyla.",
    "header": _HK["header"], "footer": _HK["footer"], "home": _HK["home"], "pages": _HK_PAGE_KEYS,
})

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
