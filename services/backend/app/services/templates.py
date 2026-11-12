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
_section("quote-verse", "Ayet / hadis (ortalı)", "Hakkımızda", "Büyük, ortalı alıntı.",
         [section([B("quote", text="Sevdiğiniz şeylerden Allah yolunda harcamadıkça iyiliğe asla erişemezsiniz.", source="Âl-i İmrân, 92", look="centered")], tone="soft")])
_section("quote-card", "Söz kartı", "Hakkımızda", "Kart içinde alıntı.",
         [B("quote", text="İnsanların en hayırlısı, insanlara en faydalı olandır.", source="Hadis-i Şerif", look="card")])
_section("gallery-grid", "Görsel galerisi (ızgara)", "Hakkımızda", "Kare ızgara; tıklanınca büyür. Görselleri kendinizinkilerle değiştirin.",
         [B("image_gallery", kicker="SAHADAN", title="Fotoğraflarla çalışmalarımız", columns=4, aspect="1/1", items=[
             {"image_url": f"/demo/{name}.webp", "caption": caption} for name, caption in (
                 ("water", "Su kuyusu açılışı"), ("education", "Burs töreni"), ("food", "Aşevi"), ("orphan", "Yetim buluşması"),
                 ("kurban", "Kurban organizasyonu"), ("winter", "Kış yardımı"), ("relief", "Koli dağıtımı"), ("community", "Gönüllülerimiz"))])])
_section("gallery-masonry", "Görsel galerisi (karışık)", "Hakkımızda", "Orijinal oranlarıyla üç sütun.",
         [B("image_gallery", title="Galeri", columns=3, aspect="masonry", gap=16, items=[
             {"image_url": f"/demo/{name}.webp"} for name in ("mosque", "quran", "hands", "ramadan", "water", "kurban")])])

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
_section("progress-targets", "Hedef çubukları", "Etki & güven", "Proje hedeflerine ne kadar yaklaşıldığını gösterir.",
         [B("progress_bars", kicker="HEDEFLERİMİZ", title="2027 hedeflerinde neredeyiz?", items=[
             {"label": "100 yeni su kuyusu", "percent": 64, "note": "64 / 100 kuyu"}, {"label": "5.000 kışlık koli", "percent": 82, "note": "4.100 / 5.000 koli"},
             {"label": "1.000 yeni yetim sponsoru", "percent": 37, "note": "370 / 1.000"}])])
_section("logos-partners", "İş ortakları şeridi", "Etki & güven", "Kendiliğinden kayan kurum adları/logoları.",
         [B("logos", title="Birlikte çalıştığımız kurumlar", marquee=True, grayscale=True, items=[
             {"name": "Belediye"}, {"name": "Kızılay"}, {"name": "AFAD"}, {"name": "Müftülük"}, {"name": "Üniversite"}, {"name": "Ticaret Odası"}])])
_section("steps", "Nasıl bağış yapılır?", "Etki & güven", "Dört adımda bağış süreci.", [B("steps", kicker="KOLAYCA", title="Dört adımda bağış")])
_section("testimonials-block", "Teşekkür mesajları (kaydırmalı)", "Etki & güven", "Bağışçı mesajları karuseli.",
         [B("testimonials", kicker="SİZDEN GELENLER", title="Bağışçılarımız anlatıyor", items=[
             {"quote": "Kurban videom aynı gün geldi, gözlerim doldu. Allah razı olsun.", "name": "Hasan T.", "role": "İstanbul"},
             {"quote": "Yıllardır düzenli bağış yapıyorum; her kuruşun raporunu görüyorum.", "name": "Mustafa E.", "role": "Konya"},
             {"quote": "Açtırdığımız kuyunun fotoğraflarını çocuklarımla izledik.", "name": "İbrahim S.", "role": "Almanya"},
         ])])

_section("countdown-kurban", "Geri sayım: Kurban", "Çağrı", "Kurban Bayramı'na geri sayım (tarihi kendi yılınıza göre değiştirin).",
         [B("countdown", kicker="KURBAN 2027", title="Kurban kayıtlarının kapanmasına", text="Vekaletinizi son güne bırakmayın.", target="2027-05-15T18:00:00+03:00",
            button_label="Kurban bağışla", button_url="/kampanyalar", done_text="Kurban kayıtlarımız tamamlandı. Allah kabul etsin.", tone="brand")])
_section("countdown-ramadan", "Geri sayım: Ramazan", "Çağrı", "Ramazan başlangıcına geri sayım; koyu zemin.",
         [B("countdown", kicker="HOŞ GELDİN", title="Ramazan'a kalan süre", target="2027-02-08T00:00:00+03:00", button_label="Ramazan bağışları", button_url="/kampanyalar",
            done_text="Ramazan-ı Şerif mübarek olsun.", tone="dark")])
_section("marquee-brand", "Kayan yazı (ana renk)", "Çağrı", "Tam genişlik kayan duyuru şeridi.",
         [B("marquee", tone="brand", speed="normal", items=[{"text": "Zekat"}, {"text": "Fitre"}, {"text": "Kurban"}, {"text": "Su kuyusu"}, {"text": "Yetim sponsorluğu"}, {"text": "Burs"}])])
_section("marquee-accent", "Kayan duyuru (vurgu)", "Çağrı", "Vurgu renginde duyuru metinleri.",
         [B("marquee", tone="accent", speed="slow", separator="•", items=[{"text": "Kurban kayıtları başladı"}, {"text": "Bağışlarınız için resmi makbuz"}, {"text": "7/24 online bağış"}])])
_section("announcement", "Duyuru çubuğu (kapatılabilir)", "Çağrı", "Sayfanın üstünde ince, kapatılabilir duyuru.",
         [B("announcement_bar", text="Kurban bağışları başladı — vekaletinizi hemen verin.", url="/kampanyalar", tone="danger", icon="🐑")])
_section("popup-campaign", "Açılır pencere (kampanya)", "Çağrı", "Sayfa açılınca bir kez görünen kampanya penceresi.",
         [B("popup", image_url="/demo/kurban.webp", kicker="KURBAN 2027", title="Kurban vekaletinizi verdiniz mi?", text="Kesim videonuz ve bilgilendirme mesajınız aynı gün gönderilir.",
            button_label="Kurban bağışla", button_url="/kampanyalar", delay=4, hide_days=3, size="md")])
_section("featured", "Acil kampanya vitrini", "Bağış", "Öne çıkan kampanyayı büyük vitrinde gösterir.", [B("featured_campaign", kicker="ACİL")])
_section("donation-cards", "Bağış kartları (sepetli)", "Bağış", "Tutar girip sepete eklenen kartlar; öne çıkan kampanyalardan.",
         [B("donation_cards", kicker="HIZLI BAĞIŞ", title="Bağış yapabilirsiniz", source="featured")])
_section("bank-accounts", "Hesap numaraları", "Bağış", "IBAN kartları ve kopyala düğmesi (bilgileri kendinizinkilerle değiştirin).",
         [B("bank_accounts", kicker="HAVALE / EFT", title="Hesap numaralarımız", text="Açıklama kısmına bağış türünü yazmayı unutmayın.", items=[
             {"bank": "Vakıf Katılım", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 00", "currency": "TRY"},
             {"bank": "Kuveyt Türk", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 01", "currency": "TRY"},
             {"bank": "Ziraat Katılım", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 02", "currency": "USD"},
             {"bank": "Ziraat Katılım", "branch": "Merkez", "holder": "Örnek Yardım Derneği", "iban": "TR00 0000 0000 0000 0000 0000 03", "currency": "EUR"},
         ], note="Örnek açıklamalar: ZEKAT · FİTRE · KURBAN · SU KUYUSU · GENEL BAĞIŞ. Havale sonrası makbuz için bizi arayabilirsiniz.")])
_section("contact-form", "Mesaj formu (görselli)", "SSS & iletişim", "Solda görsel ve rozet, sağda mesaj formu.",
         [B("contact_form", kicker="MESAJ GÖNDERİN", title="İyiliğe uzanan elimize destek olun", image_url="/demo/hands.webp", badge_value="70k", badge_text="Ulaşılan aile")])
_section("gallery-strip", "Galeri şeridi", "SSS & iletişim", "Galeri sayfanızdaki son görseller.", [B("gallery_strip", kicker="GALERİ", title="Sahadan kareler", limit=10)])

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
SECTION_BY_KEY = {s["key"]: s for s in SECTIONS}

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
