"""Site builder: block validation, drafts, publishing, revisions, previews, isolation."""
import json
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.core.security import create_access_token
from app.models.organization import Organization, OrganizationDomain
from app.models.user import User, UserRole
from app.services.blocks import BlockError, default_home_blocks, validate_blocks


def test_validation_cleans_and_rejects():
    blocks = validate_blocks([
        {"id": "b-heading", "type": "heading", "props": {"text": "<b>Merhaba</b><script>alert(1)</script>", "level": "h9", "unknown": 1}},
    ][:0] + [
        {"id": "b-heading", "type": "heading", "props": {"text": "<b>Merhaba</b><script>alert(1)</script>", "level": "h2"},
         "style": {"desktop": {"font_size": 999, "bg_color": "#ff0000", "evil": "url(x)"}, "phone": {"font_size": 10}},
         "advanced": {"anchor": "giris", "starts_at": "2026-01-01T00:00:00Z"},
         "translations": {"en": {"text": "Hello"}, "xx": {"text": "?"}}},
    ])
    block = blocks[0]
    assert block["props"] == {"text": "Merhaba", "level": "h2"}
    assert block["style"] == {"desktop": {"font_size": 120, "bg_color": "#FF0000"}}
    assert block["translations"] == {"en": {"text": "Hello"}}
    for bad in (
        [{"id": "b-1x", "type": "script", "props": {}}],
        [{"id": "b-1x", "type": "buttons", "props": {"items": [{"label": "x", "url": "javascript:alert(1)"}]}}],
        [{"id": "b-1x", "type": "image", "props": {"image_url": "http://insecure.example/x.png"}}],
        [{"id": "b-1x", "type": "video", "props": {"url": "https://evil.example/v"}}],
        [{"id": "b-1x", "type": "heading", "props": {"text": "a"}, "style": {"desktop": {"bg_color": "red;}body{x"}}}],
        [{"id": "b-1x", "type": "heading", "props": {"text": "a"}}, {"id": "b-1x", "type": "heading", "props": {"text": "b"}}],
        [{"id": "b-1x", "type": "column", "children": []}],
        [{"id": "b-1x", "type": "heading", "props": {}}],
    ):
        with pytest.raises(BlockError):
            validate_blocks(bad)


def test_columns_are_normalised_and_nesting_is_limited():
    blocks = validate_blocks([{"id": "cols-1", "type": "columns", "props": {"ratio": "1-1-1"}, "children": [
        {"id": "col-a", "type": "column", "children": [{"id": "txt-1", "type": "richtext", "props": {"text": "a"}}]},
        {"id": "rogue", "type": "heading", "props": {"text": "x"}},
    ]}])
    assert [c["type"] for c in blocks[0]["children"]] == ["column", "column", "column"]
    assert blocks[0]["children"][0]["children"][0]["props"]["text"] == "a"
    deep = {"id": "s-0000", "type": "section", "children": []}
    node = deep
    for i in range(1, 6):
        child = {"id": f"s-{i:04d}", "type": "section", "children": []}
        node["children"].append(child)
        node = child
    with pytest.raises(BlockError):
        validate_blocks([deep])
    assert [b["type"] for b in validate_blocks(default_home_blocks("kategori"))][:3] == ["hero", "quick_donation", "categories"]


def test_slider_card_layout_and_thumb_nav():
    from app.services.template_hakder import hayir_kapisi

    cleaned = validate_blocks([
        {
            "id": "slider-card",
            "type": "slider",
            "props": {
                "layout": "card",
                "nav": "thumbs",
                "effect": "fade",
                "slides": [{"image_url": "/demo/water.webp", "title": "Su Kuyusu", "button_label": "Bağış Yap", "button_url": "/bagis"}],
            },
        },
        {
            "id": "slider-omitted",
            "type": "slider",
            "props": {
                "slides": [{"image_url": "/demo/water.webp", "title": "Varsayılan"}],
            },
        },
    ], "home")
    assert cleaned[0]["props"]["layout"] == "card"
    assert cleaned[0]["props"]["nav"] == "thumbs"
    assert "layout" not in cleaned[1]["props"]
    assert "nav" not in cleaned[1]["props"]

    with pytest.raises(BlockError):
        validate_blocks([{"id": "slider-bad", "type": "slider", "props": {"layout": "unknown", "slides": [{"image_url": "/demo/water.webp"}]}}], "home")

    hk_home = validate_blocks(hayir_kapisi()["home"], "home")
    assert hk_home[0]["type"] == "slider"
    assert hk_home[0]["props"]["layout"] == "card"
    assert hk_home[0]["props"]["nav"] == "thumbs"


@pytest.fixture
async def http(db_session):
    from app.core.db import engine
    from app.main import app
    await engine.dispose()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://test") as client:
        yield client


async def _org_with_admin(db, role=UserRole.STK_ADMIN):
    slug = f"sb-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, subdomain=slug, name=f"Kurum {slug}", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0,
                       template="kategori", site={"home_sections": ["campaigns", "news"]})
    db.add(org)
    await db.flush()
    db.add(OrganizationDomain(organization_id=org.id, domain=f"{slug}.example.org", status="active",
                              verification_token="t", is_primary=True))
    user = User(organization_id=org.id, email=f"u-{slug}@example.com", hashed_password="x", first_name="A",
                last_name="B", role=role)
    db.add(user)
    await db.commit()
    host = f"{slug}.example.org"
    return org, {"Host": host, "Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}, host


async def test_draft_publish_revisions_preview(db_session, http):
    org, auth, host = await _org_with_admin(db_session)
    base = "/api/v1/admin-features/site-builder"

    # Untouched home: editor starts from today's layout; the site keeps the classic rendering
    home = (await http.get(f"{base}/pages/home", headers=auth)).json()
    assert [b["type"] for b in home["blocks"]] == ["hero", "quick_donation", "campaigns", "news"]
    assert (await http.get("/api/v1/public/home", headers={"Host": host})).json()["blocks"] is None

    blocks = home["blocks"] + [{"id": "new-heading", "type": "heading", "props": {"text": "Yeni bölüm"}}]
    saved = await http.put(f"{base}/pages/home/draft", json={"blocks": blocks, "version": 0}, headers=auth)
    assert saved.status_code == 200 and saved.json()["version"] == 1
    # A stale editor cannot overwrite the newer draft
    stale = await http.put(f"{base}/pages/home/draft", json={"blocks": blocks, "version": 0}, headers=auth)
    assert stale.status_code == 409
    bad = await http.put(f"{base}/pages/home/draft", json={"blocks": [{"id": "x-123", "type": "nope"}], "version": 1}, headers=auth)
    assert bad.status_code == 422
    # Drafts are private until published, except through a signed preview link
    assert (await http.get("/api/v1/public/home", headers={"Host": host})).json()["blocks"] is None
    link = (await http.post(f"{base}/pages/home/preview-link", headers=auth)).json()["path"]
    token = link.split("onizleme=")[1]
    preview = (await http.get(f"/api/v1/public/home?onizleme={token}", headers={"Host": host})).json()
    assert preview["preview"] and preview["blocks"][-1]["props"]["text"] == "Yeni bölüm"
    forged = (await http.get(f"/api/v1/public/home?onizleme={token[:-1]}0", headers={"Host": host})).json()
    assert forged["preview"] is False

    published = await http.post(f"{base}/pages/home/publish", headers=auth)
    assert published.status_code == 200
    live = (await http.get("/api/v1/public/home", headers={"Host": host})).json()["blocks"]
    assert live[-1]["props"]["text"] == "Yeni bölüm"

    # Second version, then restore the first one as a draft
    version = (await http.get(f"{base}/pages/home", headers=auth)).json()["version"]
    await http.put(f"{base}/pages/home/draft", json={"blocks": live[:1], "version": version}, headers=auth)
    await http.post(f"{base}/pages/home/publish", headers=auth)
    revs = (await http.get(f"{base}/pages/home/revisions", headers=auth)).json()
    assert len(revs) == 2
    restored = await http.post(f"{base}/pages/home/revisions/{revs[1]['id']}/restore", headers=auth)
    assert len(restored.json()["blocks"]) == 5

    # Scheduled block: hidden before its start date
    future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    version = (await http.get(f"{base}/pages/home", headers=auth)).json()["version"]
    await http.put(f"{base}/pages/home/draft", headers=auth, json={"version": version, "blocks": [
        {"id": "now-1", "type": "heading", "props": {"text": "Şimdi"}},
        {"id": "later-1", "type": "heading", "props": {"text": "Bayramda"}, "advanced": {"starts_at": future}},
    ]})
    await http.post(f"{base}/pages/home/publish", headers=auth)
    live = (await http.get("/api/v1/public/home", headers={"Host": host})).json()["blocks"]
    assert [b["props"]["text"] for b in live] == ["Şimdi"]


async def test_custom_pages_and_isolation(db_session, http):
    org, auth, host = await _org_with_admin(db_session)
    other, other_auth, other_host = await _org_with_admin(db_session)
    base = "/api/v1/admin-features/site-builder"
    created = (await http.post(f"{base}/pages", json={"title": "Kurban 2027"}, headers=auth)).json()
    assert created["slug"] == "kurban-2027" and created["is_published"] is False
    page_id = created["id"]
    # Not public until published; preview link works
    assert (await http.get("/api/v1/public/pages/kurban-2027", headers={"Host": host})).status_code == 404
    await http.post(f"{base}/pages/{page_id}/publish", headers=auth)
    page = (await http.get("/api/v1/public/pages/kurban-2027", headers={"Host": host})).json()
    assert page["blocks"][0]["props"]["text"] == "Kurban 2027"
    # Another organisation can neither read nor edit it
    assert (await http.get(f"{base}/pages/{page_id}", headers=other_auth)).status_code == 404
    assert (await http.post(f"{base}/pages/{page_id}/publish", headers=other_auth)).status_code == 404
    assert (await http.get("/api/v1/public/pages/kurban-2027", headers={"Host": other_host})).status_code == 404
    # Home page record never shows up as a normal page
    await http.post(f"{base}/pages/home/publish", headers=auth)
    names = [p["slug"] for p in (await http.get("/api/v1/public/pages", headers={"Host": host})).json()]
    assert "__home__" not in names
    # Read-only staff cannot publish
    _, readonly_auth, _ = await _org_with_admin(db_session, role=UserRole.READONLY)
    assert (await http.post(f"{base}/pages/home/publish", headers=readonly_auth)).status_code == 403


def test_header_and_footer_zones():
    from app.services.blocks import default_footer_blocks, default_header_blocks
    header = validate_blocks(default_header_blocks(), "header")
    assert [len(row["children"]) for row in header] == [3, 3]
    assert validate_blocks(default_footer_blocks(), "footer")[0]["props"]["tone"] == "dark"
    row = {"id": "row-1", "type": "header_row", "props": {}, "children": [
        {"id": "row-1-a", "type": "header_slot", "children": [{"id": "logo-1", "type": "logo", "props": {}}]},
    ]}
    # Missing slots are added, so a row always has left, centre and right
    assert len(validate_blocks([row], "header")[0]["children"]) == 3
    for bad, kind in (
        ([{"id": "logo-1", "type": "logo", "props": {}}], "header"),  # items only inside a row
        ([{**row, "children": [{"id": "row-1-a", "type": "header_slot", "children": [
            {"id": "camp-1", "type": "campaigns", "props": {}}]}]}], "header"),  # content blocks stay out of headers
        ([row], "page"),
        ([{"id": "copy-1", "type": "copyright", "props": {}}], "home"),
        ([{"id": "slot-1", "type": "header_slot", "children": []}], "header"),
        ([], "sidebar"),
    ):
        with pytest.raises(BlockError):
            validate_blocks(bad, kind)
    # Mega menu items keep their grouped sub links; unsafe links are refused like everywhere else
    item = {"label": "Bağış", "mega": True, "children": [{"label": "Kurban", "url": "/kampanyalar/kurban", "group": "Dönemsel", "x": 1}]}
    menu = validate_blocks([{"id": "menu-1", "type": "nav_menu", "props": {"source": "custom", "items": [item]}}], "footer")
    assert menu[0]["props"]["items"][0]["children"] == [{"label": "Kurban", "url": "/kampanyalar/kurban", "group": "Dönemsel"}]
    item["children"].append({"label": "Kötü", "url": "javascript:alert(1)"})
    with pytest.raises(BlockError):
        validate_blocks([{"id": "menu-1", "type": "nav_menu", "props": {"source": "custom", "items": [item]}}], "footer")


async def test_header_footer_publish_and_fallback(db_session, http):
    org, auth, host = await _org_with_admin(db_session)
    base = "/api/v1/admin-features/site-builder"
    kinds = [p["kind"] for p in (await http.get(f"{base}/pages", headers=auth)).json()]
    assert kinds[:3] == ["home", "header", "footer"]
    # Untouched: the editor gets today's design as blocks, the site keeps the built-in one
    header = (await http.get(f"{base}/pages/header", headers=auth)).json()
    assert header["is_published"] is False and header["blocks"][1]["children"][0]["children"][0]["type"] == "logo"
    assert (await http.get("/api/v1/public/site-chrome", headers={"Host": host})).json() == {"header": None, "footer": None}
    # A header refuses content blocks at the top level
    bad = await http.put(f"{base}/pages/header/draft", headers=auth,
                         json={"version": 0, "blocks": [{"id": "head-1", "type": "heading", "props": {"text": "x"}}]})
    assert bad.status_code == 422
    blocks = header["blocks"][1:]
    saved = await http.put(f"{base}/pages/header/draft", headers=auth, json={"version": 0, "blocks": blocks})
    assert saved.status_code == 200
    # Drafts stay private; preview links are for real pages only
    assert (await http.get("/api/v1/public/site-chrome", headers={"Host": host})).json()["header"] is None
    assert (await http.post(f"{base}/pages/header/preview-link", headers=auth)).status_code == 422
    assert (await http.post(f"{base}/pages/header/publish", headers=auth)).status_code == 200
    chrome = (await http.get("/api/v1/public/site-chrome", headers={"Host": host})).json()
    assert [b["id"] for b in chrome["header"]] == ["hdr-main"] and chrome["footer"] is None
    # Header/footer never appear as public pages
    names = [p["slug"] for p in (await http.get("/api/v1/public/pages", headers={"Host": host})).json()]
    assert "__header__" not in names
    # Back to the built-in design; the work is kept as a draft
    reverted = (await http.post(f"{base}/pages/header/unpublish", headers=auth)).json()
    assert reverted["is_published"] is False and reverted["has_draft"] is True
    assert (await http.get("/api/v1/public/site-chrome", headers={"Host": host})).json()["header"] is None
    assert (await http.post(f"{base}/pages/home/unpublish", headers=auth)).status_code == 422


def test_library_content_is_valid():
    from app.services.templates import DEMOS, PAGE_TEMPLATES, SECTIONS, fresh_ids
    zone = {"content": "page", "header": "header", "footer": "footer"}
    for section in SECTIONS:
        validate_blocks(fresh_ids(section["blocks"]), zone[section["kind"]])
    for page in PAGE_TEMPLATES:
        validate_blocks(fresh_ids(page["blocks"]), "page")
    for demo in DEMOS:
        for kind in ("home", "header", "footer"):
            validate_blocks(fresh_ids(demo[kind]), kind)
    # Inserting the same section twice never clashes
    twice = fresh_ids(SECTIONS[0]["blocks"]) + fresh_ids(SECTIONS[0]["blocks"])
    validate_blocks(twice, "page")


async def test_demo_apply_and_saved_blocks(db_session, http):
    org, auth, host = await _org_with_admin(db_session)
    other, other_auth, _ = await _org_with_admin(db_session)
    base = "/api/v1/admin-features/site-builder"
    lib = (await http.get(f"{base}/library", headers=auth)).json()
    assert len(lib["sections"]) >= 30 and len(lib["demos"]) >= 5

    # An existing page keeps its address: the demo's page with the same slug is skipped
    await http.post(f"{base}/pages", json={"title": "Bize ulaşın", "slug": "bize-ulasin"}, headers=auth)
    applied = await http.post(f"{base}/demos/su-ve-yardim/apply", headers=auth,
                              json={"apply_theme": True, "include_pages": True, "publish": False})
    assert applied.status_code == 200, applied.text
    body = applied.json()
    assert {p["slug"] for p in body["created_pages"]} == {"hakkimizda-sayfasi", "kampanya"}
    assert body["skipped_pages"] == ["İletişim"]
    # Drafts only: visitors still see the old site
    assert (await http.get("/api/v1/public/home", headers={"Host": host})).json()["blocks"] is None
    assert (await http.get("/api/v1/public/site-chrome", headers={"Host": host})).json()["header"] is None
    site = (await http.get("/api/v1/public/site", headers={"Host": host})).json()
    assert site["primary_color"] == "#0F766E" and site["design"]["heading_case"] == "uppercase"
    # Publishing in one go
    live = await http.post(f"{base}/demos/cami-vakif/apply", headers=auth, json={"include_pages": False, "publish": True})
    assert live.json()["created_pages"] == []
    assert (await http.get("/api/v1/public/home", headers={"Host": host})).json()["blocks"][0]["type"] == "banner"
    chrome = (await http.get("/api/v1/public/site-chrome", headers={"Host": host})).json()
    assert len(chrome["header"]) == 3 and chrome["footer"]
    assert (await http.post(f"{base}/demos/yok/apply", headers=auth, json={})).status_code == 404

    # Saved blocks: validated, per organisation, hidden from page lists
    block = {"id": "x-12345", "type": "heading", "props": {"text": "Kayıtlı <b>başlık</b>"}}
    saved = await http.post(f"{base}/saved-blocks", headers=auth, json={"name": "Başlığım", "block": block})
    assert saved.status_code == 201
    item = saved.json()
    assert item["block"]["props"]["text"] == "Kayıtlı başlık" and item["block"]["id"] != "x-12345"
    element = await http.post(f"{base}/saved-blocks", headers=auth,
                              json={"name": "Bağış butonu", "zone": "header", "block": {"id": "d-12345", "type": "donate_button", "props": {}}})
    assert element.status_code == 201
    bad = await http.post(f"{base}/saved-blocks", headers=auth, json={"name": "x", "block": {"id": "x-1234", "type": "header_row"}})
    assert bad.status_code == 422
    assert len((await http.get(f"{base}/saved-blocks", headers=auth)).json()) == 2
    assert (await http.get(f"{base}/saved-blocks", headers=other_auth)).json() == []
    assert (await http.delete(f"{base}/saved-blocks/{item['id']}", headers=other_auth)).status_code == 404
    kinds = {p["kind"] for p in (await http.get(f"{base}/pages", headers=auth)).json()}
    assert "saved" not in kinds
    assert (await http.get(f"{base}/pages/{item['id']}", headers=auth)).status_code == 404
    assert (await http.delete(f"{base}/saved-blocks/{item['id']}", headers=auth)).status_code == 204


# --- Hayır Kapısı (HAKDER) blocks, demo and redirects ---------------------------------------

def test_donation_and_site_blocks_validate():
    camp = str(uuid.uuid4())
    block = validate_blocks([{"id": "cards-1", "type": "donation_cards", "props": {
        "source": "tabs", "tabs": [{"label": "Kurban", "tag": "kurban"}], "currency_switcher": True, "columns": 9,
        "cards": [{"campaign_id": camp, "unit_amount": 2500, "quantity": "hisse", "niyet": "Adak, <b>Akika</b>",
                   "durations": "12, 18", "shares_total": 20, "shares_taken": 8, "evil": "x"}],
    }}])[0]
    card = block["props"]["cards"][0]
    assert block["props"]["columns"] == 4 and "evil" not in card and card["niyet"] == "Adak, Akika"
    for bad in (
        {"id": "cards-2", "type": "donation_cards", "props": {"cards": [{"campaign_id": "not-a-uuid"}]}},
        {"id": "cards-3", "type": "donation_cards", "props": {"cards": [{"campaign_id": camp, "quantity": "kilo"}]}},
        {"id": "ann-1", "type": "announcement_bar", "props": {"text": "x", "url": "javascript:alert(1)"}},
        {"id": "ann-2", "type": "announcement_bar", "props": {}},
    ):
        with pytest.raises(BlockError):
            validate_blocks([bad])
    # Announcement bar may top a header; currency switcher and cart go into header slots
    header = validate_blocks([
        {"id": "ann-3", "type": "announcement_bar", "props": {"text": "Kurban kayıtları başladı", "url": "/bagis?tab=kurban"}},
        {"id": "row-1", "type": "header_row", "props": {}, "children": [
            {"id": "slot-1", "type": "header_slot", "children": [{"id": "cur-1", "type": "currency_switcher", "props": {"style": "select"}}]},
            {"id": "slot-2", "type": "header_slot", "children": []},
            {"id": "slot-3", "type": "header_slot", "children": [{"id": "cart-1", "type": "cart_button", "props": {}}]},
        ]},
    ], "header")
    assert [b["type"] for b in header] == ["announcement_bar", "header_row"]
    with pytest.raises(BlockError):
        validate_blocks([{"id": "cart-2", "type": "cart_button", "props": {}}], "header")
    # Phone tab bar: footer only
    validate_blocks([{"id": "tab-1", "type": "mobile_tab_bar", "props": {"items": [{"label": "Sepetim", "url": "/bagis/sepetim", "icon": "cart"}]}}], "footer")
    with pytest.raises(BlockError):
        validate_blocks([{"id": "tab-2", "type": "mobile_tab_bar", "props": {"items": [{"label": "x", "url": "/"}]}}], "home")


def test_hayir_kapisi_demo_and_legal_pages():
    from app.services.site import THEME_KITS
    from app.services.template_hakder import hayir_kapisi
    from app.services.templates import DEMO_BY_KEY, PAGE_BY_KEY, fresh_ids

    demo = DEMO_BY_KEY["hayir-kapisi"]
    assert any(k["key"] == demo["kit"] for k in THEME_KITS)
    for kind in ("home", "header", "footer"):
        validate_blocks(fresh_ids(demo[kind]), kind)
    slugs = {PAGE_BY_KEY[k]["slug"] for k in demo["pages"]}
    assert {"bagis", "mesafeli-bagis-sozlesmesi", "iade-ve-iptal-kosullari", "cerez-politikasi"} <= slugs
    for key in demo["pages"]:
        validate_blocks(fresh_ids(PAGE_BY_KEY[key]["blocks"]), "page")
    # The footer never carries a platform credit; organisation details reach the legal texts
    built = hayir_kapisi(org={"legal_name": "Hayıra Açılan Kapı Derneği", "phone": "0222 233 30 30"})
    flat = json.dumps(built, ensure_ascii=False)
    assert '"show_powered": false' in flat and "STK PRO" not in flat
    assert "Hayıra Açılan Kapı Derneği" in json.dumps(built["pages"]["mesafeli-bagis-sozlesmesi"], ensure_ascii=False)


def test_redirect_table_is_cleaned():
    from app.services.redirects import RedirectError, clean_redirects

    rows = clean_redirects([{"from": "Zekat-Hesaplama/?x=1", "to": "/zekat-hesapla"},
                            {"from": "/genel-bagis", "to": "/kampanyalar/genel-bagis"}])
    assert rows[0] == {"from": "/zekat-hesaplama", "to": "/zekat-hesapla"}
    for bad in (
        [{"from": "/", "to": "/x"}],
        [{"from": "/api/v1/x", "to": "/x"}],
        [{"from": "/a", "to": "javascript:alert(1)"}],
        [{"from": "/a", "to": "/a"}],
        [{"from": "/a", "to": "/b"}, {"from": "/b", "to": "/a"}],
        [{"from": "/a", "to": "/b"}, {"from": "/a", "to": "/c"}],
        [{"from": "https://evil.example/a", "to": "/b"}],
    ):
        with pytest.raises(RedirectError):
            clean_redirects(bad)


async def test_redirects_api_and_appearance_keeps_them(db_session, http):
    from app.services.site import SiteAppearance, apply_appearance

    org, auth, host = await _org_with_admin(db_session)
    other, other_auth, other_host = await _org_with_admin(db_session)
    base = "/api/v1/admin-features/site-builder/redirects"
    table = [{"from": "/zekat-hesaplama", "to": "/zekat-hesapla"}, {"from": "/eski", "to": "https://example.org/yeni"}]
    saved = await http.put(base, json={"redirects": table}, headers=auth)
    assert saved.status_code == 200, saved.text
    assert saved.json()["redirects"] == table
    assert (await http.put(base, json={"redirects": [{"from": "/a", "to": "/a"}]}, headers=auth)).status_code == 422
    public = (await http.get("/api/v1/public/redirects", headers={"Host": host})).json()["redirects"]
    assert public == {"/zekat-hesaplama": "/zekat-hesapla", "/eski": "https://example.org/yeni"}
    assert (await http.get("/api/v1/public/redirects", headers={"Host": other_host})).json()["redirects"] == {}
    # Saving the appearance form does not drop the table
    await db_session.refresh(org)
    apply_appearance(org, SiteAppearance(template="klasik"))
    assert org.site["redirects"] == table


def test_extra_blocks_and_wider_library():
    from app.services.templates import DEMOS, PAGE_BY_KEY, SECTIONS
    blocks = validate_blocks([
        {"id": "cd-1234", "type": "countdown", "props": {"title": "Kurban", "target": "2027-05-15T18:00:00+03:00", "tone": "dark"}},
        {"id": "ib-1234", "type": "bank_accounts", "props": {"items": [{"bank": "Banka <b>A</b>", "iban": "TR00 0000", "currency": "USD", "x": 1}]}},
        {"id": "ct-1234", "type": "counters", "props": {"look": "band", "items": [{"value": "1250", "suffix": "+", "label": "Kuyu"}]}},
        {"id": "ga-1234", "type": "image_gallery", "props": {"columns": 99, "items": [{"image_url": "/demo/water.svg"}]}},
        {"id": "tb-1234", "type": "tabs", "props": {"look": "accordion", "items": [{"label": "A", "text": "metin <script>x</script>"}]}},
    ])
    assert blocks[1]["props"]["items"] == [{"bank": "Banka A", "iban": "TR00 0000", "currency": "USD"}]
    assert blocks[2]["props"]["items"][0]["value"] == 1250 and blocks[3]["props"]["columns"] == 6
    assert "script" not in blocks[4]["props"]["items"][0]["text"]
    for bad in (
        [{"id": "cd-1234", "type": "countdown", "props": {"title": "x"}}],                       # needs a date
        [{"id": "cd-1234", "type": "countdown", "props": {"target": "yarın"}}],
        [{"id": "ga-1234", "type": "image_gallery", "props": {"items": [{"image_url": "http://x/y.png"}]}}],
        [{"id": "mq-1234", "type": "marquee", "props": {"tone": "neon", "items": [{"text": "a"}]}}],
        [{"id": "lg-1234", "type": "logos", "props": {"items": [{"name": "A", "url": "javascript:alert(1)"}]}}],
    ):
        with pytest.raises(BlockError):
            validate_blocks(bad)
    # A pop-up belongs to a page, never to the shared header or footer
    with pytest.raises(BlockError):
        validate_blocks([{"id": "pp-1234", "type": "popup", "props": {"title": "x"}}], "footer")
    groups = {s["group"] for s in SECTIONS}
    assert {"Slider", "Özellikler", "Hayır Kapısı"} <= groups
    assert sum(s["group"] == "Slider" for s in SECTIONS) >= 8 and len(SECTIONS) >= 75 and len(DEMOS) >= 11
    assert all(page in PAGE_BY_KEY for demo in DEMOS for page in demo["pages"])
