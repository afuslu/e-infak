"""Site builder: block validation, drafts, publishing, revisions, previews, isolation."""
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
