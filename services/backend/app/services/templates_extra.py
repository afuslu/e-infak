"""Extra rich templates: +10 headers, +10 footers, +100 content sections, +18 page templates, +7 site demos.

Imported by templates.py to massively expand Site Builder variety while keeping templates.py readable.
"""

from __future__ import annotations


def register_extra_templates(ctx: dict) -> None:
    B = ctx["B"]
    _row = ctx["_row"]
    section = ctx["section"]
    columns = ctx["columns"]
    heading = ctx["heading"]
    card = ctx["card"]
    card_columns = ctx["card_columns"]
    _section = ctx["_section"]
    _slides = ctx["_slides"]
    _page_hero = ctx["_page_hero"]
    _blocks = ctx["_blocks"]
    _TABLET_DOWN = ctx["_TABLET_DOWN"]
    CENTER = ctx["CENTER"]
    PAGE_TEMPLATES = ctx["PAGE_TEMPLATES"]
    DEMOS = ctx["DEMOS"]
    SECTIONS = ctx["SECTIONS"]

    # =========================================================================
    # +10 EXTRA HEADERS (20 -> 30)
    # =========================================================================

    def header_floating_pill() -> list:
        return [_row({"tone": "light", "height": 74, "sticky": True, "shrink": True, "border": True, "center_align": "center"},
                     [B("logo", show_tagline=False, size=40)],
                     [B("nav_menu", source="header", mobile="drawer")],
                     [B("cart_button", show_label=False), B("donate_button", p={"style": "accent"}, size="sm", heart=True)],
                     style={"border_radius": 999, "margin_top": 10})]

    def header_mega_topbar_soft() -> list:
        return [
            _row({"tone": "soft", "height": 38, "border": True},
                 [B("contact_info", layout="inline")],
                 [B("richtext", text="Resmî Makbuzlu Güvenli Online Bağış", advanced=_TABLET_DOWN)],
                 [B("language_switcher", advanced=_TABLET_DOWN), B("currency_switcher", advanced=_TABLET_DOWN)], style={"font_size": 12}),
            _row({"tone": "light", "height": 82, "sticky": True, "shrink": True, "center_align": "center"},
                 [B("logo", size=48)],
                 [B("nav_menu", source="header", mobile="drawer")],
                 [B("account_links", layout="inline", advanced=_TABLET_DOWN), B("donate_button", p={"style": "primary"}, size="md", heart=True)]),
        ]

    def header_dark_search() -> list:
        return [_row({"tone": "dark", "height": 80, "sticky": True, "shrink": True, "border": False, "center_align": "center"},
                     [B("logo", light=True, size=44)],
                     [B("nav_menu", source="header", mobile="drawer")],
                     [B("site_search", advanced=_TABLET_DOWN), B("donate_button", p={"style": "accent"}, size="md", heart=True)])]

    def header_brand_two_row() -> list:
        return [
            _row({"tone": "dark", "height": 34, "border": False},
                 [B("social_icons", p={"style": "text"})],
                 [B("richtext", text="Dünya Genelinde 48 Ülkede İnsani Yardım", advanced=_TABLET_DOWN)],
                 [B("contact_info", layout="inline")], style={"font_size": 12}),
            _row({"tone": "brand", "height": 78, "sticky": True, "shrink": True, "border": False, "center_align": "center"},
                 [B("logo", light=True, size=46)],
                 [B("nav_menu", source="header", mobile="drawer")],
                 [B("cart_button", show_label=False), B("donate_button", p={"style": "light"}, size="md", heart=True)]),
        ]

    def header_whatsapp_cta() -> list:
        return [
            _row({"tone": "brand", "height": 36, "border": False},
                 [B("contact_info", layout="inline")],
                 [],
                 [B("social_icons", p={"style": "text"}), B("account_links", layout="inline")], style={"font_size": 12}),
            _row({"tone": "light", "height": 78, "sticky": True, "shrink": True, "center_align": "left"},
                 [B("logo", size=46)],
                 [B("nav_menu", source="header", mobile="drawer")],
                 [B("donate_button", p={"style": "primary"}, size="md", heart=True)]),
        ]

    def header_account_focus() -> list:
        return [_row({"tone": "light", "height": 78, "sticky": True, "shrink": True, "border": True, "center_align": "center"},
                     [B("logo", size=44)],
                     [B("nav_menu", source="header", mobile="drawer")],
                     [B("account_links", layout="inline"), B("cart_button", show_label=False), B("donate_button", p={"style": "accent"}, size="sm", heart=True)])]

    def header_minimal_dark() -> list:
        return [_row({"tone": "dark", "height": 68, "sticky": True, "shrink": True, "border": False, "center_align": "right"},
                     [B("logo", light=True, show_tagline=False, size=38)],
                     [B("nav_menu", source="header", mobile="drawer")],
                     [B("donate_button", p={"style": "outline"}, size="sm")])]

    def header_centered_minimal() -> list:
        return [
            _row({"tone": "light", "height": 84, "border": False, "center_align": "center"},
                 [B("social_icons", p={"style": "text"}, advanced=_TABLET_DOWN)],
                 [B("logo", size=50)],
                 [B("donate_button", p={"style": "primary"}, size="sm", heart=True)]),
            _row({"tone": "light", "height": 50, "sticky": True, "shrink": True, "border": True, "center_align": "center"},
                 [], [B("nav_menu", source="header", mobile="drawer")], []),
        ]

    def header_split_dual_cta() -> list:
        return [_row({"tone": "light", "height": 80, "sticky": True, "shrink": True, "border": True, "center_align": "left"},
                     [B("logo", size=44)],
                     [B("nav_menu", source="header", mobile="drawer")],
                     [B("currency_switcher", advanced=_TABLET_DOWN), B("account_links", layout="inline", advanced=_TABLET_DOWN), B("donate_button", p={"style": "accent"}, size="md", heart=True)])]

    def header_glass_brand() -> list:
        return [_row({"tone": "brand", "height": 76, "sticky": True, "shrink": True, "border": False, "center_align": "center"},
                     [B("logo", light=True, size=44)],
                     [B("nav_menu", source="header", mobile="drawer")],
                     [B("language_switcher", advanced=_TABLET_DOWN), B("donate_button", p={"style": "accent"}, size="md", heart=True)],
                     style={"backdrop_filter": "blur(14px)"})]

    _section("header-floating-pill", "Yüzen hap (Floating Pill)", "Header", "Yuvarlatılmış modern yüzen üst menü çubuğu.", header_floating_pill(), kind="header")
    _section("header-mega-topbar-soft", "Yumuşak üst bantlı tam bar", "Header", "Üstte iletişim, dil ve döviz; altta hesap ve bağış butonu.", header_mega_topbar_soft(), kind="header")
    _section("header-dark-search", "Koyu arama + bağış barı", "Header", "Koyu zemin üzerinde menü, site içi arama ve bağış.", header_dark_search(), kind="header")
    _section("header-brand-two-row", "Çift satır kurumsal renkli", "Header", "Üstte koyu bilgi şeridi, altta marka renkli güçlü menü.", header_brand_two_row(), kind="header")
    _section("header-whatsapp-cta", "İletişim bantlı sol hizalı", "Header", "Üstte marka renkli telefon/hesap barı, altta sade menü.", header_whatsapp_cta(), kind="header")
    _section("header-account-focus", "Bağışçı paneli odaklı", "Header", "Bağışçı girişi, sepet ve bağış butonunu öne çıkaran tek satır.", header_account_focus(), kind="header")
    _section("header-minimal-dark", "Minimal koyu ince bar", "Header", "Slogansız, ince, modern koyu üst menü.", header_minimal_dark(), kind="header")
    _section("header-centered-minimal", "Ortalı sade iki satır", "Header", "Üstte ortalanmış büyük logo, altta ince beyaz menü şeridi.", header_centered_minimal(), kind="header")
    _section("header-split-dual-cta", "Döviz + hesap + bağış", "Header", "Uluslararası bağışçılar için döviz ve hesap kısayollu tek satır.", header_split_dual_cta(), kind="header")
    _section("header-glass-brand", "Marka renkli cam efektli", "Header", "Kurumsal tonda buzlu cam efektli, dil seçicili üst bar.", header_glass_brand(), kind="header")

    # =========================================================================
    # +10 EXTRA FOOTERS (18 -> 28)
    # =========================================================================

    def footer_dark_iban_newsletter() -> list:
        return [section([
            B("bank_accounts", title="Hızlı IBAN Hesapları", look="minimal_copy_strip"),
            B("divider", look="gradient", padding_y="md"),
            columns("2-1-1",
                    [B("logo", light=True, show_about=True), B("newsletter", look="inline_bar", title="E-Bülten Aboneliği")],
                    [B("nav_menu", source="header", layout="vertical", mobile="inline", title="Projeler")],
                    [B("contact_info", title="İletişim", layout="stacked", show_address=True)], gap=36),
            B("copyright", style={"margin_top": 32}, show_powered=True),
        ], tone="dark", top=52, bottom=24, margin_top=64)]

    def footer_brand_cta_3col() -> list:
        return [section([
            B("cta_band", kicker="DESTEK OLUN", title="İyilik kervanına bugün katılın", button_label="Bağış Yap", button_url="/kampanyalar", look="dark"),
            columns("1-1-1",
                    [B("logo", light=True, show_about=True), B("social_icons", p={"style": "round"})],
                    [B("nav_menu", source="footer", layout="vertical", mobile="inline", title="Kurumsal")],
                    [B("contact_info", title="Merkez Ofis", layout="stacked", show_address=True)], gap=36),
            B("copyright", style={"margin_top": 32}, show_powered=True),
        ], tone="brand", top=52, bottom=24, margin_top=64)]

    def footer_light_minimal_links() -> list:
        return [section([
            columns("1-1",
                    [B("logo", show_tagline=False), B("copyright", show_powered=True)],
                    [B("nav_menu", source="footer", layout="horizontal", mobile="inline", align="right"), B("social_icons", p={"style": "pill"}, align="right")], gap=24),
        ], tone="light", top=32, bottom=24, margin_top=48)]

    def footer_dark_compact_bar() -> list:
        return [section([
            columns("1-1",
                    [B("logo", light=True, show_tagline=False), B("contact_info", layout="inline")],
                    [B("nav_menu", source="footer", layout="horizontal", mobile="inline", align="right"), B("social_icons", p={"style": "round"}, align="right")], gap=24),
            B("copyright", style={"margin_top": 20}, show_powered=True),
        ], tone="dark", top=36, bottom=20, margin_top=48)]

    def footer_soft_4col_trust() -> list:
        return [section([
            B("trust", look="seals"),
            columns("1-1-1-1",
                    [B("logo", show_about=True), B("social_icons", p={"style": "pill"})],
                    [B("nav_menu", source="header", layout="vertical", mobile="inline", title="Faaliyetler")],
                    [B("nav_menu", source="footer", layout="vertical", mobile="inline", title="Kurumsal")],
                    [B("contact_info", title="Bağışçı Hattı", layout="stacked", show_address=True), B("donate_button", p={"style": "accent"}, heart=True)], gap=32),
            B("copyright", style={"margin_top": 32}, show_powered=True),
        ], tone="soft", top=48, bottom=24, margin_top=64)]

    def footer_zakat_quick_links() -> list:
        return [section([
            columns("1-1-1-1",
                    [B("logo", light=True, show_about=True), B("donate_button", p={"style": "accent"}, heart=True)],
                    [B("nav_menu", source="header", layout="vertical", mobile="inline", title="Zekat & Bağış")],
                    [B("nav_menu", source="footer", layout="vertical", mobile="inline", title="Politikalar")],
                    [B("newsletter", look="inline_bar", title="Bülten"), B("social_icons", p={"style": "round"})], gap=36),
            B("copyright", style={"margin_top": 36}, show_powered=True),
        ], tone="dark", top=56, bottom=24, margin_top=64)]

    def footer_gradient_prestige() -> list:
        return [section([
            B("trust", look="dark_shield_bar"),
            columns("1-1-1",
                    [B("logo", light=True, show_about=True), B("social_icons", p={"style": "round"})],
                    [B("nav_menu", source="header", layout="vertical", mobile="inline", title="Hızlı Erişim")],
                    [B("contact_info", title="İletişim", layout="stacked", show_address=True), B("account_links", layout="inline")], gap=40),
            B("divider", look="gradient", padding_y="md"),
            B("copyright", show_powered=True),
        ], tone="dark", top=56, bottom=24, margin_top=64)]

    def footer_split_contact_newsletter() -> list:
        return [section([
            columns("1-1",
                    [B("logo", show_about=True), B("contact_info", title="Genel Merkez", layout="stacked", show_address=True), B("social_icons", p={"style": "pill"})],
                    [B("newsletter", look="centered_card", title="Aylık Saha Raporları"), B("nav_menu", source="footer", layout="horizontal", mobile="inline")], gap=44),
            B("copyright", style={"margin_top": 32}, show_powered=True),
        ], tone="soft", top=52, bottom=20, margin_top=64)]

    def footer_classic_light_3col() -> list:
        return [section([
            columns("1-1-1",
                    [B("logo", show_about=True), B("social_icons", p={"style": "pill"})],
                    [B("nav_menu", source="footer", layout="vertical", mobile="inline", title="Kurumsal")],
                    [B("contact_info", title="İletişim", layout="stacked", show_address=True)], gap=36),
            B("divider", look="line", padding_y="md"),
            B("copyright", show_powered=True),
        ], tone="light", top=48, bottom=20, margin_top=64)]

    def footer_mega_donor_hub() -> list:
        return [section([
            B("cta_band", kicker="GÜVENLİ BAĞIŞ", title="Sorularınız mı var? Bağışçı danışmanlarımızla görüşün.", button_label="Bize Ulaşın", button_url="/iletisim", look="glass"),
            columns("1-1-1-1",
                    [B("logo", light=True, show_about=True)],
                    [B("nav_menu", source="header", layout="vertical", mobile="inline", title="Kampanyalar")],
                    [B("nav_menu", source="footer", layout="vertical", mobile="inline", title="Bilgi")],
                    [B("contact_info", title="İletişim", layout="stacked", show_address=True), B("social_icons", p={"style": "round"})], gap=32),
            B("copyright", style={"margin_top": 32}, show_powered=True),
        ], tone="dark", top=56, bottom=24, margin_top=64)]

    _section("footer-dark-iban-newsletter", "IBAN + E-bültenli koyu", "Footer", "Üstte tek satır IBAN şeridi, altta e-bülten ve 3 sütun.", footer_dark_iban_newsletter(), kind="footer")
    _section("footer-brand-cta-3col", "Marka renkli çağrılı 3 sütun", "Footer", "Üstte koyu çağrı bandı, altta marka renkli 3 sütunlu footer.", footer_brand_cta_3col(), kind="footer")
    _section("footer-light-minimal-links", "Ultra sade tek satır açık", "Footer", "Beyaz zemin, sol logo ve telif, sağ yatay linkler ve sosyal.", footer_light_minimal_links(), kind="footer")
    _section("footer-dark-compact-bar", "Kompakt koyu tek blok", "Footer", "Az yer kaplayan modern koyu iletişim ve menü barı.", footer_dark_compact_bar(), kind="footer")
    _section("footer-soft-4col-trust", "Güven mühürlü açık 4 sütun", "Footer", "Üstte güven rozetleri, altta açık 4 sütun ve bağış butonu.", footer_soft_4col_trust(), kind="footer")
    _section("footer-zakat-quick-links", "Zekat & bültenli 4 sütun", "Footer", "Koyu zemin, 4 sütun, e-bülten ve öne çıkan bağış butonu.", footer_zakat_quick_links(), kind="footer")
    _section("footer-gradient-prestige", "Kalkan şeritli prestij koyu", "Footer", "Üstte koyu güven kalkanı şeridi, altta 3 sütun ve hesap linki.", footer_gradient_prestige(), kind="footer")
    _section("footer-split-contact-newsletter", "İletişim + Bülten 2 sütun", "Footer", "Solda genel merkez bilgileri, sağda e-bülten kartı ve menü.", footer_split_contact_newsletter(), kind="footer")
    _section("footer-classic-light-3col", "Klasik beyaz 3 sütun", "Footer", "Temiz beyaz zemin, ince ayırıcı ve 3 sütunlu kurumsal yapı.", footer_classic_light_3col(), kind="footer")
    _section("footer-mega-donor-hub", "Cam çağrılı mega footer", "Footer", "Üstte cam efektli destek bandı ve 4 sütunlu koyu merkez.", footer_mega_donor_hub(), kind="footer")

    # =========================================================================
    # +96 EXTRA CONTENT SECTIONS (340 -> 436)
    # =========================================================================

    # --- 1. KAPAK & SLIDER (+18) ---
    _section("slider-floating-donate-pro", "Slider: Yüzen Hızlı Bağış Kartlı", "Kapak & Slider", "Slayt üzerinde hızlı tutar seçmeli yüzen bağış kutusu.", [
        B("slider", slides=_slides(), layout="floating_donate", height="lg", autoplay=True, arrows=True, dots=True, effect="fade"),
    ])
    _section("slider-spotlight-cinema", "Slider: Sinematik Spotlight", "Kapak & Slider", "Vurgulu odak ışıklı, geniş ekran kampanya slider'ı.", [
        B("slider", slides=_slides(), layout="spotlight", height="lg", autoplay=True, arrows=True, dots=True, effect="fade"),
    ])
    _section("slider-split-dark-editorial", "Slider: Koyu Bölünmüş Vitrin", "Kapak & Slider", "Sol koyu tipografi, sağ tam boy saha görseli slider'ı.", [
        B("slider", slides=_slides(), layout="split_dark", height="lg", autoplay=True, arrows=True, dots=True),
    ])
    _section("slider-magazine-grid", "Slider: Dergi (Magazine) Vitrini", "Kapak & Slider", "Editoryal dergi tarzı ana slayt ve yan kartlar.", [
        B("slider", slides=_slides(), layout="magazine", height="lg", autoplay=True, arrows=True, dots=True),
    ])
    _section("slider-bento-showcase", "Slider: Bento Modern Vitrin", "Kapak & Slider", "Bento ızgara hissi veren çoklu görünüm slider'ı.", [
        B("slider", slides=_slides(), layout="bento", height="lg", autoplay=True, arrows=True, dots=True),
    ])
    _section("slider-vertical-thumbs-pro", "Slider: Dikey Önizleme Şeritli", "Kapak & Slider", "Sağda dikey slayt seçici şeridi bulunan kurumsal slider.", [
        B("slider", slides=_slides(), layout="vertical_thumbs", height="lg", autoplay=True, arrows=True),
    ])
    _section("slider-duotone-impact", "Slider: Çift Tonlu (Duotone) Etki", "Kapak & Slider", "Marka renkli çift ton filtreli vurucu kapak slider'ı.", [
        B("slider", slides=_slides(), layout="duotone", height="lg", autoplay=True, dots=True),
    ])
    _section("slider-kinetic-collage", "Slider: Kinetik Kolaj Vitrin", "Kapak & Slider", "Hareketli kolaj düzeninde modern saha vitrini.", [
        B("slider", slides=_slides(), layout="kinetic_collage", height="lg", autoplay=True, arrows=True),
    ])
    _section("slider-peek-carousel", "Slider: Yan Slayt Gözüken (Peek)", "Kapak & Slider", "Sonraki slaytın kenarını gösteren akıcı kapak vitrini.", [
        B("slider", slides=_slides(), layout="peek", height="lg", autoplay=True, arrows=True, dots=True),
    ])
    _section("slider-stacked-cards", "Slider: Üst Üste Kart Destesi", "Kapak & Slider", "Kart destesi efektli, dikkat çekici kampanya slider'ı.", [
        B("slider", slides=_slides(), layout="stacked", height="lg", autoplay=True, arrows=True, dots=True),
    ])
    _section("banner-stats-hero", "Kapak: Sayaçlı İstatistik Banner", "Kapak & Slider", "Kapak görseli üzerinde canlı rakamlar ve bağış butonu.", [
        B("banner", layout="stats_banner", image_url="/demo/water.webp", kicker="ETKİMİZ", title="Temiz Su ile Değişen Hayatlar", text="48 ülkede binlerce aileye kalıcı su kuyusu ulaştırdık.", button_label="Su Kuyusu Açtır", button_url="/kampanyalar", height="lg"),
    ])
    _section("banner-floating-card-hero", "Kapak: Yüzen Beyaz Kartlı", "Kapak & Slider", "Görsel üzerinde öne çıkan yüzen kartlı modern kapak.", [
        B("banner", layout="floating_card", image_url="/demo/orphan.webp", kicker="YETİM PROJESİ", title="Geleceğe Umutla Bakan Çocuklar", text="Eğitim, sağlık ve barınma desteğiyle her ay yanlarındayız.", button_label="Sponsor Ol", button_url="/kampanyalar", height="lg"),
    ])
    _section("banner-split-countdown-hero", "Kapak: Geri Sayımlı Kampanya", "Kapak & Slider", "Ramazan veya kurban dönemi için geri sayımlı bölünmüş kapak.", [
        B("banner", layout="split_countdown", image_url="/demo/kurban.webp", kicker="KURBAN 2026", title="Vekaletle Kurban Kayıtları Devam Ediyor", text="Kesim videonuz ve bilgilendirme SMS'iniz aynı gün telefonunuzda.", button_label="Hisse Bağışla", button_url="/kampanyalar", height="lg"),
    ])
    _section("banner-duotone-overlay-hero", "Kapak: Çift Tonlu Kurumsal", "Kapak & Slider", "Derin çift tonlu kaplama ve ortalı büyük başlık.", [
        B("banner", layout="duotone_overlay", image_url="/demo/mosque.webp", kicker="VAKIF GELENEĞİ", title="Asırlık İyilik Mirasını Yaşatıyoruz", text="Eğitim, aşevi ve kalıcı eser projelerimizle hizmetinizdeyiz.", button_label="Projelerimiz", button_url="/kampanyalar", align="center", height="lg"),
    ])
    _section("banner-diagonal-modern", "Kapak: Diyagonal Kesimli Modern", "Kapak & Slider", "Çapraz kesimli dinamik kurumsal kapak düzeni.", [
        B("banner", layout="diagonal", image_url="/demo/education.webp", kicker="EĞİTİM BURSU", title="İlim Yolcularına Destek Olun", text="Hafızlık ve üniversite burslarıyla geleceğin öncülerini yetiştiriyoruz.", button_label="Burs Ver", button_url="/kampanyalar", height="lg"),
    ])
    _section("banner-ribbon-corner-appeal", "Kapak: Köşe Şeritli Acil Çağrı", "Kapak & Slider", "Köşe rozetli, yüksek dönüşümlü insani yardım kapağı.", [
        B("banner", layout="ribbon_corner", image_url="/demo/relief.webp", tone="red", kicker="ACİL ÇAĞRI", title="Kriz Bölgelerine Hemen Ulaşalım", text="Gıda, temiz su ve acil tıbbi destek tırlarımız yola çıkıyor.", button_label="Acil Destek Ol", button_url="/kampanyalar", height="md"),
    ])
    _section("banner-poster-editorial", "Kapak: Afiş (Poster) Tipografik", "Kapak & Slider", "Büyük afiş tipografisiyle sade ve çarpıcı duyuru kapağı.", [
        B("banner", layout="poster", image_url="/demo/hands.webp", kicker="GÖNÜL KÖPRÜSÜ", title="Paylaştıkça Çoğalan Bereket", text="Her bağış bir ailenin sofrasına umut olur.", button_label="Bağış Yap", button_url="/kampanyalar", align="center", height="lg"),
    ])
    _section("banner-split-stats-overlay", "Kapak: Rakam Bindirmeli Bölünmüş", "Kapak & Slider", "Sol başlık + aksiyon, sağ görsel üzerinde şeffaf etki kartı.", [
        B("banner", layout="split_stats_overlay", image_url="/demo/water.webp", kicker="GÜVEN & ŞEFFAFLIK", title="Her Bağış Kayıt Altında, Her Proje Videolu", text="Saha ekiplerimizin doğrudan teslimatıyla emanetiniz güvende.", button_label="İncele", button_url="/hakkimizda", height="lg"),
    ])

    # --- 2. BAĞIŞ (+20) ---
    _section("donate-quick-bar-strip", "Hızlı Bağış Yatay Şeridi", "Bağış", "Tek satırda tutar seçip anında sepete ekleme şeridi.", [
        B("donation_cards", source="latest", layout="quick_bar", card_style="classic", kicker="ANINDA BAĞIŞ", title="Hızlı Bağış Çubuğu", limit=4),
    ])
    _section("donate-bento-featured", "Bağış Kartları: Bento Vitrin", "Bağış", "Öne çıkan kampanyayı büyüten modern bento bağış ızgarası.", [
        B("donation_cards", source="latest", layout="bento", card_style="highlight", kicker="ÖNE ÇIKANLAR", title="En Acil İhtiyaç Alanları", limit=5),
    ])
    _section("donate-progress-ring-grid", "Bağış Kartları: Dairesel İlerlemeli", "Bağış", "Hedef oranını dairesel halka ile gösteren bağış kartları.", [
        B("donation_cards", source="latest", layout="progress_ring", card_style="classic", kicker="HEDEF TAKİBİ", title="Tamamlanmak Üzere Olan Projeler", limit=6),
    ])
    _section("donate-emerald-dark-grid", "Bağış Kartları: Zümrüt Koyu Tema", "Bağış", "Zümrüt koyu zeminli vakıf estetiğinde 3'lü bağış kartları.", [
        B("donation_cards", source="latest", layout="grid", card_style="classic", card_theme="emerald", kicker="VAKIF PROJELERİ", title="Zümrüt Seçki Bağış Kalemleri", limit=6),
    ])
    _section("donate-cream-warm-grid", "Bağış Kartları: Sıcak Krem Tema", "Bağış", "Sıcak krem tonlu, okunaklı ve samimi 3'lü bağış kartları.", [
        B("donation_cards", source="latest", layout="grid", card_style="bordered", card_theme="cream", kicker="İYİLİK SEÇKİSİ", title="Gönül Sofrası Bağışları", limit=6),
    ])
    _section("donate-carousel-swipe", "Bağış Kartları: Kaydırmalı Carousel", "Bağış", "Yatay kaydırılabilir, mobil dostu bağış kartları şeridi.", [
        B("donation_cards", source="latest", layout="carousel", card_style="classic", kicker="KEŞFET", title="Tüm Bağış Alanlarımız", limit=8),
    ])
    _section("donate-comparison-table", "Bağış Paketleri: Karşılaştırma Tablosu", "Bağış", "Farklı bağış tutar ve kapsamlarını yan yana kıyaslayan tablo.", [
        B("donation_cards", source="latest", layout="comparison_table", card_style="bordered", kicker="PAKETLER", title="Bağış Seçeneklerini Karşılaştırın", limit=4),
    ])
    _section("donate-wizard-guided", "Bağış Sihirbazı (Adım Adım)", "Bağış", "Bağışçıyı adım adım yönlendiren etkileşimli bağış kutusu.", [
        B("donation_cards", source="latest", layout="wizard", card_style="highlight", kicker="KOLAY BAĞIŞ", title="3 Adımda Bağışınızı Tamamlayın", limit=6),
    ])
    _section("donate-table-rows-fast", "Bağış Listesi: Hızlı Tablo Satırları", "Bağış", "Çoklu bağış kalemini tek ekranda adet/tutarla ekleme tablosu.", [
        B("donation_cards", source="latest", layout="table_rows", card_style="minimal", kicker="TOPLU BAĞIŞ", title="Hızlı Bağış Listesi", limit=10),
    ])
    _section("donate-tabbed-categories", "Bağış Kartları: Sekmeli Kategoriler", "Bağış", "Kategori sekmeleri arasında anında geçişli bağış kartları.", [
        B("donation_cards", source="tabs", layout="tabbed_card", card_style="classic", kicker="KATEGORİLER", title="Alana Göre Bağış Yapın", limit=6),
    ])
    _section("campaigns-emerald-gold", "Kampanyalar: Zümrüt & Altın Izgara", "Bağış", "Zümrüt-altın tonlu premium vakıf kampanya vitrini.", [
        B("campaigns", source="latest", layout="emerald_gold_grid", kicker="ÖZEL PROJELER", title="Seçkin Vakıf Kampanyaları", limit=6),
    ])
    _section("campaigns-sapphire-modern", "Kampanyalar: Safir Kurumsal Izgara", "Bağış", "Modern lacivert/safir tonlu kurumsal kampanya kartları.", [
        B("campaigns", source="latest", layout="sapphire_modern_grid", kicker="KURUMSAL PROJELER", title="Aktif Yardım Kampanyaları", limit=6),
    ])
    _section("campaigns-ruby-urgent", "Kampanyalar: Acil Kırmızı Vurgulu", "Bağış", "Acil insani yardım kampanyalarını öne çıkaran kırmızı vurgu.", [
        B("campaigns", source="latest", layout="ruby_urgent_grid", kicker="ACİL DESTEK", title="Öncelikli Acil Yardım Çağrıları", limit=6),
    ])
    _section("campaigns-dark-luxury", "Kampanyalar: Koyu Prestij Vitrin", "Bağış", "Koyu zemin üzerinde yüksek kontrastlı kampanya ızgarası.", [
        B("campaigns", source="latest", layout="dark_luxury_grid", kicker="PREMİUM VİTRİN", title="Öne Çıkan Kalıcı Eserler", limit=6),
    ])
    _section("campaigns-tabbed-filter", "Kampanyalar: Sekmeli Filtreli", "Bağış", "Üstte kategori sekmeli, filtreli kampanya ızgarası.", [
        B("campaigns", source="latest", layout="tabbed_categories", kicker="TÜM KAMPANYALAR", title="Destek Alanını Seçin", limit=9),
    ])
    _section("iban-emerald-vault", "IBAN: Zümrüt Koyu Banka Kartları", "Bağış", "Zümrüt zeminli, tek tık kopyalamalı prestij IBAN kartları.", [
        B("bank_accounts", title="Resmî Vakıf IBAN Hesaplarımız", look="emerald_vault_cards"),
    ])
    _section("iban-dark-vault", "IBAN: Koyu Kasa (Vault) Kartları", "Bağış", "Koyu antrasit zemin üzerinde net ve şık IBAN kartları.", [
        B("bank_accounts", title="Havale & EFT Hesap Bilgileri", look="dark_vault_cards"),
    ])
    _section("iban-qr-showcase", "IBAN: QR Kodlu Hızlı Havale", "Bağış", "Mobil bankacılık için QR kod destekli IBAN vitrini.", [
        B("bank_accounts", title="QR ile Saniyeler İçinde Havale", look="qr_showcase"),
    ])
    _section("iban-swift-international", "IBAN: Yurtdışı SWIFT & Döviz", "Bağış", "EUR, USD ve SWIFT kodlarıyla uluslararası bağış hesapları.", [
        B("bank_accounts", title="Uluslararası SWIFT / Döviz Hesapları", look="swift_international"),
    ])
    _section("iban-currency-tabs", "IBAN: Para Birimi Sekmeli (TL/USD/EUR)", "Bağış", "TRY, USD ve EUR hesaplarını sekmelerle ayıran temiz görünüm.", [
        B("bank_accounts", title="Para Birimine Göre Banka Hesapları", look="grouped_currency_tabs"),
    ])

    # --- 3. ETKİ & GÜVEN (+16) ---
    _section("stats-ring-progress", "Sayaçlar: Dairesel İlerleme Halkaları", "Etki & Güven", "Yuvarlak halka çerçeveli modern etki göstergeleri.", [
        B("stats", mode="manual", variant="ring", columns="4", kicker="GÜVEN VEREN SONUÇLAR", title="Saha Başarılarımız", items=[
            {"value": "48", "label": "Ülke"},
            {"value": "1.450", "label": "Su Kuyusu"},
            {"value": "22.000", "label": "Yetim"},
            {"value": "95%", "label": "Saha Oranı"},
        ]),
    ])
    _section("stats-big-hero-numbers", "Sayaçlar: Dev Tipografik Rakamlar", "Etki & Güven", "Minimalist, çok büyük tipografik vurgu rakamları.", [
        B("stats", mode="manual", variant="big_hero_numbers", columns="4", kicker="BÜYÜK ETKİ", title="Rakamlarla İyilik Köprüsü", items=[
            {"value": "2.4M", "label": "Sıcak Yemek"},
            {"value": "180K", "label": "Gıda Kolisi"},
            {"value": "1.200+", "label": "Kalıcı Kuyu"},
            {"value": "16 Yıl", "label": "Tecrübe"},
        ]),
    ])
    _section("stats-dark-gold-prestige", "Sayaçlar: Koyu Zemin Altın Rakamlar", "Etki & Güven", "Koyu antrasit zemin üzerinde altın vurgulu vakıf sayaçları.", [
        B("stats", mode="manual", variant="dark_gold_counters", columns="4", kicker="VAKIF RAPORU", title="Emanetlerinizin Sahadaki Karşılığı", items=[
            {"value": "48", "label": "Ülkede Hizmet"},
            {"value": "68.000", "label": "Kurban Hissesi"},
            {"value": "14.500", "label": "Yetim Sponsorluğu"},
            {"value": "3.100", "label": "Katarakt Ameliyatı"},
        ]),
    ])
    _section("stats-glass-dark-cards", "Sayaçlar: Koyu Cam Efektli Kartlar", "Etki & Güven", "Koyu zemin ve cam efektli modern etki kartları.", [
        section([
            B("stats", mode="manual", variant="glass_dark", columns="4", kicker="ANLIK ÖZET", title="İyilikte Birlikte Büyüyoruz", items=[
                {"value": "340K", "label": "Ulaşılan Aile"},
                {"value": "94%", "label": "Doğrudan Yardım"},
                {"value": "120+", "label": "Saha Ekibi"},
                {"value": "7/24", "label": "Bağışçı Desteği"},
            ]),
        ], tone="dark", top=56, bottom=56),
    ])
    _section("stats-bordered-metrics", "Sayaçlar: Çerçeveli Kurumsal Kartlar", "Etki & Güven", "Net çerçeveli, okunaklı kurumsal faaliyet sayaçları.", [
        B("stats", mode="manual", variant="bordered_metric_cards", columns="4", kicker="ŞEFFAFLIK", title="Yıllık Faaliyet Rakamları", items=[
            {"value": "520", "label": "Yeni Su Kuyusu"},
            {"value": "85.000", "label": "Ramazan Kumanyası"},
            {"value": "4.800", "label": "Öğrenci Bursu"},
            {"value": "%100", "label": "Resmî Makbuz"},
        ]),
    ])
    _section("stats-minimal-inline-strip", "Sayaçlar: İnce Çizgili Minimal Şerit", "Etki & Güven", "Sayfa aralarına hafifçe oturan minimal yatay sayaç şeridi.", [
        B("stats", mode="manual", variant="minimal_inline_stats", columns="4", items=[
            {"value": "48", "label": "Ülke"},
            {"value": "1.240", "label": "Kuyu"},
            {"value": "18.500", "label": "Yetim"},
            {"value": "15 Yıl", "label": "Güven"},
        ]),
    ])
    _section("steps-zigzag-delivery", "Süreç: Zikzak Teslimat Akışı", "Etki & Güven", "Sağlı-sollu zikzak adımlarla bağıştan teslimata süreç.", [
        B("steps", look="zigzag", kicker="NASIL ÇALIŞIR?", title="Bağışınız Sahaya Nasıl Ulaşır?"),
    ])
    _section("steps-vertical-connected", "Süreç: Dikey Bağlantı Çizgili", "Etki & Güven", "Birbirine bağlı dikey akışla adım adım şeffaf süreç.", [
        B("steps", look="vertical_connected", kicker="ADIM ADIM", title="4 Aşamada Güvenli Teslimat"),
    ])
    _section("steps-numbered-glass", "Süreç: Cam Efektli Numaralı Kartlar", "Etki & Güven", "Modern cam efektli numaralı bağış adımları.", [
        B("steps", look="numbered_glass_cards", kicker="KOLAY SÜREÇ", title="Saniyeler İçinde İyiliğe Ortak Olun"),
    ])
    _section("steps-dark-numbered", "Süreç: Koyu Numaralı Kartlar", "Etki & Güven", "Koyu zemin üzerinde vurgulu numaralı süreç kartları.", [
        B("steps", look="dark_numbered_cards", kicker="VEKALET SÜRECİ", title="Kurban & Su Kuyusu İşleyişimiz"),
    ])
    _section("steps-horizontal-arrows", "Süreç: Oklarla Bağlı Yatay Akış", "Etki & Güven", "Yatay oklarla birbirine bağlanan hızlı süreç şeması.", [
        B("steps", look="horizontal_arrows", kicker="HIZLI AKIŞ", title="Bağıştan Videolu Teslimata"),
    ])
    _section("steps-compact-badges", "Süreç: Rozetli Kompakt Adımlar", "Etki & Güven", "Az yer kaplayan, ikonlu ve rozetli süreç şeridi.", [
        B("steps", look="compact_badge_steps", kicker="GÜVENLİ ADIMLAR", title="3 Adımda Online Bağış"),
    ])
    _section("trust-certificate-grid", "Güven: Resmî İzin & Sertifika Izgarası", "Etki & Güven", "Kamu yararı, denetim ve ödeme güvenliği belgeleri vitrini.", [
        B("trust", look="certificate_grid"),
    ])
    _section("trust-dark-shield-bar", "Güven: Koyu Kalkan Güvenlik Bandı", "Etki & Güven", "256-bit SSL, 3D Secure ve resmî makbuz güvencesi koyu bandı.", [
        B("trust", look="dark_shield_bar"),
    ])
    _section("trust-split-guarantee", "Güven: İki Sütunlu Emanet Sözü", "Etki & Güven", "Sol güvence metni, sağda maddeli şeffaflık taahhüdü.", [
        B("trust", look="split_guarantee"),
    ])
    _section("trust-icon-card-grid", "Güven: İkonlu Güvence Kartları", "Etki & Güven", "Dörtlü ikonlu kartlarla bağışçı güven ilkeleri.", [
        B("trust", look="icon_card_grid"),
    ])

    # --- 4. ÇAĞRI & BANNER (+14) ---
    _section("cta-dark-gold-ornate", "Çağrı: Koyu Altın Vakıf Bandı", "Çağrı & Banner", "Antrasit-altın tonlu, zarif kurumsal bağış çağrısı.", [
        B("cta_band", look="dark_gold_ornate", kicker="SADAKA-İ CARİYE", title="Adınıza Kalıcı Bir Eser Bırakın", text="Su kuyusu, mescid ve eğitim burslarıyla kesintisiz hayır kapısı açın.", button_label="Projeleri İncele", button_url="/kampanyalar"),
    ])
    _section("cta-dark-emerald", "Çağrı: Zümrüt Koyu Bağış Bandı", "Çağrı & Banner", "Derin zümrüt yeşili zemin üzerinde yüksek dönüşümlü çağrı.", [
        B("cta_band", look="dark_emerald_cta", kicker="TEMİZ SU", title="Bir Köyün Susuzluğunu Birlikte Dindirelim", text="Hisse veya tam kuyu bağışıyla yüzlerce aileye temiz su ulaştırın.", button_label="Su Kuyusu Bağışı", button_url="/kampanyalar"),
    ])
    _section("cta-dark-sapphire", "Çağrı: Safir Kurumsal Çağrı Bandı", "Çağrı & Banner", "Lacivert-safir kurumsal tonda güçlü aksiyon bandı.", [
        B("cta_band", look="dark_sapphire_cta", kicker="KURUMSAL İŞ BİRLİĞİ", title="Şirketinizle Sosyal Sorumluluk Projesi Başlatın", text="Markanıza özel raporlu ve denetimli iyilik projeleri oluşturuyoruz.", button_label="Kurumsal Başvuru", button_url="/iletisim"),
    ])
    _section("cta-floating-glass", "Çağrı: Yüzen Cam Efektli Kart", "Çağrı & Banner", "Yarı saydam cam efektli modern yüzen çağrı bloğu.", [
        B("cta_band", look="floating_glass_cta", kicker="DÜZENLİ BAĞIŞ", title="Her Ay Küçük Bir Destekle Büyük Fark Oluşturun", text="Düzenli bağış talimatıyla yetim ve eğitim projelerimize nefes olun.", button_label="Düzenli Bağışçı Ol", button_url="/kampanyalar"),
    ])
    _section("cta-urgent-red-split", "Çağrı: Acil Kırmızı Kriz Bandı", "Çağrı & Banner", "Afet ve acil insani krizler için yüksek öncelikli kırmızı çağrı.", [
        B("cta_band", look="split_urgent_red", kicker="ACİL İNSANİ YARDIM", title="Sıcak Yemek ve İlaç İçin Acil Destek Gerekiyor", text="Saha ekiplerimiz bölgede; desteğiniz bugün sofralara ulaşsın.", button_label="Hemen Acil Bağış Yap", button_url="/kampanyalar"),
    ])
    _section("cta-whatsapp-direct", "Çağrı: WhatsApp Hızlı Destek Bandı", "Çağrı & Banner", "Bağışçıları tek tıkla WhatsApp danışma hattına yönlendirir.", [
        B("cta_band", look="whatsapp_direct", kicker="WHATSAPP DESTEK", title="Zekat, Kurban veya Kuyu İçin Bize Yazın", text="Bağışçı danışmanlarımız tüm sorularınızı anında yanıtlıyor.", button_label="WhatsApp'tan Yaz", button_url="/iletisim"),
    ])
    _section("cta-quick-amounts-band", "Çağrı: Hazır Tutarlı Hızlı Çağrı", "Çağrı & Banner", "Önerilen tutar butonlarıyla tek tıkla bağışa yönlendiren bant.", [
        B("cta_band", look="quick_amounts", kicker="HIZLI DESTEK", title="Bugün Bir İyilik Başlat", text="Seçtiğiniz tutarla gıda, su veya eğitim fonuna anında katkı sağlayın.", button_label="Bağış Yap", button_url="/kampanyalar"),
    ])
    _section("cta-split-image-pro", "Çağrı: Görselli Bölünmüş Çağrı", "Çağrı & Banner", "Sol metin & buton, sağ saha görseli içeren dengeli çağrı.", [
        B("cta_band", look="split_image_cta", image_url="/demo/orphan.webp", kicker="YETİM HÂMİLİĞİ", title="Bir Yetimin Gülümsemesine Vesile Olun", text="Aylık sponsorlukla eğitim ve bakım masraflarını üstlenin.", button_label="Yetim Destekle", button_url="/kampanyalar"),
    ])
    _section("cta-floating-pill-bar", "Çağrı: Hap (Pill) Aksiyon Şeridi", "Çağrı & Banner", "Tam yuvarlatılmış, modern ve dikkat çekici kompakt çağrı.", [
        B("cta_band", look="floating_pill", kicker="ZEKAT HESAPLA", title="Güncel Nisapla Zekatınızı Saniyeler İçinde Hesaplayın", button_label="Zekat Hesaplayıcı", button_url="/zekat"),
    ])
    _section("cta-bordered-minimal", "Çağrı: İnce Çerçeveli Kurumsal", "Çağrı & Banner", "Sade beyaz zemin üzerinde çerçeveli kurumsal duyuru bandı.", [
        B("cta_band", look="bordered", kicker="GÖNÜLLÜ OL", title="İyilik Ekibimize Katılmak İster misiniz?", text="Saha dağıtımı, eğitim veya medya alanında gönüllü olabilirsiniz.", button_label="Gönüllü Başvurusu", button_url="/iletisim"),
    ])
    _section("buttons-floating-3d-cta", "Aksiyon: 3D Gölgeli Bağış Butonları", "Çağrı & Banner", "Yüksek kontrastlı 3D gölgeli çoklu bağış yönlendirme butonları.", [
        section([
            B("buttons", layout="floating_shadow", size="lg", gap="md", align="center", items=[
                {"icon": "💧", "label": "Su Kuyusu", "url": "/kampanyalar", "style": "primary"},
                {"icon": "🐑", "label": "Adak & Akika", "url": "/kampanyalar", "style": "accent"},
                {"icon": "🕌", "label": "Zekat & Fitre", "url": "/kampanyalar", "style": "dark"},
            ]),
        ], tone="light", top=28, bottom=28),
    ])
    _section("buttons-gradient-shadow-row", "Aksiyon: Gradyan Gölgeli Satır", "Çağrı & Banner", "Renk geçişli ve yumuşak gölgeli hızlı erişim butonları.", [
        section([
            B("buttons", layout="gradient_shadow_buttons", size="lg", gap="md", align="center", items=[
                {"icon": "❤️", "label": "Online Bağış Yap", "url": "/kampanyalar", "style": "primary"},
                {"icon": "🧾", "label": "IBAN Bilgileri", "url": "/iletisim", "style": "accent"},
            ]),
        ], tone="soft", top=32, bottom=32),
    ])
    _section("buttons-outline-to-solid", "Aksiyon: Hover'da Dolan Çerçeveli", "Çağrı & Banner", "Üzerine gelince dolan zarif çerçeveli kategori butonları.", [
        section([
            B("buttons", layout="outline_to_solid", size="md", gap="md", align="center", items=[
                {"icon": "🌍", "label": "Afrika", "url": "/kampanyalar", "style": "outline"},
                {"icon": "🇵🇸", "label": "Gazze & Filistin", "url": "/kampanyalar", "style": "outline"},
                {"icon": "🇹🇷", "label": "Yurt İçi Yardım", "url": "/kampanyalar", "style": "outline"},
                {"icon": "💧", "label": "Su Kuyuları", "url": "/kampanyalar", "style": "outline"},
            ]),
        ], tone="light", top=28, bottom=28),
    ])
    _section("buttons-icon-split-pair", "Aksiyon: İkonlu Çift Ana Buton", "Çağrı & Banner", "İki ana aksiyonu yan yana dengeli sunan büyük buton ikilisi.", [
        section([
            B("buttons", layout="icon_split_pair", size="lg", gap="lg", align="center", items=[
                {"icon": "🤲", "label": "Hemen Bağış Yap", "url": "/kampanyalar", "style": "primary"},
                {"icon": "📞", "label": "Bağışçı Hattını Ara", "url": "/iletisim", "style": "outline"},
            ]),
        ], tone="soft", top=32, bottom=32),
    ])

    # --- 5. METİN & MEDYA (+10) ---
    _section("gallery-marquee-infinite", "Galeri: Sonsuz Akan Fotoğraf Şeridi", "Metin & Medya", "Sahadan kareleri kesintisiz yatay akışla (marquee) sergiler.", [
        B("gallery_strip", kicker="SAHADAN ANLIK", title="İyiliğin Fotoğrafları", look="marquee", aspect="4/3", click_action="lightbox", limit=12),
    ])
    _section("gallery-dual-marquee", "Galeri: Çift Yönlü Akan Vitrin", "Metin & Medya", "İki satır zıt yönde akan etkileyici fotoğraf duvarı.", [
        B("gallery_strip", kicker="ARŞİV", title="48 Ülkeden İyilik Kareleri", look="dual_marquee", aspect="4/3", click_action="lightbox", limit=16),
    ])
    _section("gallery-filmstrip-cinema", "Galeri: Sinema Film Şeridi", "Metin & Medya", "Sinematik film şeridi görünümünde saha fotoğrafları.", [
        B("gallery_strip", kicker="BELGESEL KARELER", title="Saha Günlüğünden", look="filmstrip", aspect="16/9", caption_mode="always", click_action="lightbox", limit=10),
    ])
    _section("gallery-polaroid-warm", "Galeri: Sıcak Polaroid Albüm", "Metin & Medya", "Albüm etiketli, nostaljik polaroid çerçeveli fotoğraf vitrini.", [
        B("gallery_strip", kicker="HATIRALAR", title="Tebessüm Dolu Anlar", look="polaroid", show_album=True, click_action="lightbox", limit=8),
    ])
    _section("media-video-showcase-dark", "Video: Koyu Saha Belgeseli Vitrini", "Metin & Medya", "Koyu zemin üzerinde yüksek kontrastlı saha video galerisi.", [
        section([
            B("video_gallery", kicker="SAHA BELGESELLERİ", title="Emanetlerinizin Teslim Anları", layout="grid"),
        ], tone="dark", top=56, bottom=56),
    ])
    _section("media-split-founder-letter", "Editoryal: Başkanın / Vakıf Mesajı", "Metin & Medya", "Sol görsel, sağda kurumsal vizyon mesajı ve faaliyet raporu butonu.", [
        section([
            columns("1-2",
                    [B("image", image_url="/demo/mosque.webp", alt="Vakıf merkezi", look="framed")],
                    [heading("Emanet Bilinciyle 15 Yıldır Sahadayız", kicker="VAKIF MESAJI", center=False),
                     B("richtext", text="Her bir bağışçımızın güvenini en kıymetli emanetimiz biliyor; şeffaflık, hız ve yerinde denetim ilkeleriyle ihtiyaç sahiplerine ulaşıyoruz."),
                     B("buttons", layout="row", items=[{"label": "Hakkımızda", "url": "/hakkimizda", "style": "primary"}, {"label": "Denetim Raporu", "url": "/hakkimizda", "style": "outline"}])],
                    gap=40),
        ], tone="light", top=56, bottom=56),
    ])
    _section("media-water-story-split", "Hikaye: Temiz Su Öncesi & Sonrası", "Metin & Medya", "Sol hikaye + aksiyon, sağ su kuyusu görseli ile duygusal anlatım.", [
        section([
            columns("1-1",
                    [heading("Bir Kuyu Açıldığında Sadece Su Değil, Hayat Akar", kicker="SAHA HİKAYESİ", center=False),
                     B("richtext", text="Kilometrelerce yürüyerek suya ulaşan çocuklar artık okullarına gidebiliyor; köylerde temiz içme suyu sayesinde salgın hastalıklar azalıyor."),
                     B("buttons", layout="emerald_glow", items=[{"icon": "💧", "label": "Su Kuyusu Hissesi Al", "url": "/kampanyalar", "style": "primary"}])],
                    [B("image", image_url="/demo/water.webp", alt="Su kuyusu açılışı", look="shadow")],
                    gap=40),
        ], tone="soft", top=56, bottom=56),
    ])
    _section("media-orphan-editorial-dark", "Hikaye: Yetim Hâmiliği Koyu Vitrin", "Metin & Medya", "Koyu zemin üzerinde etkileyici yetim hikayesi ve sponsorluk çağrısı.", [
        section([
            columns("1-1",
                    [B("image", image_url="/demo/orphan.webp", alt="Yetim eğitim desteği", look="rounded")],
                    [heading("Bir Çocuğun Elinden Tutmak Dünyayı Değiştirir", kicker="YETİM HÂMİLİĞİ", center=False),
                     B("richtext", text="Aylık düzenli sponsorluk desteğinizle yetim yavrularımızın okul, kıyafet, beslenme ve barınma ihtiyaçlarını yıl boyu karşılıyoruz."),
                     B("buttons", layout="floating_shadow", items=[{"icon": "❤️", "label": "Yetim Sponsoru Ol", "url": "/kampanyalar", "style": "accent"}])],
                    gap=40),
        ], tone="dark", top=56, bottom=56),
    ])
    _section("media-two-photo-feature", "Medya: Çift Görselli Saha Özeti", "Metin & Medya", "İki saha görseli ve altında özet tanıtım metni.", [
        section([
            heading("Dünyanın Dört Bir Yanında İyilik İzleri", kicker="SAHA ÇALIŞMALARIMIZ"),
            columns("1-1",
                    [B("image", image_url="/demo/kurban.webp", alt="Kurban dağıtımı", look="rounded")],
                    [B("image", image_url="/demo/education.webp", alt="Eğitim desteği", look="rounded")], gap=24),
        ], tone="light", top=48, bottom=48),
    ])
    _section("media-image-gallery-grid", "Galeri: Fotoğraf Izgarası + Başlık", "Metin & Medya", "Doğrudan fotoğraf galerisi bloğu ile temiz vitrin.", [
        B("image_gallery", kicker="FOTOĞRAF ARŞİVİ", title="Çalışmalarımızdan Seçkiler", layout="grid"),
    ])

    # --- 6. SSS & İLETİŞİM (+10) ---
    _section("faq-searchable-pro", "SSS: Arama Çubuklu Akordeon", "SSS & İletişim", "Bağışçıların soru arayabildiği etkileşimli SSS bloğu.", [
        B("faq", look="searchable_accordion", kicker="YARDIM MERKEZİ", title="Aradığınız Cevabı Hemen Bulun", items=[
            {"question": "Online bağış güvenli mi?", "answer": "<p>Tüm ödemeler 256-bit SSL şifreleme ve 3D Secure korumasıyla bankalar üzerinden doğrudan işlenir.</p>"},
            {"question": "Kurban vekaletimi nasıl verebilirim?", "answer": "<p>Ödeme adımında hisse sahibi adını yazmanız ve vekalet onayını işaretlemeniz yeterlidir.</p>"},
            {"question": "Yurt dışından bağış yapabilir miyim?", "answer": "<p>Evet, uluslararası banka kartları ve SWIFT/EUR/USD hesaplarımızla dünyanın her yerinden bağış yapabilirsiniz.</p>"},
        ]),
    ])
    _section("faq-two-column-grid", "SSS: İki Sütunlu Kart Izgarası", "SSS & İletişim", "Soruları yan yana 2 sütunda açıkça gösteren modern SSS.", [
        B("faq", look="two_column_grid", kicker="BİLGİ BANKASI", title="En Çok Sorulan Sorular", items=[
            {"question": "Bağış makbuzu ne zaman gelir?", "answer": "<p>İşlem onaylandığı anda SMS ve e-posta ile dijital makbuzunuz gönderilir.</p>"},
            {"question": "Su kuyusu kaç ayda açılır?", "answer": "<p>Bölge ve kuyu tipine göre ortalama 2 ila 4 ay içinde tamamlanıp videosu iletilir.</p>"},
            {"question": "Zekat fonu nasıl dağıtılır?", "answer": "<p>Zekat bağışları ayrı hesapta tutulur ve yalnızca müstehak ailelere ulaştırılır.</p>"},
            {"question": "Düzenli bağışımı iptal edebilir miyim?", "answer": "<p>Bağışçı panelinden veya çağrı merkezimizden dilediğiniz zaman tek tıkla yönetebilirsiniz.</p>"},
        ]),
    ])
    _section("faq-dark-bordered-prestige", "SSS: Koyu Çerçeveli Prestij", "SSS & İletişim", "Koyu zemin ve belirgin çerçeveli modern akordeon SSS.", [
        B("faq", look="dark_bordered_faq", kicker="SORU & CEVAP", title="Merak Edilen Her Şey", items=[
            {"question": "Kurban kesim videosu isim okunarak mı çekiliyor?", "answer": "<p>Evet, her hisse sahibinin ismi okunarak video kaydı alınır ve WhatsApp/SMS ile gönderilir.</p>"},
            {"question": "Kurumsal bağışlarda vergi indirimi var mı?", "answer": "<p>Resmî bağış makbuzlarımız mevzuat çerçevesinde muhasebeleştirilebilir.</p>"},
        ]),
    ])
    _section("faq-pill-categories", "SSS: Kategori Haplı Filtreli", "SSS & İletişim", "Kurban, Zekat, Su Kuyusu gibi hap sekmelerle ayrılmış SSS.", [
        B("faq", look="pill_category_faq", kicker="KATEGORİLİ SSS", title="Konusuna Göre Sorular", items=[
            {"category": "Kurban", "question": "Adak ve akika kurbanı ne zaman kesilir?", "answer": "<p>Bağışınız ulaştıktan sonraki 24-48 saat içinde kesilip videosu gönderilir.</p>"},
            {"category": "Su Kuyusu", "question": "Kuyuya sevdiklerimin adını yazdırabilir miyim?", "answer": "<p>Evet, kuyu tabelasına istediğiniz isim veya hayır ifadesi işlenir.</p>"},
            {"category": "Zekat", "question": "Fitre ve fidye bağışı yapabilir miyim?", "answer": "<p>Evet, güncel Diyanet taban tutarına göre dilediğiniz adetle bağış yapabilirsiniz.</p>"},
        ]),
    ])
    _section("faq-step-numbered-guide", "SSS: Numaralı Rehber Kartlar", "SSS & İletişim", "Her soruyu numaralandıran düzenli ve şık SSS kartları.", [
        B("faq", look="step_numbered", kicker="BAĞIŞÇI REHBERİ", title="Bağış Öncesi Bilmeniz Gerekenler", items=[
            {"question": "Bağışımı nasıl takip ederim?", "answer": "<p>SMS ile gelen bağışçı paneli linkinden tüm geçmişinizi ve videolarınızı görebilirsiniz.</p>"},
            {"question": "Havale açıklamasında ne yazmalıyım?", "answer": "<p>Ad-soyad, telefon numaranız ve bağış türünü (ör. Su Kuyusu) yazmanız yeterlidir.</p>"},
        ]),
    ])
    _section("newsletter-centered-card", "E-Bülten: Ortalı Modern Kart", "SSS & İletişim", "Sade ve yüksek dönüşümlü ortalı bülten abonelik kartı.", [
        B("newsletter", look="centered_card", kicker="İYİLİK BÜLTENİ", title="Saha Raporlarımızı E-Postanıza Gönderelim"),
    ])
    _section("newsletter-floating-dark", "E-Bülten: Koyu Yüzen Kart", "SSS & İletişim", "Koyu zeminli, modern gölgeli e-bülten abonelik kutusu.", [
        B("newsletter", look="floating_dark", kicker="HABERDAR OLUN", title="Yeni Projeler ve Açılış Videoları"),
    ])
    _section("newsletter-dark-gold", "E-Bülten: Koyu Altın Vakıf Bülteni", "SSS & İletişim", "Antrasit-altın tonda şık vakıf bülteni abonelik bandı.", [
        B("newsletter", look="dark_gold_subscribe", kicker="VAKIF BÜLTENİ", title="Aylık Faaliyet ve Etki Bültenine Katılın"),
    ])
    _section("newsletter-floating-pill", "E-Bülten: Yüzen Hap Form", "SSS & İletişim", "Yuvarlatılmış hap girişli kompakt ve şık abonelik satırı.", [
        B("newsletter", look="floating_pill_form", kicker="HIZLI ABONELİK", title="İyilik Haberlerini Kaçırmayın"),
    ])
    _section("contact-full-info-and-concierge", "İletişim: Merkez Bilgileri + Danışma", "SSS & İletişim", "Genel merkez iletişim bilgileri ve birebir bağışçı danışma hattı.", [
        section([
            columns("1-1",
                    [B("contact_info", title="Genel Merkez İletişim", layout="stacked", show_address=True), B("social_icons", p={"style": "pill"})],
                    [B("donor_concierge_bar", look="concierge_split", kicker="BİREBİR DESTEK", title="Bağışçı İlişkileri Masası", advisor_name="Danışma Birimi", phone="+90 212 000 00 00", email="destek@kurum.org", hours="Hafta içi 09:00 - 18:00", cta_label="Randevu Al", cta_url="/iletisim")],
                    gap=36),
        ], tone="soft", top=48, bottom=48),
    ])

    # --- 7. KURUMSAL & HAKKIMIZDA + DÜZEN (+8) ---
    _section("corp-mission-vision-dark", "Kurumsal: Koyu Misyon & Vizyon 3'lü", "Kurumsal & Hakkımızda", "Koyu zemin üzerinde misyon, vizyon ve değerler 3 sütunu.", [
        section([
            heading("Misyonumuz, Vizyonumuz ve Değerlerimiz", kicker="KURUMSAL KİMLİK"),
            card_columns("1-1-1", [
                card("Misyonumuz", "İhtiyaç sahiplerine onurlu, hızlı ve sürdürülebilir insani yardım ulaştırmak.", "🎯"),
                card("Vizyonumuz", "Şeffaflık ve güven odaklı, kalıcı eserler üreten öncü iyilik kurumu olmak.", "🌟"),
                card("Değerlerimiz", "Emanet bilinci, hesap verebilirlik, tarafsızlık ve insan onuruna saygı.", "🤝"),
            ]),
        ], tone="dark", top=56, bottom=56),
    ])
    _section("corp-4-pillars-emerald", "Kurumsal: 4 Temel Çalışma İlkesi", "Kurumsal & Hakkımızda", "Dört sütunda şeffaflık, hız, yerinde teslimat ve sürdürülebilirlik.", [
        section([
            heading("İyilikte 4 Temel İlkemiz", kicker="NASIL ÇALIŞIYORUZ?"),
            card_columns("1-1-1-1", [
                card("Yerinde Tespit", "Gerçek ihtiyaçları yerel ekiplerle sahada belirleriz.", "📍"),
                card("Aracısız Teslim", "Yardımları kendi saha sorumlularımızla elden ulaştırırız.", "🚚"),
                card("Videolu Rapor", "Kurban ve su kuyusu projelerini isim okuyarak belgeleriz.", "🎬"),
                card("Açık Denetim", "Yıllık mali raporlarımızı tüm bağışçılarla paylaşırız.", "📊"),
            ]),
        ], tone="light", top=52, bottom=52),
    ])
    _section("corp-transparency-full-combo", "Kurumsal: Mali Şeffaflık + Güven Bandı", "Kurumsal & Hakkımızda", "Güven mühürleri ve kurumsal üst çizgili şeffaflık rakamları bir arada.", [
        B("trust", look="seals"),
        B("stats", mode="manual", variant="accent_top_border", columns="3", kicker="MALİ ŞEFFAFLIK", title="Her Kuruşun Hesabı Açık", items=[
            {"value": "%93.4", "label": "Doğrudan Saha Yardımı"},
            {"value": "%4.2", "label": "Lojistik & Operasyon"},
            {"value": "%2.4", "label": "Genel Yönetim Payı"},
        ]),
    ])
    _section("layout-asymmetric-2-1-donate", "Düzen: 2-1 Hikaye + Hızlı Bağış Kartı", "Düzen", "Solda geniş kampanya anlatımı, sağda dikkat çekici aksiyon kutusu.", [
        section([
            columns("2-1",
                    [heading("Bir İyilik Zincirinin Halkası Olun", kicker="DAYANIŞMA", center=False),
                     B("richtext", text="Gıda kolisinden temiz su kuyusuna, yetim eğitiminden acil sağlık desteğine kadar tüm projelerimizde bağışçılarımızın emanetini titizlikle ulaştırıyoruz."),
                     B("stats", mode="manual", variant="pill_badge_stats", columns="3", items=[
                         {"value": "48", "label": "Ülke"},
                         {"value": "1.200+", "label": "Su Kuyusu"},
                         {"value": "18K+", "label": "Yetim"},
                     ])],
                    [B("cta_band", look="dark_emerald_cta", kicker="HIZLI DESTEK", title="Bugün Destek Ol", text="Saniyeler içinde güvenli bağış yapın.", button_label="Bağış Yap", button_url="/kampanyalar")],
                    gap=32),
        ], tone="soft", top=52, bottom=52),
    ])
    _section("layout-split-checklist-pro", "Düzen: İki Sütunlu Hizmet Özeti", "Düzen", "Sol kurumsal özet, sağda 2x2 hizmet kartları hissi veren düzen.", [
        section([
            columns("1-1",
                    [heading("Sürdürülebilir Kalkınma ve Acil Yardım", kicker="FAALİYET ALANLARI", center=False),
                     B("richtext", text="Sadece bugünün acil ihtiyacını değil, yarının kalıcı çözümünü de inşa ediyoruz. Su kuyuları, eğitim merkezleri ve meslek edindirme projeleriyle toplulukları güçlendiriyoruz."),
                     B("buttons", layout="row", items=[{"label": "Tüm Projeler", "url": "/kampanyalar", "style": "primary"}])],
                    [*card("Kalıcı Su Kuyuları", "Güneş enerjili ve derin sondajlı su çözümleri.", "💧"),
                     *card("Yetim & Eğitim", "Burs, kırtasiye ve yatılı eğitim destekleri.", "🎓"),
                     *card("Sağlık & Katarakt", "Mobil klinik, ilaç ve katarakt ameliyatları.", "🏥")],
                    gap=36),
        ], tone="light", top=52, bottom=52),
    ])
    _section("layout-dark-feature-trio", "Düzen: Koyu 3'lü Vurgu Kartları", "Düzen", "Koyu zemin üzerinde 3 büyük faaliyet kartı ve çağrı butonu.", [
        section([
            heading("Öne Çıkan İyilik Projelerimiz", kicker="SEÇKİN PROJELER"),
            card_columns("1-1-1", [
                card("Afrika Su Kuyuları", "Kurak köylere ömür boyu temiz içme suyu.", "💧"),
                card("Kurban Organizasyonu", "Adak, akika ve vacip kurbanlarda videolu teslimat.", "🐑"),
                card("Ramazan & Aşevi", "Her gün binlerce kişiye sıcak yemek ve kumanya.", "🍲"),
            ]),
            B("buttons", layout="emerald_glow", size="md", align="center", items=[
                {"icon": "✨", "label": "Tüm Kampanyaları Gör", "url": "/kampanyalar", "style": "accent"},
            ]),
        ], tone="dark", top=56, bottom=56),
    ])
    _section("layout-2col-comparison-cards", "Düzen: İki Sütunlu Bağış Kanalları", "Düzen", "Online bağış ile Havale/EFT seçeneklerini yan yana sunan düzen.", [
        section([
            heading("Size En Uygun Bağış Yöntemini Seçin", kicker="BAĞIŞ KANALLARI"),
            card_columns("1-1", [
                card("Online Kart ile Anında Bağış", "3D Secure güvencesiyle saniyeler içinde makbuzlu bağış yapın.", "💳"),
                card("Havale / EFT & SWIFT", "Resmî TL, USD ve EUR banka hesaplarımıza doğrudan gönderin.", "🏦"),
            ]),
        ], tone="soft", top=48, bottom=48),
    ])
    _section("layout-section-divider-header", "Düzen: Zarif Bölüm Başlığı + Ayırıcı", "Düzen", "Sayfa bölümlerini şıkça ayırmak için başlık ve gradyan çizgi.", [
        section([
            heading("Yeni Bölüm Başlığı", kicker="ALT BAŞLIK", subtitle="Bu alana bölümünüzü özetleyen kısa ve net bir açıklama yazabilirsiniz."),
            B("divider", look="gradient", padding_y="sm"),
        ], tone="light", top=32, bottom=16),
    ])

    # Refresh SECTION_BY_KEY so new page templates & demos can reference new sections
    sec_map = {s["key"]: s for s in SECTIONS}
    def _extra_blocks(*keys: str) -> list:
        return [b for k in keys if k in sec_map for b in sec_map[k]["blocks"]]

    # =========================================================================
    # +18 EXTRA PAGE TEMPLATES (87 -> 105)
    # =========================================================================
    extra_pages = [
        {"key": "afrika-su-kuyusu-kampanya", "label": "Afrika Su Kuyusu (Özel Vitrin)", "slug": "afrika-su-kuyusu",
         "description": "Su kuyusu kapağı, hikaye, etki sayaçları, bağış kartları ve SSS.",
         "blocks": _extra_blocks("hero-water-well-split", "media-water-story-split", "stats-emerald-impact", "donate-emerald-dark-grid", "faq-pill-categories")},
        {"key": "gazze-acil-yardim-merkezi", "label": "Gazze & Acil Yardım Merkezi", "slug": "gazze-acil-yardim",
         "description": "Acil kırmızı kapak, öncelikli kampanyalar, hızlı bağış şeridi ve IBAN.",
         "blocks": _extra_blocks("hero-urgent-crisis-dark", "donate-quick-bar-strip", "campaigns-ruby-urgent", "cta-urgent-red-split", "iban-dark-vault")},
        {"key": "yetim-hamiligi-ozel", "label": "Yetim Hâmiliği Özel Sayfası", "slug": "yetim-hamiligi",
         "description": "Sıcak yetim kapağı, hikaye, süreç adımları, bağış ve SSS.",
         "blocks": _extra_blocks("hero-orphan-warm", "media-orphan-editorial-dark", "steps-numbered-glass", "donate-cream-warm-grid", "faq-two-column-grid")},
        {"key": "ramazan-iftar-fitre-merkezi", "label": "Ramazan İftar & Fitre Merkezi", "slug": "ramazan-merkezi",
         "description": "Ramazan prestij kapağı, zekat + 3 adım, zümrüt kampanyalar ve çağrı.",
         "blocks": _extra_blocks("hero-ramadan-prestige", "donate-zakat-and-steps", "campaigns-emerald-gold", "cta-dark-gold-ornate", "faq-pill-categories")},
        {"key": "adak-akika-kurban-ozel", "label": "Adak, Akika & Şükür Kurbanı", "slug": "adak-akika-kurban",
         "description": "Geri sayımlı kurban kapağı, koyu süreç adımları, bağış ve koyu SSS.",
         "blocks": _extra_blocks("banner-split-countdown-hero", "steps-dark-numbered", "donate-cards-dark-prestige", "cta-whatsapp-direct", "faq-dark-bordered-prestige")},
        {"key": "kalici-eser-mescid-medrese", "label": "Kalıcı Eser (Mescid & Medrese)", "slug": "kalici-eser-projeleri",
         "description": "Çift tonlu vakıf kapağı, prestij kampanyalar, altın sayaçlar ve çağrı.",
         "blocks": _extra_blocks("banner-duotone-overlay-hero", "campaigns-dark-luxury", "stats-dark-gold-prestige", "cta-dark-gold-ornate", "iban-emerald-vault")},
        {"key": "egitim-burs-hafizlik-ozel", "label": "Eğitim, Burs & Hafızlık", "slug": "egitim-ve-burs",
         "description": "Diyagonal eğitim kapağı, 3'lü hizmet kartları, bağış ve bülten.",
         "blocks": _extra_blocks("banner-diagonal-modern", "layout-bento-3-cards", "donate-progress-ring-grid", "newsletter-centered-card")},
        {"key": "kss-kurumsal-isbirligi-pro", "label": "Kurumsal Sosyal Sorumluluk (KSS)", "slug": "kurumsal-sosyal-sorumluluk",
         "description": "Kurumsal safir kampanyalar, şeffaflık raporu, KSS çağrısı ve danışma.",
         "blocks": [_page_hero("Kurumsal Sosyal Sorumluluk", "İŞ BİRLİĞİ", "/demo/hands.webp"), *_extra_blocks("corp-transparency-full-combo", "campaigns-sapphire-modern", "cta-dark-sapphire", "contact-full-info-and-concierge")]},
        {"key": "seffaflik-ve-guven-merkezi", "label": "Şeffaflık & Güven Merkezi", "slug": "seffaflik-merkezi",
         "description": "Sertifikalar, mali oranlar, süreç akışı ve bağışçı SSS merkezi.",
         "blocks": [_page_hero("Şeffaflık ve Hesap Verebilirlik", "GÜVEN MERKEZİ", "/demo/mosque.webp"), *_extra_blocks("trust-certificate-grid", "corp-transparency-full-combo", "steps-zigzag-delivery", "faq-searchable-pro")]},
        {"key": "iban-ve-havale-merkezi", "label": "IBAN, QR & SWIFT Merkezi", "slug": "iban-havale-merkezi",
         "description": "Para birimi sekmeli IBAN, QR kodlu havale, SWIFT ve destek hattı.",
         "blocks": [_page_hero("Banka & IBAN Hesaplarımız", "HAVALE / EFT", "/demo/pattern.webp"), *_extra_blocks("iban-currency-tabs", "iban-qr-showcase", "iban-swift-international", "cta-whatsapp-direct")]},
        {"key": "saha-medya-ve-galeri-merkezi", "label": "Saha Fotoğraf & Video Arşivi", "slug": "saha-galerisi",
         "description": "Çift yönlü akan galeri, film şeridi ve koyu saha belgeselleri.",
         "blocks": [_page_hero("Sahadan Kareler ve Belgeseller", "MEDYA ARŞİVİ", "/demo/water.webp"), *_extra_blocks("gallery-dual-marquee", "media-video-showcase-dark", "gallery-polaroid-warm", "cta-emerald-glow")]},
        {"key": "yardim-ve-sss-merkezi", "label": "Yardım & Sık Sorulan Sorular", "slug": "yardim-merkezi",
         "description": "Aranabilir SSS, kategorili SSS, rehber adımlar ve danışma masası.",
         "blocks": [_page_hero("Size Nasıl Yardımcı Olabiliriz?", "YARDIM MERKEZİ", "/demo/pattern.webp"), *_extra_blocks("faq-searchable-pro", "faq-pill-categories", "steps-compact-badges", "contact-full-info-and-concierge")]},
        {"key": "hizli-bagis-ekrani", "label": "Hızlı Bağış & Toplu Sepet", "slug": "hizli-bagis",
         "description": "Yüzen bağış slider'ı, tablo satırları, sihirbaz ve güven kalkanı.",
         "blocks": _extra_blocks("slider-floating-donate-pro", "donate-table-rows-fast", "donate-wizard-guided", "trust-dark-shield-bar")},
        {"key": "vakif-hikayemiz-ve-ilkeler", "label": "Vakıf Hikayemiz & İlkelerimiz", "slug": "vakif-hikayemiz",
         "description": "Başkan mesajı, koyu misyon/vizyon, 4 temel ilke ve etki rakamları.",
         "blocks": [_page_hero("Hikayemiz ve Değerlerimiz", "KURUMSAL", "/demo/mosque.webp"), *_extra_blocks("media-split-founder-letter", "corp-mission-vision-dark", "corp-4-pillars-emerald", "stats-big-hero-numbers")]},
        {"key": "duzenli-bagisci-kulubu", "label": "Düzenli Bağışçı Kulübü", "slug": "duzenli-bagisci",
         "description": "Yüzen kart kapak, düzenli bağış çağrısı, paket kıyaslama ve SSS.",
         "blocks": _extra_blocks("banner-floating-card-hero", "cta-floating-glass", "donate-comparison-table", "stats-soft-tint", "faq-step-numbered-guide")},
        {"key": "gonullu-ve-topluluk-merkezi", "label": "Gönüllü & Topluluk Merkezi", "slug": "gonullu-toplulugu",
         "description": "Poster kapak, 3'lü faaliyet kartları, e-bülten ve iletişim.",
         "blocks": _extra_blocks("banner-poster-editorial", "layout-bento-3-cards", "cta-bordered-minimal", "contact-newsletter-community")},
        {"key": "yillik-etki-raporu-pro", "label": "Yıllık Etki & Faaliyet Raporu", "slug": "yillik-etki-raporu",
         "description": "Rakam bindirmeli kapak, 4'lü sayaçlar, şeffaflık ve saha galerisi.",
         "blocks": _extra_blocks("banner-split-stats-overlay", "stats-top-border", "corp-transparency-full-combo", "gallery-filmstrip-cinema", "newsletter-dark-gold")},
        {"key": "bagis-kanallari-rehberi", "label": "Bağış Kanalları & Ödeme Rehberi", "slug": "bagis-kanallari-rehberi",
         "description": "Online ve havale seçenekleri, QR IBAN, süreç ve WhatsApp destek.",
         "blocks": [_page_hero("Güvenli Bağış Kanallarımız", "ÖDEME REHBERİ", "/demo/hands.webp"), *_extra_blocks("layout-2col-comparison-cards", "iban-qr-showcase", "steps-horizontal-arrows", "cta-whatsapp-direct")]},
    ]
    PAGE_TEMPLATES.extend(extra_pages)

    # =========================================================================
    # +7 EXTRA SITE DEMOS (23 -> 30)
    # =========================================================================
    extra_demos = [
        {"key": "zumrut-su-kuyusu-pro", "label": "Zümrüt Su & Kalıcı Eser Pro", "kit": "endulus-zumrut", "image": "/demo/water.webp",
         "description": "Zümrüt koyu bağış kartları, dairesel sayaçlar, QR IBAN ve cam efektli header.",
         "header": header_glass_brand(), "footer": footer_dark_iban_newsletter(),
         "home": _extra_blocks("slider-floating-donate-pro", "donate-emerald-dark-grid", "stats-emerald-impact", "media-water-story-split", "iban-emerald-vault", "faq-pill-categories"),
         "pages": ["afrika-su-kuyusu-kampanya", "iban-ve-havale-merkezi", "seffaflik-ve-guven-merkezi"]},
        {"key": "acil-kriz-seferberlik-pro", "label": "Acil Kriz & İnsani Yardım Pro", "kit": "gazze-acil-kirmizi", "image": "/demo/relief.webp",
         "description": "Yüksek kontrastlı acil çağrı, hızlı bağış şeridi, kırmızı kampanyalar ve WhatsApp destek.",
         "header": header_brand_two_row(), "footer": footer_brand_cta_3col(),
         "home": _extra_blocks("hero-urgent-crisis-dark", "donate-quick-bar-strip", "campaigns-ruby-urgent", "stats-glass-dark-cards", "cta-urgent-red-split", "iban-dark-vault"),
         "pages": ["gazze-acil-yardim-merkezi", "hizli-bagis-ekrani", "yardim-ve-sss-merkezi"]},
        {"key": "altin-ramazan-vakfi-pro", "label": "Altın Ramazan & Vakıf Prestij", "kit": "gece-antrasit-altin", "image": "/demo/mosque.webp",
         "description": "Koyu altın prestij, zekat + 3 adım, koyu IBAN kasa kartları ve kalkan şeritli footer.",
         "header": header_dark_search(), "footer": footer_gradient_prestige(),
         "home": _extra_blocks("hero-ramadan-prestige", "donate-zakat-and-steps", "campaigns-emerald-gold", "stats-dark-gold-prestige", "cta-dark-gold-ornate", "faq-dark-bordered-prestige"),
         "pages": ["ramazan-iftar-fitre-merkezi", "kalici-eser-mescid-medrese", "iban-ve-havale-merkezi"]},
        {"key": "modern-safir-kurumsal-pro", "label": "Modern Safir Kurumsal Vakıf", "kit": "safir-kurumsal", "image": "/demo/hands.webp",
         "description": "Yumuşak üst bantlı header, kurumsal şeffaflık, safir kampanyalar ve aranabilir SSS.",
         "header": header_mega_topbar_soft(), "footer": footer_soft_4col_trust(),
         "home": _extra_blocks("slider-bento-showcase", "campaigns-sapphire-modern", "corp-transparency-full-combo", "steps-zigzag-delivery", "cta-dark-sapphire", "faq-searchable-pro"),
         "pages": ["kss-kurumsal-isbirligi-pro", "seffaflik-ve-guven-merkezi", "yillik-etki-raporu-pro"]},
        {"key": "yetim-ve-egitim-sicak-pro", "label": "Yetim & Eğitim Sıcak Vitrin", "kit": "mercan-umut", "image": "/demo/orphan.webp",
         "description": "Sıcak krem bağış kartları, yüzen hap header, yetim hikayesi ve polaroid saha galerisi.",
         "header": header_floating_pill(), "footer": footer_split_contact_newsletter(),
         "home": _extra_blocks("hero-orphan-warm", "donate-cream-warm-grid", "media-orphan-editorial-dark", "steps-numbered-glass", "gallery-polaroid-warm", "faq-two-column-grid"),
         "pages": ["yetim-hamiligi-ozel", "egitim-burs-hafizlik-ozel", "duzenli-bagisci-kulubu"]},
        {"key": "minimal-monokrom-modern", "label": "Minimalist Modern Dernek", "kit": "minimal-monokrom", "image": "/demo/education.webp",
         "description": "Sade ortalı header, dev tipografik rakamlar, editoryal hikaye ve ultra sade footer.",
         "header": header_centered_minimal(), "footer": footer_light_minimal_links(),
         "home": _extra_blocks("slider-magazine-grid", "donate-bento-featured", "stats-big-hero-numbers", "media-split-founder-letter", "gallery-marquee-infinite", "newsletter-floating-pill"),
         "pages": ["vakif-hikayemiz-ve-ilkeler", "saha-medya-ve-galeri-merkezi", "yardim-ve-sss-merkezi"]},
        {"key": "uluslararasi-yardim-agi", "label": "Uluslararası Yardım Ağı (Global)", "kit": "modern-lacivert", "image": "/demo/water.webp",
         "description": "Çok dilli + döviz seçicili header, SWIFT/döviz IBAN, bağış sihirbazı ve mega footer.",
         "header": header_split_dual_cta(), "footer": footer_mega_donor_hub(),
         "home": _extra_blocks("slider-spotlight-cinema", "donate-wizard-guided", "stats-ring-progress", "iban-swift-international", "gallery-dual-marquee", "contact-full-info-and-concierge"),
         "pages": ["bagis-kanallari-rehberi", "hizli-bagis-ekrani", "seffaflik-ve-guven-merkezi"]},
    ]
    DEMOS.extend(extra_demos)
