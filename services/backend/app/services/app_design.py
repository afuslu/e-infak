"""Mobil Uygulama Yapıcı: the design document of an organisation's donor app.

    {"schema": 1, "theme": {...}, "header": {...}, "tabs": [...], "drawer": [...],
     "pages": [{"id": "home", "title", "blocks": [{"id", "type", "props"}]}]}

Like the site builder, every value is declared here and cleaned on save. The app
(apps/mobile/src/design) and the editor preview (apps/web/components/app-builder)
draw exactly these blocks, looks and icons; tests/test_app_design.py checks that.
Cart, payment and account screens are not designable: they only take the theme.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.blocks import F, BlockError, _fields, _value

SCHEMA = 1
MAX_PAGES = 20
MAX_BLOCKS = 60
MAX_BYTES = 300_000
MAX_DRAWER = 20

_ID = re.compile(r"^[a-zA-Z0-9_-]{4,40}$")
_SLUG = re.compile(r"^[a-zA-Z0-9_-]{1,160}$")
_PHONE = re.compile(r"^\+?\d{3,15}$")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Fixed app screens an action may open (apps/mobile/app/(vitrin)).
SCREENS = {
    "home": "Ana sayfa", "bagis-yap": "Bağış yap", "sepet": "Bağış sepeti", "hesabim": "Hesabım",
    "haberler": "Haberler", "zekat": "Zekât hesapla", "iban": "IBAN / Hesap numaraları",
    "makbuz-dogrula": "Makbuz doğrula", "iletisim": "Hakkımızda & İletişim",
}
ACTIONS = {
    "screen": "Uygulama ekranı", "page": "Kendi sayfam", "campaign": "Kampanya", "news": "Haber",
    "url": "Web adresi", "tel": "Telefon", "whatsapp": "WhatsApp", "email": "E-posta",
}
# A donor must always be able to reach these from the tabs or the drawer.
REQUIRED_SCREENS = ("bagis-yap", "sepet", "hesabim")

ICONS = {
    "home": "Ev", "heart": "Kalp", "hand-heart": "Yardım eli", "shopping-bag": "Sepet", "user": "Kişi",
    "users": "Topluluk", "layout-grid": "Izgara", "book-open": "Kitap", "newspaper": "Gazete",
    "calculator": "Hesap makinesi", "landmark": "Banka", "file-check": "Belge", "info": "Bilgi", "phone": "Telefon",
    "message-circle": "Mesaj", "mail": "E-posta", "map-pin": "Konum", "globe": "Dünya", "gift": "Hediye",
    "star": "Yıldız", "moon": "Hilal", "droplets": "Su", "utensils": "Gıda", "graduation-cap": "Eğitim",
    "stethoscope": "Sağlık", "building": "Bina", "baby": "Çocuk", "calendar": "Takvim", "bell": "Bildirim",
    "image": "Görsel", "video": "Video", "link": "Bağlantı",
}

RADII = {"none": "Köşeli", "small": "Az yuvarlak", "medium": "Yuvarlak", "large": "Çok yuvarlak"}
TEXT_SIZES = {"small": "Küçük", "normal": "Normal", "large": "Büyük"}
TONES = {"": "Yok", "white": "Beyaz", "soft": "Açık ana renk", "brand": "Ana renk", "accent": "Vurgu rengi", "dark": "Koyu"}
SPACES = {"none": "Yok", "small": "Az", "normal": "Normal", "large": "Geniş"}
ALIGN = {"left": "Sola", "center": "Ortaya"}

THEME_FIELDS = {
    "primary": F("color", "Ana renk"),
    "accent": F("color", "Vurgu rengi"),
    "background": F("color", "Sayfa zemini", default="#F6F8F7"),
    "surface": F("color", "Kart zemini", default="#FFFFFF"),
    "text": F("color", "Yazı rengi", default="#0F172A"),
    "radius": F("select", "Köşeler", choices=RADII, default="medium"),
    "text_size": F("select", "Yazı boyutu", choices=TEXT_SIZES, default="normal"),
}
HEADER_FIELDS = {
    "style": F("select", "Üst bar", choices={"brand": "Ana renk", "light": "Açık zemin"}, default="brand"),
    "logo_url": F("image", "Logo (boşsa site logosu)"),
    "title": F("text", "Logo yerine yazı", max=40),
    "show_menu": F("bool", "Menü düğmesi", default=True),
    "show_profile": F("bool", "Profil düğmesi", default=True),
    "tab_style": F("select", "Alt sekme çubuğu", choices={
        "raised": "Yükseltilmiş orta düğme", "flat": "Düz", "pill": "Seçili sekme dolgulu"}, default="raised"),
}
TAB_FIELDS = {
    "label": F("text", "Ad", max=16, required=True),
    "icon": F("icon", "İkon", required=True),
    "action": F("action", "Açılan ekran", required=True, types=["screen", "page"]),
    "highlight": F("bool", "Öne çıkar (tek sekme)"),
}
DRAWER_FIELDS = {
    "label": F("text", "Ad", max=40, required=True),
    "icon": F("icon", "İkon", required=True),
    "action": F("action", "Açılan ekran", required=True),
}

COMMON = {
    "tone": F("select", "Zemin rengi", choices=TONES, default=""),
    "space": F("select", "Üst-alt boşluk", choices=SPACES, default="normal"),
}


def _b(label: str, group: str, icon: str, **fields) -> dict:
    return {"label": label, "group": group, "icon": icon, "fields": {**fields, **COMMON}}


def _title(default: Optional[str] = None):
    return F("text", "Başlık", max=80, **({"default": default} if default else {}))


BLOCKS: dict[str, dict] = {
    "hero": _b(
        "Karşılama", "Tanıtım", "✨",
        look=F("select", "Görünüm", choices={"brand": "Renkli zemin", "image": "Görsel zemin", "card": "Kart"}, default="brand"),
        badge=F("text", "Üst yazı", max=60, help="Boşsa kurum adı"),
        title=F("text", "Başlık", max=120, help="Boşsa site sloganı"),
        text=F("textarea", "Metin", max=300),
        image_url=F("image", "Görsel"),
        align=F("select", "Hizalama", choices=ALIGN, default="left"),
        primary_label=F("text", "1. düğme", max=30),
        primary_action=F("action", "1. düğme ne açsın?"),
        secondary_label=F("text", "2. düğme", max=30),
        secondary_action=F("action", "2. düğme ne açsın?"),
    ),
    "banner_slider": _b(
        "Slider", "Tanıtım", "🖼",
        items=F("list", "Slaytlar", max_items=10, item_label="title", fields={
            "image_url": F("image", "Görsel"), "title": F("text", "Başlık", max=80), "text": F("text", "Alt yazı", max=120),
            "action": F("action", "Dokununca ne açsın?")}),
        look=F("select", "Görünüm", choices={"overlay": "Yazı görsel üstünde", "below": "Yazı altta", "plain": "Yalnız görsel"}, default="overlay"),
        height=F("number", "Yükseklik", min=100, max=360, default=158),
    ),
    "quick_categories": _b(
        "Hızlı bağış kalemleri", "Bağış", "🎯",
        title=_title("HIZLI BAĞIŞ KATEGORİLERİ"),
        look=F("select", "Görünüm", choices={"row": "Yana kayan", "grid": "Izgara"}, default="row"),
    ),
    "campaign_list": _b(
        "Kampanya listesi", "Bağış", "📋",
        title=_title("BAĞIŞ KAMPANYALARI"),
        look=F("select", "Görünüm", choices={"card": "Büyük kart", "compact": "Küçük satır"}, default="card"),
        show_filter=F("bool", "Kategori filtresi", default=True),
        limit=F("number", "En fazla kampanya", min=1, max=100, default=100),
    ),
    "campaign_carousel": _b(
        "Kayan kampanyalar", "Bağış", "🎠",
        title=_title(),
        campaigns=F("campaigns", "Kampanyalar", help="Boşsa öne çıkanlar"),
        look=F("select", "Görünüm", choices={"card": "Kart", "poster": "Afiş"}, default="card"),
        limit=F("number", "En fazla", min=1, max=20, default=8),
    ),
    "featured_campaign": _b(
        "Öne çıkan kampanya", "Bağış", "⭐",
        campaign=F("campaign", "Kampanya"),
        look=F("select", "Görünüm", choices={"card": "Kart", "cover": "Tam görsel"}, default="card"),
        button_label=F("text", "Düğme", max=30, default="Bağış Yap"),
    ),
    "progress": _b(
        "Hedef çubuğu", "Bağış", "📶",
        campaign=F("campaign", "Kampanya"),
        title=F("text", "Başlık", max=80, help="Boşsa kampanya adı"),
    ),
    "quick_donate": _b(
        "Hızlı tutar seçimi", "Bağış", "💳",
        title=_title("Hızlı Bağış"),
        text=F("textarea", "Metin", max=200),
        campaign=F("campaign", "Kampanya"),
        amounts=F("list", "Tutarlar", max_items=6, item_label="amount", fields={
            "amount": F("number", "Tutar", min=1, max=1_000_000, unit="₺", default=100)}),
        button_label=F("text", "Düğme", max=30, default="Sepete Ekle"),
    ),
    "shortcuts": _b(
        "Kısayollar", "Yönlendirme", "🔳",
        title=_title(),
        look=F("select", "Görünüm", choices={"tile": "Kutu", "circle": "Daire", "outline": "Çerçeveli"}, default="tile"),
        columns=F("number", "Sütun", min=2, max=4, default=4),
        items=F("list", "Kısayollar", max_items=12, item_label="label", fields={
            "icon": F("icon", "İkon"), "label": F("text", "Ad", max=24), "action": F("action", "Ne açsın?")}),
    ),
    "tool_cards": _b(
        "Araç kartları", "Yönlendirme", "🧰",
        items=F("list", "Kartlar", max_items=6, item_label="title", fields={
            "icon": F("icon", "İkon"), "title": F("text", "Başlık", max=30), "text": F("text", "Alt yazı", max=50),
            "color": F("select", "Renk", choices={"primary": "Ana renk", "accent": "Vurgu rengi"}, default="primary"),
            "action": F("action", "Ne açsın?")}),
    ),
    "buttons": _b(
        "Düğmeler", "Yönlendirme", "🔘",
        items=F("list", "Düğmeler", max_items=4, item_label="label", fields={
            "label": F("text", "Yazı", max=40), "action": F("action", "Ne açsın?"),
            "style": F("select", "Stil", choices={"primary": "Ana renk", "accent": "Vurgu rengi", "outline": "Çerçeveli"}, default="primary")}),
    ),
    "cta_band": _b(
        "Çağrı bandı", "Tanıtım", "📣",
        title=_title(), text=F("textarea", "Metin", max=300),
        button_label=F("text", "Düğme", max=30), action=F("action", "Ne açsın?"),
    ),
    "heading": _b(
        "Başlık", "Metin", "🔤",
        title=_title(), text=F("textarea", "Alt yazı", max=200),
        align=F("select", "Hizalama", choices=ALIGN, default="left"),
    ),
    "richtext": _b(
        "Metin", "Metin", "📝",
        text=F("richtext", "Metin", max=10000),
        align=F("select", "Hizalama", choices=ALIGN, default="left"),
    ),
    "faq": _b(
        "Sık sorulanlar", "Metin", "❓",
        title=_title(),
        items=F("list", "Sorular", max_items=20, item_label="question", fields={
            "question": F("text", "Soru", max=160), "answer": F("textarea", "Yanıt", max=1000)}),
    ),
    "stats": _b(
        "Rakamlar", "Güven", "🔢",
        title=_title(),
        look=F("select", "Görünüm", choices={"cards": "Kartlar", "band": "Renkli bant"}, default="cards"),
        items=F("list", "Rakamlar", max_items=6, item_label="label", fields={
            "value": F("text", "Değer", max=16), "label": F("text", "Açıklama", max=40)}),
    ),
    "contact_card": _b(
        "İletişim kartı", "Güven", "☎️",
        title=F("text", "Başlık", max=80, help="Boşsa kurum adı"),
        show_buttons=F("bool", "Makbuz doğrula ve iletişim düğmeleri", default=True),
    ),
    "news_list": _b(
        "Haberler", "İçerik", "📰",
        title=_title("HABERLER"),
        kind=F("select", "Tür", choices={"": "Tümü", "haber": "Haber", "blog": "Blog", "faaliyet": "Faaliyet"}, default=""),
        look=F("select", "Görünüm", choices={"list": "Satır", "card": "Kart", "carousel": "Yana kayan"}, default="list"),
        limit=F("number", "En fazla", min=1, max=20, default=5),
    ),
    "image": _b(
        "Görsel", "İçerik", "🏞",
        image_url=F("image", "Görsel"), alt=F("text", "Görsel açıklaması", max=120),
        ratio=F("select", "Oran", choices={"16-9": "Yatay", "4-3": "Klasik", "1-1": "Kare", "3-4": "Dikey"}, default="16-9"),
        action=F("action", "Dokununca ne açsın?"),
    ),
    "gallery": _b(
        "Galeri", "İçerik", "🖼",
        title=_title(),
        look=F("select", "Görünüm", choices={"grid": "Izgara", "row": "Yana kayan"}, default="grid"),
        items=F("list", "Görseller", max_items=24, item_label="alt", fields={
            "image_url": F("image", "Görsel"), "alt": F("text", "Açıklama", max=80)}),
    ),
    "video": _b(
        "Video", "İçerik", "🎬",
        title=_title(), video=F("video", "YouTube / Vimeo adresi"), image_url=F("image", "Kapak görseli"),
    ),
    "countdown": _b(
        "Geri sayım", "İçerik", "⏳",
        title=_title(), ends_at=F("datetime", "Bitiş"),
        done_text=F("text", "Süre dolunca", max=80),
    ),
    "spacer": _b("Boşluk", "Düzen", "↕️", size=F("number", "Yükseklik", min=4, max=120, default=24)),
    "divider": _b("Ayırıcı", "Düzen", "➖"),
}


def _check_action(action: Optional[dict], allowed: Optional[list], where: str) -> None:
    if action and allowed and action["type"] not in allowed:
        raise BlockError(f"{where}: burada yalnız uygulama ekranı veya kendi sayfanız açılabilir")


def clean_action(raw: Any) -> Optional[dict]:
    """{"type", "target"}; None when empty. Formats are checked here, existence on publish."""
    if not isinstance(raw, dict):
        raise ValueError("bağlantı biçimi")
    kind, target = raw.get("type"), str(raw.get("target") or "").strip()
    if not kind or not target:
        return None
    if kind not in ACTIONS:
        raise ValueError("bağlantı türü")
    if kind == "screen" and target not in SCREENS:
        raise ValueError("ekran")
    if kind == "page" and not (target == "home" or _ID.fullmatch(target)):
        raise ValueError("sayfa")
    if kind in ("campaign", "news") and not _SLUG.fullmatch(target):
        raise ValueError("kayıt")
    if kind == "url" and not re.fullmatch(r"https://[^\s/]+\.[^\s]+", target):
        raise ValueError("adres https:// ile başlamalı")
    if kind in ("tel", "whatsapp"):
        target = re.sub(r"[\s()\-]", "", target)
        if not _PHONE.fullmatch(target):
            raise ValueError("telefon numarası")
    if kind == "email" and not _EMAIL.fullmatch(target):
        raise ValueError("e-posta")
    return {"type": kind, "target": target[:500]}


def _clean(specs: dict, raw: Any, where: str) -> dict:
    """Site builder fields plus this builder's `action` and `icon` kinds (also inside lists)."""
    raw = raw if isinstance(raw, dict) else {}
    out: dict = {}
    for key, spec in specs.items():
        value, kind = raw.get(key), spec["kind"]
        if kind not in ("action", "icon", "list"):
            cleaned = _fields({key: spec}, raw, where).get(key)
        elif value in (None, "", [], {}):
            cleaned = None
        elif kind == "action":
            try:
                cleaned = clean_action(value)
            except ValueError as exc:
                raise BlockError(f"{where}: {spec['label']} geçersiz ({exc})") from exc
            _check_action(cleaned, spec.get("types"), where)
        elif kind == "icon":
            if value not in ICONS:
                raise BlockError(f"{where}: ikon geçersiz")
            cleaned = value
        else:
            if not isinstance(value, list):
                raise BlockError(f"{where}: {spec['label']} geçersiz")
            cleaned = [_clean(spec["fields"], item, f"{where} › {i + 1}")
                       for i, item in enumerate(value[: spec["max_items"]]) if isinstance(item, dict)]
        if cleaned is None and spec.get("required"):
            raise BlockError(f"{where}: {spec['label']} zorunlu")
        if cleaned is not None:
            out[key] = cleaned
    return out


def _items(raw: Any, specs: dict, where: str, limit: int) -> list[dict]:
    if not isinstance(raw, list):
        raise BlockError(f"{where} bir liste olmalı")
    if len(raw) > limit:
        raise BlockError(f"{where}: en fazla {limit} öğe olabilir")
    out, seen = [], set()
    for i, item in enumerate(raw):
        item = item if isinstance(item, dict) else {}
        item_id = str(item.get("id") or "")
        if not _ID.fullmatch(item_id) or item_id in seen:
            raise BlockError(f"{where}: kimlik geçersiz veya tekrar ediyor")
        seen.add(item_id)
        out.append({"id": item_id, **_clean(specs, item, f"{where} › {i + 1}")})
    return out


def validate_design(raw: Any) -> dict:
    """The cleaned document. Unknown keys are dropped; anything invalid raises BlockError."""
    if not isinstance(raw, dict):
        raise BlockError("Tasarım geçersiz")
    if len(json.dumps(raw, ensure_ascii=False).encode()) > MAX_BYTES:
        raise BlockError("Tasarım çok büyük; bazı blokları silin")
    tabs = _items(raw.get("tabs"), TAB_FIELDS, "Sekmeler", 5)
    if len(tabs) < 3:
        raise BlockError("En az 3 sekme olmalı")
    if sum(bool(t.get("highlight")) for t in tabs) > 1:
        raise BlockError("Yalnız bir sekme öne çıkarılabilir")
    drawer = _items(raw.get("drawer"), DRAWER_FIELDS, "Yan menü", MAX_DRAWER)
    header = _clean(HEADER_FIELDS, raw.get("header"), "Üst bar")
    # A hidden menu button makes the drawer unreachable, so it does not count then.
    reachable = {i["action"]["target"] for i in tabs + (drawer if header.get("show_menu", True) else [])
                 if i["action"]["type"] == "screen"}
    missing = [SCREENS[s] for s in REQUIRED_SCREENS if s not in reachable]
    if missing:
        raise BlockError(f"Sekmelerde veya açık yan menüde bulunmalı: {', '.join(missing)}")
    raw_pages = raw.get("pages")
    if not isinstance(raw_pages, list) or not raw_pages:
        raise BlockError("Ana sayfa bulunamadı")
    if len(raw_pages) > MAX_PAGES:
        raise BlockError(f"En fazla {MAX_PAGES} sayfa olabilir")
    pages, page_ids, block_ids = [], set(), set()
    for page in raw_pages:
        page = page if isinstance(page, dict) else {}
        page_id = str(page.get("id") or "")
        if not _ID.fullmatch(page_id) or page_id in page_ids:
            raise BlockError("Sayfa kimliği geçersiz veya tekrar ediyor")
        page_ids.add(page_id)
        title = _value(F("text", "Sayfa adı", max=60, required=True), page.get("title"), "Sayfa")
        blocks = page.get("blocks")
        if not isinstance(blocks, list) or len(blocks) > MAX_BLOCKS:
            raise BlockError(f"{title}: en fazla {MAX_BLOCKS} blok olabilir")
        cleaned = []
        for block in blocks:
            block = block if isinstance(block, dict) else {}
            spec, block_id = BLOCKS.get(block.get("type")), str(block.get("id") or "")
            if not spec:
                raise BlockError(f"{title}: bilinmeyen blok türü")
            if not _ID.fullmatch(block_id) or block_id in block_ids:
                raise BlockError("Blok kimliği geçersiz veya tekrar ediyor")
            block_ids.add(block_id)
            cleaned.append({"id": block_id, "type": block["type"],
                            "props": _clean(spec["fields"], block.get("props"), f"{title} › {spec['label']}")})
        pages.append({"id": page_id, "title": title, "blocks": cleaned})
    if "home" not in page_ids:
        raise BlockError("Ana sayfa silinemez")
    return {"schema": SCHEMA, "theme": _clean(THEME_FIELDS, raw.get("theme"), "Tema"),
            "header": header, "tabs": tabs, "drawer": drawer, "pages": pages}


def _walk_actions(value: Any):
    if isinstance(value, dict):
        if set(value) == {"type", "target"}:
            yield value
        else:
            for inner in value.values():
                yield from _walk_actions(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _walk_actions(inner)


async def check_targets(db: AsyncSession, org_id: UUID, design: dict) -> None:
    """Publishing only: pages, campaigns and news the design opens must exist in this organisation."""
    from app.models.campaign import Campaign
    from app.models.content_post import ContentPost

    page_ids = {p["id"] for p in design["pages"]}
    slugs: dict[str, set[str]] = {"campaign": set(), "news": set()}
    for action in _walk_actions({k: design[k] for k in ("tabs", "drawer", "pages")}):
        if action["type"] == "page" and action["target"] not in page_ids:
            raise BlockError("Bir bağlantı silinmiş bir sayfayı açıyor; bağlantıyı düzeltin")
        if action["type"] in slugs:
            slugs[action["type"]].add(action["target"])
    for kind, model, label in (("campaign", Campaign, "kampanya"), ("news", ContentPost, "haber")):
        if not slugs[kind]:
            continue
        found = set((await db.execute(select(model.slug).where(
            model.organization_id == org_id, model.slug.in_(slugs[kind])))).scalars().all())
        lost = sorted(slugs[kind] - found)
        if lost:
            raise BlockError(f"Bağlantıdaki {label} bulunamadı: {lost[0]}")
    wanted: set[str] = set()
    for page in design["pages"]:
        for block in page["blocks"]:
            props = block["props"]
            wanted.update(props.get("campaigns") or [])
            if props.get("campaign"):
                wanted.add(props["campaign"])
    if wanted:
        ids = [UUID(v) for v in wanted]
        found = set((await db.execute(select(Campaign.id).where(
            Campaign.organization_id == org_id, Campaign.id.in_(ids)))).scalars().all())
        if len(found) != len(ids):
            raise BlockError("Bir blokta seçili kampanya artık yok; kampanyayı yeniden seçin")


def _screen(target: str) -> dict:
    return {"type": "screen", "target": target}


def _block(block_id: str, block_type: str, **props) -> dict:
    """Titles are stored, not implied, so an organisation can also remove them."""
    title = BLOCKS[block_type]["fields"].get("title", {}).get("default")
    return {"id": block_id, "type": block_type, "props": {**({"title": title} if title else {}), **props}}


_HERO = dict(primary_label="Hızlı Bağış Yap", primary_action=_screen("bagis-yap"),
             secondary_label="Zekat Hesapla", secondary_action=_screen("zekat"))
_TOOLS = [
    {"icon": "calculator", "title": "Zekat Hesapla", "text": "Güncel TCMB altın & nisap", "color": "accent", "action": _screen("zekat")},
    {"icon": "landmark", "title": "IBAN Bilgileri", "text": "Tek tıkla kopyala", "color": "primary", "action": _screen("iban")},
]
_SHORTCUTS = [
    {"icon": "heart", "label": "Bağış Yap", "action": _screen("bagis-yap")},
    {"icon": "calculator", "label": "Zekât", "action": _screen("zekat")},
    {"icon": "landmark", "label": "IBAN", "action": _screen("iban")},
    {"icon": "newspaper", "label": "Haberler", "action": _screen("haberler")},
]


def default_design() -> dict:
    """Today's built-in storefront; mirrored by apps/mobile/src/design/defaultDesign.json."""
    return {
        "schema": SCHEMA, "theme": {}, "header": {},
        "tabs": [
            {"id": "tab-home", "label": "Anasayfa", "icon": "home", "action": _screen("home")},
            {"id": "tab-news", "label": "Haberler", "icon": "book-open", "action": _screen("haberler")},
            {"id": "tab-donate", "label": "Bağış Yap", "icon": "heart", "action": _screen("bagis-yap"), "highlight": True},
            {"id": "tab-cart", "label": "Bağış Sepeti", "icon": "shopping-bag", "action": _screen("sepet")},
            {"id": "tab-account", "label": "Hesabım", "icon": "layout-grid", "action": _screen("hesabim")},
        ],
        "drawer": [
            {"id": f"menu-{i}", "label": label, "icon": icon, "action": _screen(target)}
            for i, (label, icon, target) in enumerate((
                ("Anasayfa", "home", "home"), ("Hızlı Bağış Yap", "heart", "bagis-yap"),
                ("Bağış Sepetim", "shopping-bag", "sepet"), ("Zekat Hesapla", "calculator", "zekat"),
                ("IBAN / Hesap Numaraları", "landmark", "iban"), ("Haberler & Faaliyetler", "book-open", "haberler"),
                ("Makbuz Doğrula", "file-check", "makbuz-dogrula"), ("Hakkımızda & İletişim", "info", "iletisim")))
        ],
        "pages": [{"id": "home", "title": "Ana sayfa", "blocks": [
            _block("home-hero", "hero", **_HERO, space="none"),
            _block("home-banners", "banner_slider"),
            _block("home-cats", "quick_categories"),
            _block("home-campaigns", "campaign_list"),
            _block("home-tools", "tool_cards", items=_TOOLS),
            _block("home-contact", "contact_card"),
        ]}],
    }


THEMES = [
    {"key": key, "label": label, "theme": {"primary": p, "accent": a, "background": bg, "surface": "#FFFFFF", "text": t, "radius": r}}
    for key, label, p, a, bg, t, r in (
        ("zumrut", "Zümrüt & Altın", "#00533C", "#C8922B", "#F6F8F7", "#0F172A", "medium"),
        ("gece", "Gece Mavisi", "#1E3A8A", "#F59E0B", "#F5F7FB", "#0F172A", "large"),
        ("bordo", "Bordo", "#7F1D1D", "#B45309", "#FAF7F5", "#1C1917", "small"),
        ("turkuaz", "Turkuaz", "#0F766E", "#EA580C", "#F2FAF9", "#134E4A", "large"),
        ("grafit", "Grafit", "#1F2937", "#DC2626", "#F4F4F5", "#18181B", "none"),
        ("mor", "Mor", "#5B21B6", "#DB2777", "#F8F6FC", "#1E1B4B", "large"),
    )
]

TEMPLATES = [
    {"key": "klasik", "label": "Klasik vitrin", "blocks": default_design()["pages"][0]["blocks"]},
    {"key": "sade", "label": "Sade", "blocks": [
        _block("tpl-0001", "hero", look="card", **_HERO), _block("tpl-0002", "shortcuts", items=_SHORTCUTS),
        _block("tpl-0003", "campaign_list", look="compact"), _block("tpl-0004", "contact_card")]},
    {"key": "kampanya", "label": "Kampanya odaklı", "blocks": [
        _block("tpl-0001", "banner_slider", height=200), _block("tpl-0002", "featured_campaign", look="cover"),
        _block("tpl-0003", "campaign_carousel", title="Öne çıkanlar", look="poster"),
        _block("tpl-0004", "campaign_list"), _block("tpl-0005", "contact_card")]},
    {"key": "hizli", "label": "Hızlı bağış", "blocks": [
        _block("tpl-0001", "quick_donate", title="Bugün bir iyilik yap", amounts=[{"amount": v} for v in (100, 250, 500, 1000)]),
        _block("tpl-0002", "quick_categories", look="grid"), _block("tpl-0003", "campaign_list", look="compact"),
        _block("tpl-0004", "tool_cards", items=_TOOLS)]},
    {"key": "haber", "label": "Haber ağırlıklı", "blocks": [
        _block("tpl-0001", "banner_slider"), _block("tpl-0002", "shortcuts", look="circle", items=_SHORTCUTS),
        _block("tpl-0003", "news_list", look="carousel"), _block("tpl-0004", "campaign_carousel", title="Kampanyalar"),
        _block("tpl-0005", "contact_card")]},
    {"key": "ramazan", "label": "Ramazan", "blocks": [
        _block("tpl-0001", "hero", title="Ramazan bereketini paylaşın", **_HERO),
        _block("tpl-0002", "countdown", title="Ramazan'a kalan süre", done_text="Ramazanınız mübarek olsun"),
        _block("tpl-0003", "tool_cards", items=_TOOLS), _block("tpl-0004", "quick_categories", look="grid"),
        _block("tpl-0005", "campaign_list")]},
]


def catalog() -> dict:
    return {
        "blocks": BLOCKS, "theme": THEME_FIELDS, "header": HEADER_FIELDS, "tab": TAB_FIELDS, "drawer": DRAWER_FIELDS,
        "actions": ACTIONS, "screens": SCREENS, "required_screens": list(REQUIRED_SCREENS), "icons": ICONS,
        "themes": THEMES, "templates": TEMPLATES, "default": default_design(),
        "limits": {"pages": MAX_PAGES, "blocks": MAX_BLOCKS, "drawer": MAX_DRAWER, "tabs_min": 3, "tabs_max": 5},
    }
