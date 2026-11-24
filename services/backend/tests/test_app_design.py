"""Mobil Uygulama Yapıcı: validation, publishing, isolation, store application and renderer contract."""
import copy
import io
import json
import re
import uuid
import zipfile
from pathlib import Path

import pytest

from app.core.security import create_access_token
from app.models.donation import Donor
from app.models.mobile_app import MobileAppRequest
from app.models.platform import PlatformUser
from app.models.user import User, UserRole
from app.services.app_design import BLOCKS, ICONS, TEMPLATES, THEMES, default_design, validate_design
from app.services.blocks import BlockError
from tests.test_site_builder import _org_with_admin, http  # noqa: F401

BASE = "/api/v1/admin-features/app-builder"
ROOT = Path(__file__).resolve().parents[3]


def _with(**changes):
    return {**copy.deepcopy(default_design()), **changes}


def test_default_templates_and_themes_are_valid():
    assert validate_design(default_design()) == default_design()
    for template in TEMPLATES:
        validate_design(_with(pages=[{"id": "home", "title": "A", "blocks": template["blocks"]}]))
    for theme in THEMES:
        assert validate_design(_with(theme=theme["theme"]))["theme"] == theme["theme"]


def test_actions_are_cleaned_everywhere_including_lists():
    def button(action):
        return _with(pages=[{"id": "home", "title": "A", "blocks": [
            {"id": "b-0001", "type": "buttons", "props": {"items": [{"label": "x", "action": action}], "evil": 1}}]}])
    good = validate_design(button({"type": "tel", "target": "+90 (555) 111 22 33", "x": 1}))
    assert good["pages"][0]["blocks"][0]["props"] == {"items": [
        {"label": "x", "action": {"type": "tel", "target": "+905551112233"}}]}
    # A half-filled action is an empty one, so autosave works while typing
    assert "action" not in validate_design(button({"type": "url", "target": ""}))["pages"][0]["blocks"][0]["props"]["items"][0]
    for bad in ({"type": "url", "target": "javascript:alert(1)"}, {"type": "url", "target": "http://a.com"},
                {"type": "screen", "target": "odeme"}, {"type": "page", "target": "../x"},
                {"type": "campaign", "target": "a/b"}, {"type": "nope", "target": "x"}, {"type": "tel", "target": "abc"}):
        with pytest.raises(BlockError):
            validate_design(button(bad))


def test_structure_rules():
    tabs = default_design()["tabs"]
    cases = [
        _with(tabs=tabs[:2]), _with(tabs=tabs + [{**tabs[0], "id": "tab-six1"}]),
        _with(tabs=[{**t, "highlight": True} for t in tabs]),
        _with(tabs=[{**tabs[0], "action": {"type": "url", "target": "https://a.com"}}] + tabs[1:]),
        _with(tabs=[{**tabs[0], "icon": "nope"}] + tabs[1:]),
        _with(pages=[]), _with(pages=[{"id": "other", "title": "A", "blocks": []}]),
        _with(pages=[{"id": "home", "title": "A", "blocks": [{"id": "b-0001", "type": "script"}]}]),
        _with(theme={"primary": "red;}"}), _with(header={"logo_url": "http://a.com/x.png"}),
    ]
    for bad in cases:
        with pytest.raises(BlockError):
            validate_design(bad)


def test_cart_must_stay_reachable():
    tabs = [t for t in default_design()["tabs"] if t["id"] != "tab-cart"]
    validate_design(_with(tabs=tabs))  # still in the drawer
    with pytest.raises(BlockError, match="sepet"):
        validate_design(_with(tabs=tabs, drawer=[]))
    with pytest.raises(BlockError, match="sepet"):
        validate_design(_with(tabs=tabs, header={"show_menu": False}))


async def test_draft_publish_conflict_restore_and_public(db_session, http):  # noqa: F811
    org, auth, host = await _org_with_admin(db_session)
    public = "/api/v1/public/app-design"
    first = (await http.get(f"{BASE}/design", headers=auth)).json()
    assert first["design"] == default_design() and not first["is_published"]
    assert (await http.get(public, headers={"Host": host})).json() == {"design": None}

    design = _with(theme={"primary": "#112233"})
    saved = await http.put(f"{BASE}/design/draft", json={"design": design, "version": 0}, headers=auth)
    assert saved.json() == {"version": 1}
    assert (await http.put(f"{BASE}/design/draft", json={"design": design, "version": 0}, headers=auth)).status_code == 409
    assert (await http.post(f"{BASE}/design/publish", json={"version": 0}, headers=auth)).status_code == 409
    assert (await http.get(public, headers={"Host": host})).json()["design"] is None  # drafts stay private

    assert (await http.post(f"{BASE}/design/publish", json={"version": 1}, headers=auth)).status_code == 200
    live = await http.get(public, headers={"Host": host})
    assert live.json()["design"]["theme"] == {"primary": "#112233"}
    assert (await http.get(public, headers={"Host": host, "If-None-Match": live.headers["etag"]})).status_code == 304

    await http.put(f"{BASE}/design/draft", json={"design": _with(theme={"primary": "#445566"}), "version": 2}, headers=auth)
    await http.post(f"{BASE}/design/publish", json={"version": 3}, headers=auth)
    revs = (await http.get(f"{BASE}/design/revisions", headers=auth)).json()
    assert len(revs) == 2
    restored = (await http.post(f"{BASE}/design/revisions/{revs[1]['id']}/restore", json={"version": 4}, headers=auth)).json()
    assert restored["design"]["theme"] == {"primary": "#112233"} and restored["has_draft"]
    assert (await http.post(f"{BASE}/design/discard", json={"version": 5}, headers=auth)).json()["design"]["theme"] == {"primary": "#445566"}
    assert (await http.post(f"{BASE}/design/unpublish", json={"version": 6}, headers=auth)).status_code == 200
    assert (await http.get(public, headers={"Host": host})).json()["design"] is None

    # Another organisation sees neither the design nor the revisions
    _, other, other_host = await _org_with_admin(db_session)
    assert (await http.get(f"{BASE}/design/revisions", headers=other)).json() == []
    assert (await http.post(f"{BASE}/design/revisions/{revs[0]['id']}/restore", json={"version": 0}, headers=other)).status_code == 404


async def test_publish_rejects_missing_targets(db_session, http):  # noqa: F811
    _, auth, _ = await _org_with_admin(db_session)
    for version, action in ((0, {"type": "page", "target": "page-gone"}), (1, {"type": "campaign", "target": "yok"}),
                            (2, {"type": "news", "target": "yok"})):
        design = _with(drawer=default_design()["drawer"] + [{"id": "menu-x", "label": "x", "icon": "star", "action": action}])
        assert (await http.put(f"{BASE}/design/draft", json={"design": design, "version": version}, headers=auth)).status_code == 200
        assert (await http.post(f"{BASE}/design/publish", json={"version": version + 1}, headers=auth)).status_code == 422
    design = _with(pages=[{"id": "home", "title": "A", "blocks": [
        {"id": "b-0001", "type": "progress", "props": {"campaign": str(uuid.uuid4())}}]}])
    await http.put(f"{BASE}/design/draft", json={"design": design, "version": 3}, headers=auth)
    assert (await http.post(f"{BASE}/design/publish", json={"version": 4}, headers=auth)).status_code == 422


async def test_access_control(db_session, http):  # noqa: F811
    org, _, host = await _org_with_admin(db_session)
    assert (await http.get(f"{BASE}/design", headers={"Host": host})).status_code in (401, 403)
    staff = User(organization_id=org.id, email=f"s-{uuid.uuid4().hex[:8]}@example.com", hashed_password="x",
                 first_name="S", last_name="T", role=UserRole.READONLY)
    db_session.add(staff)
    await db_session.commit()
    headers = {"Host": host, "Authorization": f"Bearer {create_access_token({'sub': str(staff.id)})}"}
    assert (await http.put(f"{BASE}/design/draft", json={"design": default_design(), "version": 0}, headers=headers)).status_code == 403


async def test_shared_app_resolves_the_donors_organisation(db_session, http):  # noqa: F811
    """e-İnfak app: platform host, organisation from the donor's token."""
    seen = []
    for color in ("#111111", "#222222"):
        org, auth, _ = await _org_with_admin(db_session)
        await http.put(f"{BASE}/design/draft", json={"design": _with(theme={"primary": color}), "version": 0}, headers=auth)
        await http.post(f"{BASE}/design/publish", json={"version": 1}, headers=auth)
        donor = Donor(organization_id=org.id, first_name="B", last_name="C", phone="+90555" + uuid.uuid4().hex[:7].translate(str.maketrans("abcdef", "123456")))
        db_session.add(donor)
        await db_session.commit()
        token = create_access_token({"sub": str(donor.id), "role": "donor"})
        res = await http.get("/api/v1/public/app-design", headers={"Host": "e-infak.org", "Authorization": f"Bearer {token}"})
        seen.append(res.json()["design"]["theme"]["primary"])
    assert seen == ["#111111", "#222222"]
    assert (await http.get("/api/v1/public/app-design", headers={"Host": "e-infak.org"})).status_code == 404


async def test_store_application(db_session, http, tmp_path, monkeypatch):  # noqa: F811
    from PIL import Image
    from app.core.config import settings

    monkeypatch.setattr(settings, "MEDIA_ROOT", str(tmp_path))
    org, auth, _ = await _org_with_admin(db_session)

    async def upload(size, mode="RGB"):
        buffer = io.BytesIO()
        Image.new(mode, size, (10, 90, 60, 0) if mode == "RGBA" else (10, 90, 60)).save(buffer, "PNG")
        res = await http.post("/api/v1/admin-features/media", files={"file": ("i.png", buffer.getvalue(), "image/png")}, headers=auth)
        assert res.status_code in (200, 201), res.text
        return res.json()["url"]

    icon, small, clear = await upload((1024, 1024)), await upload((512, 512)), await upload((1024, 1024), "RGBA")
    data = {"app_name": "Kurum", "package_id": f"org.k{uuid.uuid4().hex[:8]}.mobile", "short_description": "a", "full_description": "b",
            "icon_url": icon, "splash_url": icon, "privacy_url": "https://a.org/gizlilik", "support_email": "a@a.org",
            "contact_name": "A", "contact_phone": "1"}
    for bad in ({"icon_url": small}, {"icon_url": clear}, {"icon_url": "https://a.org/x.png"}, {"package_id": "Kurum"},
                {"privacy_url": "http://a.org"}, {"app_name": ""}):
        assert (await http.post(f"{BASE}/store/submit", json={**data, **bad}, headers=auth)).status_code == 422, bad
    assert (await http.post(f"{BASE}/store/submit", json=data, headers=auth)).json()["status"] == "submitted"
    assert (await http.put(f"{BASE}/store", json=data, headers=auth)).status_code == 409

    operator = PlatformUser(email=f"p-{uuid.uuid4().hex[:8]}@example.com", hashed_password="x")
    db_session.add(operator)
    await db_session.commit()
    from app.core.security import password_fingerprint
    ops = {"Authorization": f"Bearer {create_access_token({'sub': str(operator.id), 'scope': 'platform', 'pwd': password_fingerprint('x')})}"}
    assert (await http.get("/api/v1/platform/app-requests", headers=auth)).status_code in (401, 403)
    rows = (await http.get("/api/v1/platform/app-requests", headers=ops)).json()
    row = next(r for r in rows if r["slug"] == org.slug)
    package = await http.get(f"/api/v1/platform/app-requests/{row['id']}/package", headers=ops)
    archive = zipfile.ZipFile(io.BytesIO(package.content))
    assert set(archive.namelist()) == {"app.json", "icon.png", "splash.png"}
    assert json.loads(archive.read("app.json"))["packageAndroid"] == data["package_id"]
    url = f"/api/v1/platform/app-requests/{row['id']}"
    assert (await http.patch(url, json={"status": "changes_requested"}, headers=ops)).status_code == 422
    assert (await http.patch(url, json={"status": "changes_requested", "note": "İkonu değiştirin"}, headers=ops)).status_code == 200
    assert (await http.get(f"{BASE}/store", headers=auth)).json()["editable"]
    assert (await db_session.get(MobileAppRequest, uuid.UUID(row["id"]))).submitted_by

    _, other, _ = await _org_with_admin(db_session)
    assert (await http.post(f"{BASE}/store/submit", json=data, headers=other)).status_code == 422


@pytest.mark.skipif(not (ROOT / "apps/mobile").is_dir(), reason="apps/ is not in the backend image")
def test_renderers_cover_the_catalogue():
    """Every block and icon is drawn by both the app and the editor preview."""
    mobile, web = ROOT / "apps/mobile/src/design", ROOT / "apps/web/components/app-builder"
    for folder in (mobile, web):
        blocks = (folder / "blocks.tsx").read_text()
        icons = (folder / "icons.ts").read_text()
        for name in BLOCKS:
            assert re.search(rf"^  {name}: ", blocks, re.M), (folder, name)
        for icon in ICONS:
            assert f"'{icon}':" in icons or re.search(rf"\b{icon}: ", icons), (folder, icon)
    assert json.loads((mobile / "defaultDesign.json").read_text()) == default_design()
