""""Hayır Kapısı" demo: deep green, cream sections, donation cards with a cart.

Built for HAKDER (hakder.org) when it moved from STK PRO: the look is rebuilt with our
own blocks only. `hayir_kapisi(content)` returns header, footer, home and pages as block
trees; without `content` it uses neutral demo texts (what other organisations see in the
template library), and scripts/hakder/import_hakder.py passes HAKDER's harvested content.
"""
from __future__ import annotations

import copy
from typing import Any, Optional

GREEN = "#136938"
CREAM = "#FDF4ED"
RED = "#DC3545"
INK = "#060315"

_counter = [0]


def _id(kind: str) -> str:
    _counter[0] += 1
    return f"hk-{kind.replace('_', '-')[:10]}-{_counter[0]}"


def B(block_type: str, style: Optional[dict] = None, advanced: Optional[dict] = None, children: Optional[list] = None,
      mobile: Optional[dict] = None, p: Optional[dict] = None, **props) -> dict:
    """`p` holds props whose names clash with the helper's own arguments (e.g. a "style" select)."""
    props = {**props, **(p or {})}
    block: dict[str, Any] = {"id": _id(block_type), "type": block_type, "props": {k: v for k, v in props.items() if v not in (None, "", [])}}
    if style or mobile:
        block["style"] = {**({"desktop": style} if style else {}), **({"mobile": mobile} if mobile else {})}
    if advanced:
        block["advanced"] = advanced
    if children is not None:
        block["children"] = children
    return block


def _row(props: dict, left: list, center: list, right: list, style: Optional[dict] = None, advanced: Optional[dict] = None) -> dict:
    slots = [B("header_slot", children=items) for items in (left, center, right)]
    return B("header_row", style=style, advanced=advanced, children=slots, **props)


def _cols(ratio: str, *cols: list, gap: int = 32, valign: str = "start", stack_on: str = "tablet") -> dict:
    return B("columns", children=[B("column", children=list(c)) for c in cols], ratio=ratio, gap=gap, valign=valign, stack_on=stack_on)


def _section(children: list, bg: str = "", top: int = 72, bottom: int = 72, **style) -> dict:
    st = {"padding_top": top, "padding_bottom": bottom, **style}
    if bg:
        st["bg_color"] = bg
    return B("section", style=st, children=children, mobile={"padding_top": min(top, 40), "padding_bottom": min(bottom, 40)})


def _heading(text: str, kicker: str = "", level: str = "h2", center: bool = True) -> dict:
    return B("heading", style={"text_align": "center"} if center else None, text=text, kicker=kicker or None, level=level)


TABLET_DOWN = {"hide_tablet": True, "hide_mobile": True}

# --- Default (neutral demo) content -------------------------------------------------------

DEFAULT: dict[str, Any] = {
    "announcement": {"text": "Kurban bağışlarınızı 48 saat içinde videolu kesiyoruz — tıklayın", "url": "/bagis?tab=kurban"},
    "slogan": "Bir kapı aç, bir hayat değiştir",
    "menu": [
        {"label": "Kurumsal", "children": [
            {"label": "Hakkımızda", "url": "/hakkimizda"}, {"label": "Sık Sorulan Sorular", "url": "/sss"},
            {"label": "Gizlilik Politikası", "url": "/gizlilik-politikasi"}]},
        {"label": "Faaliyetlerimiz", "url": "/haberler", "mega": True, "children": [
            {"label": "Kurban organizasyonu", "url": "/bagis?tab=kurban", "group": "Kurban"},
            {"label": "Su kuyusu projeleri", "url": "/bagis?tab=su-kuyusu", "group": "Yurtdışı projeleri"},
            {"label": "Eğitim çalışmaları", "url": "/bagis?tab=egitim", "group": "Eğitim"},
            {"label": "Tüm faaliyetlerimiz", "url": "/haberler", "group": "Tümü"}]},
        {"label": "Hesap Numaralarımız", "url": "/hesap-numaralarimiz"},
        {"label": "İletişim", "url": "/iletisim"},
    ],
    "header_buttons": [{"label": "Bağışımı Gel Al", "url": "/iletisim"}, {"label": "Bağış Yap", "url": "/bagis"}],
    "slides": [
        {"image_url": "/demo/water.svg", "button_url": "/bagis?tab=su-kuyusu", "title": "Bir kuyu, bir köyün hayatı"},
        {"image_url": "/demo/education.svg", "button_url": "/bagis?tab=egitim", "title": "İlimle yetişen nesiller"},
        {"image_url": "/demo/relief.svg", "button_url": "/bagis", "title": "Sofralara bereket olun"},
    ],
    "edevlet": {"text": "Derneğimizi e-Devlet'te sorgulamak için tıklayınız.", "url": "https://www.turkiye.gov.tr/icisleri-ddb-dernek-sorgulama"},
    "counters": [{"value": "20", "label": "Kampanya"}, {"value": "1.800", "label": "Bağışçı"},
                 {"value": "15.500", "label": "Yardım dağıtıldı"}, {"value": "24", "label": "Gönüllü"}],
    "donate": {"kicker": "Bağış", "title": "Bağış Yapabilirsiniz", "campaign_ids": [], "cards": []},
    "testimonials": {"kicker": "Sizden Gelenler", "title": "Bağışçılarımız Anlatıyor", "items": [
        {"quote": "Gönderdiğim yemeğin hazırlanışından dağıtımına kadar videosu geldi, ismimi de görünce çok sevindim.", "name": "Murat C."},
        {"quote": "Kız kursuna yaptığım bağışın nereye harcandığını tek tek gösterdiler.", "name": "Eda S."},
        {"quote": "Ardımda bir hayır kalsın diye kuyu açtırdım; açılış videosunu izledim.", "name": "Ahmet Y."},
    ]},
    "support_form": {"kicker": "Mesaj Gönderin", "title": "İyiliğe uzanan elimize destek olun!", "image_url": "/demo/orphan.svg",
                     "badge_value": "70k", "badge_text": "Yoksul çocuk", "button_label": "Gönder"},
    "news": {"kicker": "Faaliyetler", "title": "Derneğimizin Gerçekleştirdiği Faaliyetler", "all_label": "Tüm Faaliyetler",
             "all_url": "/haberler", "links": "haberler"},
    "footer_menus": [
        ("Kurumsal", [{"label": "Hakkımızda", "url": "/hakkimizda"}, {"label": "İletişim", "url": "/iletisim"},
                      {"label": "Gizlilik Politikası", "url": "/gizlilik-politikasi"}, {"label": "Sık Sorulan Sorular", "url": "/sss"}]),
        ("Faaliyetlerimiz", [{"label": "Tüm faaliyetler", "url": "/haberler"}, {"label": "Kampanyalar", "url": "/bagis"}]),
        ("Formlar", [{"label": "Zekat Hesaplama", "url": "/zekat-hesapla"}, {"label": "Gönüllü Ol", "url": "/gonullu"}]),
    ],
    "bottom_links": [{"label": "Hakkımızda", "url": "/hakkimizda"}, {"label": "Gönüllü Ol", "url": "/gonullu"},
                     {"label": "İletişim", "url": "/iletisim"}, {"label": "Mesafeli Bağış Sözleşmesi", "url": "/mesafeli-bagis-sozlesmesi"},
                     {"label": "İade ve İptal", "url": "/iade-ve-iptal-kosullari"}, {"label": "Çerez Politikası", "url": "/cerez-politikasi"}],
    "copyright": "© {yıl} Tüm hakları saklıdır.",
    "mobile_bar": [{"label": "Anasayfa", "url": "/", "icon": "home"}, {"label": "Giriş/Üye", "url": "/portal", "icon": "user"},
                   {"label": "Hesap No", "url": "/hesap-numaralarimiz", "icon": "bank"},
                   {"label": "Bağış Yap", "url": "/bagis", "icon": "heart", "highlight": True},
                   {"label": "Sepetim", "url": "/bagis/sepetim", "icon": "cart"}],
    "banner_url": "/demo/pattern.svg",
    "tabs": [{"label": "Genel", "tag": "genel"}, {"label": "Eğitim", "tag": "egitim"}, {"label": "Su Kuyusu", "tag": "su-kuyusu"},
             {"label": "Kurban", "tag": "kurban"}],
    "bagis_cards": [],
}


def _content(content: Optional[dict]) -> dict:
    merged = copy.deepcopy(DEFAULT)
    for key, value in (content or {}).items():
        if value not in (None, "", [], {}):
            merged[key] = value
    return merged


# --- Header / footer ----------------------------------------------------------------------

def header(c: dict) -> list:
    buttons = B("buttons", align="right", items=[{"label": b["label"], "url": b["url"], "style": "outline"} for b in c["header_buttons"]],
                advanced=TABLET_DOWN, style={"font_size": 13, "text_transform": "uppercase"})
    return [
        B("announcement_bar", text=c["announcement"]["text"], url=c["announcement"].get("url"), tone="danger", closable=True, hide_days=1),
        _row({"tone": "brand", "height": 52, "border": False},
             [B("contact_info", show_phone=False, show_email=True, layout="inline")],
             [],
             [B("richtext", text=f"“{c['slogan']}”", advanced={"hide_mobile": True}, style={"font_size": 14}),
              B("social_icons", p={"style": "round"}), B("account_links", show_portal=True, show_verify=False), B("cart_button")],
             style={"bg_color": GREEN, "font_size": 14, "text_color": "#FFFFFF"}),
        _row({"tone": "light", "height": 100, "sticky": True, "shrink": True, "center_align": "center", "border": False},
             [B("logo", size=46, wide=True, show_name=False)],
             [B("nav_menu", source="custom", items=c["menu"], p={"mobile": "drawer"}, drawer_donate=True, style={"font_size": 16})],
             [buttons],
             style={"bg_color": "#F8F8F8"}),
    ]


def footer(c: dict) -> list:
    menus = [B("nav_menu", source="custom", layout="vertical", p={"mobile": "inline"}, title=title.replace("i", "İ").replace("ı", "I").upper(), items=items)
             for title, items in c["footer_menus"]]
    call_center = B("contact_info", title="Çağrı Merkezi", show_phone=True, show_email=False, layout="stacked",
                    style={"bg_color": "#0F5A2F", "radius": 18, "padding_top": 24, "padding_bottom": 24, "padding_left": 24,
                           "padding_right": 24, "font_size": 22, "font_weight": "700"})
    return [_section([
        _cols("1-1-1-1",
              [B("logo", light=True, wide=True, size=48, show_name=False),
               B("richtext", text=f"“{c['slogan']}”", style={"font_size": 14}),
               B("contact_info", layout="stacked", show_address=True, show_phone=True, show_email=True, style={"font_size": 14})],
              menus[:1], menus[1:2] + menus[2:3], [call_center, B("social_icons", p={"style": "round"})], gap=40),
        B("spacer", height=24),
        _cols("2-1",
              [B("nav_menu", source="custom", layout="horizontal", p={"mobile": "inline"}, items=c["bottom_links"], style={"font_size": 14})],
              [B("copyright", text=c["copyright"], show_powered=False, style={"text_align": "right"})], valign="center"),
    ], bg=GREEN, top=72, bottom=24, text_color="#FFFFFF"),
        B("mobile_tab_bar", items=c["mobile_bar"])]


# --- Home ---------------------------------------------------------------------------------

def home(c: dict) -> list:
    slides = [{"image_url": s["image_url"], "mobile_image_url": s.get("mobile_image_url"), "title": s.get("title"),
               "button_label": "Bağış Yap", "button_url": s.get("button_url") or "/bagis",
               "button2_label": "Detaylı Bilgi" if s.get("button2_url") else None, "button2_url": s.get("button2_url"),
               "align": "left", "overlay": 0 if s.get("poster") else 35}
              for s in c["slides"]]
    for slide in slides:
        for key in [k for k, v in slide.items() if v in (None, "")]:
            del slide[key]
    d, t, f, n = c["donate"], c["testimonials"], c["support_form"], c["news"]
    return [
        B("slider", slides=slides, height="poster" if c["slides"] and all(s.get("poster") for s in c["slides"]) else "lg", autoplay=True, interval=6, effect="slide", arrows=True, dots=True),
        B("announcement_bar", text=c["edevlet"]["text"], url=c["edevlet"]["url"], tone="rose", closable=False, icon="🏛"),
        _section([B("stats", mode="manual", variant="card", items=c["counters"])], top=40, bottom=56),
        _section([
            _heading(d["title"], d["kicker"]),
            B("donation_cards", source="selected" if d.get("campaign_ids") else "featured", campaign_ids=d.get("campaign_ids"),
              layout="carousel", columns=3, limit=12, cards=d.get("cards"), button_label="Bağış Yap"),
        ], bg=CREAM, top=56, bottom=72),
        _section([B("testimonials", kicker=t["kicker"], title=t["title"], items=t["items"])], top=40, bottom=40,
                 bg_color="#F6EFE6"),
        B("contact_form", kicker=f["kicker"], title=f["title"], image_url=f.get("image_url"), badge_value=f.get("badge_value"),
          badge_text=f.get("badge_text"), button_label=f.get("button_label") or "Gönder", ask_email=True,
          style={"padding_top": 72, "padding_bottom": 72}),
        _section([
            B("news", kicker=n["kicker"], title=n["title"], limit=6, layout="carousel", links=n.get("links", "haberler"),
              all_label=n.get("all_label"), all_url=n.get("all_url")),
        ], bg=CREAM, top=24, bottom=48),
    ]


# --- Pages --------------------------------------------------------------------------------

def page_title(title: str, c: dict) -> dict:
    return B("banner", layout="image", image_url=c["banner_url"], title=title, align="left",
             style={"min_height": 200}, mobile={"min_height": 120})


def kurumsal_sidebar(c: dict) -> dict:
    corporate = next((m for m in c["menu"] if m.get("children") and m["label"].lower().startswith("kurumsal")), None)
    items = corporate["children"] if corporate else DEFAULT["menu"][0]["children"]
    return B("nav_menu", source="custom", layout="vertical", p={"mobile": "inline"}, items=[{"label": f"→ {i['label']}", "url": i["url"]} for i in items],
             style={"bg_color": "#FFFFFF", "radius": 16, "padding_top": 20, "padding_bottom": 20, "padding_left": 20,
                    "padding_right": 20, "shadow": "sm", "font_size": 17})


def text_page(title: str, body: str, c: dict, sidebar: bool = False, extra: Optional[list] = None) -> list:
    main = [B("richtext", text=body)] + (extra or [])
    content = _cols("1-2", [kurumsal_sidebar(c)], main, gap=40) if sidebar else B("section", children=main, style={"width": "narrow"})
    return [page_title(title, c), _section([content], top=48, bottom=72)]


def bagis_page(c: dict) -> list:
    return [
        page_title("Online Bağış", c),
        _section([
            _cols("2-1", [_heading("Online Bağış", level="h3", center=False)], [B("currency_switcher", p={"style": "buttons"})], valign="center", stack_on="never"),
            B("donation_cards", source="tabs", tabs=c["tabs"], layout="grid", columns=3, limit=48, cards=c["bagis_cards"], button_label="Bağış Yap"),
        ], top=32, bottom=72),
    ]


def legal_pages(org: dict) -> dict[str, tuple[str, str]]:
    """Pages the bank asks for before opening a virtual POS (mesafeli satış, iade/iptal, çerez)."""
    name = org.get("legal_name") or "Dernek"
    short = org.get("name") or name
    address = org.get("address") or "[adres]"
    phone = org.get("phone") or "[telefon]"
    email = org.get("email") or "[e-posta]"
    site = org.get("site") or "[site adresi]"
    party = (f"**Unvan:** {name}\n**Adres:** {address}\n**Telefon:** {phone}\n**E-posta:** {email}\n**İnternet sitesi:** {site}")
    return {
        "mesafeli-bagis-sozlesmesi": ("Mesafeli Bağış Sözleşmesi", f"""## 1. Taraflar

Bu sözleşme, aşağıda bilgileri bulunan {short} ("Dernek") ile {site} üzerinden bağış yapan kişi ("Bağışçı") arasında, bağışın elektronik ortamda onaylanmasıyla kurulmuştur.

{party}

## 2. Konu

Sözleşmenin konusu, Bağışçının internet sitesinde seçtiği bağış kalemleri için yaptığı karşılıksız bağışın tutarı, ödeme şekli ve bağışın kullanılmasına ilişkin tarafların hak ve yükümlülükleridir. Bağış bir mal veya hizmet satışı değildir; Bağışçıya karşılığında mal veya hizmet teslim edilmez.

## 3. Bağışın kapsamı ve ödeme

- Bağış kalemi, tutarı, adedi/hissesi ve varsa niyeti (adak, akika, şükür, nafile, sadaka, şifa vb.) bağış sepetinde ve ödeme sayfasında gösterilir.
- Ödeme banka/kredi kartıyla, bankanın 3D Secure güvenli ödeme sayfasında veya havale/EFT ile yapılır. Kart bilgileri Dernek tarafından görülmez ve saklanmaz.
- Bağış tutarı Türk lirası veya ödeme sayfasında seçilen para birimiyle tahsil edilir.

## 4. Bağışın kullanılması

Dernek, bağışı Bağışçının seçtiği proje veya amaç için, tüzüğü ve 5253 sayılı Dernekler Kanunu ile 2860 sayılı Yardım Toplama Kanunu hükümlerine uygun olarak kullanır. Seçilen projenin tamamlanması veya gerçekleşmesinin imkânsız hâle gelmesi durumunda bağış, Derneğin benzer amaçlı çalışmalarında kullanılır. Kurban ve hisseli bağışlarda kesim ve dağıtım bilgisi Bağışçıya iletilir.

## 5. Makbuz ve bilgilendirme

Her bağış için Bağışçının e-posta adresine bağış makbuzu gönderilir. Bağışçı, makbuzunu Bağışçı Girişi bölümünden de görüntüleyebilir.

## 6. Cayma, iade ve iptal

Bağış karşılıksız bir kazandırma olduğundan, 6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği'ndeki cayma hakkı hükümleri mal veya hizmet satışına ilişkin olarak uygulanmaz. İade ve iptal talepleri [İade ve İptal Koşulları](/iade-ve-iptal-kosullari) sayfasındaki esaslara göre değerlendirilir.

## 7. Kişisel veriler

Bağışçının kişisel verileri [Gizlilik Politikası ve KVKK Aydınlatma Metni](/gizlilik-politikasi) kapsamında işlenir.

## 8. Uyuşmazlıklar

Bu sözleşmeden doğan uyuşmazlıklarda Bağışçının yerleşim yerindeki tüketici hakem heyetleri ve tüketici mahkemeleri ile Derneğin merkezinin bulunduğu yer mahkemeleri yetkilidir.

## 9. Yürürlük

Bağışçı, ödeme adımında bu sözleşmeyi okuduğunu ve kabul ettiğini onaylar; sözleşme bu onayla yürürlüğe girer."""),
        "iade-ve-iptal-kosullari": ("İade ve İptal Koşulları", f"""Bağışlar karşılıksızdır; bununla birlikte hatalı veya istem dışı yapılan bağışlar için aşağıdaki esaslar uygulanır.

## İptal

- Kartla yapılan bir bağışın aynı gün içinde iptalini, bağış numarası (makbuz numarası) ile {phone} numaralı telefondan veya {email} adresinden talep edebilirsiniz.
- Kurban, adak ve benzeri vekâlet gerektiren bağışlarda kesim/dağıtım planlamasına alınan bağış iptal edilemez.

## İade

- Mükerrer ödeme, yanlış tutar veya bağışçının bilgisi dışında yapılan işlemler incelenir; talep haklı bulunursa tutar ödemenin yapıldığı karta veya hesaba iade edilir.
- İade talebi, işlem tarihinden itibaren 14 gün içinde yazılı olarak (e-posta yeterlidir) yapılmalıdır. Talepte ad soyad, işlem tarihi, tutar ve makbuz numarası yer almalıdır.
- Onaylanan kart iadeleri bankanıza 3 iş günü içinde iletilir; tutarın kartınıza yansıması bankanıza göre 1–10 iş günü sürebilir.
- Havale/EFT ile yapılan bağışların iadesi yalnızca gönderen hesabın IBAN'ına yapılır.

## Kısmi iade yapılmayan durumlar

Bağışı seçilen projeye aktarılmış, harcanmış veya yardım dağıtımı tamamlanmış bağışlarda iade yapılamaz.

## İletişim

{party}"""),
        "cerez-politikasi": ("Çerez Politikası", f"""{site} adresinde, sitenin çalışması ve bağış işlemlerinin tamamlanması için çerezler ve tarayıcı depolaması kullanılır.

## Kullandığımız çerezler

- **Zorunlu çerezler:** Oturum, dil tercihi, kurum seçimi ve güvenlik (ör. sahte istek koruması) için gereklidir; kapatılamaz.
- **Tercih kayıtları:** Bağış sepetiniz, seçtiğiniz para birimi ve kapattığınız duyurular yalnızca tarayıcınızda saklanır.
- **Ödeme:** Kartla ödemede bankanın güvenli ödeme sayfası kendi çerezlerini kullanır.
- **Ölçüm (yalnızca izin verirseniz):** Ziyaret ve bağış adımlarını anonim olarak ölçen analiz araçları.

## Çerezleri yönetme

Tarayıcınızın ayarlarından çerezleri silebilir veya engelleyebilirsiniz; zorunlu çerezler engellenirse bağış işlemi tamamlanamayabilir.

## Kişisel veriler

Çerezlerle elde edilen kişisel veriler 6698 sayılı KVKK ve [Gizlilik Politikası](/gizlilik-politikasi) kapsamında işlenir. Sorularınız için: {email}"""),
    }


def hayir_kapisi(content: Optional[dict] = None, org: Optional[dict] = None) -> dict:
    """header, footer, home and pages ({slug: (title, blocks)}) of the demo."""
    c = _content(content)
    pages = {"bagis": ("Online Bağış", bagis_page(c))}
    for slug, (title, body) in legal_pages(org or {}).items():
        pages[slug] = (title, text_page(title, body, c))
    return {"header": header(c), "footer": footer(c), "home": home(c), "pages": pages}
