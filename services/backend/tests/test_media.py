"""Media library: WebP variants, EXIF stripping, quota, tenant isolation, where-used, legacy files."""
import io
import uuid

import httpx
import pytest
from PIL import Image

from app.core.config import settings
from app.core.security import create_access_token
from app.models.cms import SitePage
from app.models.media import MediaAsset
from app.models.organization import Organization
from app.models.user import User, UserRole


@pytest.fixture
async def http(db_session, tmp_path, monkeypatch):
    from app.core.db import engine
    from app.main import app
    monkeypatch.setattr(settings, "MEDIA_ROOT", str(tmp_path))
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", False)
    await engine.dispose()  # pooled connections belong to an earlier test's event loop
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://e-infak.org") as client:
        yield client


async def _tenant(db, plan="ileri", role=UserRole.STK_ADMIN):
    slug = f"m{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name=slug, legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", subdomain=slug, plan=plan, enabled_addons=[],
                       extra_user_seats=0, settings={})
    db.add(org)
    await db.flush()
    user = User(organization_id=org.id, email=f"a@{slug}.example.com", hashed_password="x",
                first_name="A", last_name="B", role=role)
    db.add(user)
    await db.commit()
    headers = {"Host": f"{slug}.e-infak.org", "Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}
    return org, headers


def _jpeg(width=2400, height=1600, exif=True) -> bytes:
    image = Image.new("RGB", (width, height), "#3366AA")
    out = io.BytesIO()
    params = {}
    if exif:
        data = Image.Exif()
        data[0x010F] = "GizliKamera"  # Make
        data[0x0131] = "secret-software"  # Software
        params["exif"] = data.tobytes()
    image.save(out, format="JPEG", quality=90, **params)
    return out.getvalue()


async def _upload(http, headers, content, name="foto.jpg", **data):
    return await http.post("/api/v1/admin-features/media", headers=headers,
                           files={"file": (name, content, "image/jpeg")}, data=data)


async def test_upload_creates_webp_variants_without_exif(db_session, http, tmp_path):
    org, headers = await _tenant(db_session)
    res = await _upload(http, headers, _jpeg())
    assert res.status_code == 201, res.text
    asset = res.json()
    assert asset["url"].endswith(".webp") and asset["mime"] == "image/webp"
    assert (asset["width"], asset["height"]) == (2400, 1600)
    widths = [v["width"] for v in asset["variants"]]
    assert widths == [480, 960, 1440, 1920, 2400]
    assert "480w" in asset["srcset"] and asset["thumbnail_url"].endswith("-480.webp")

    folder = tmp_path / str(org.id)
    for variant in asset["variants"]:
        with Image.open(folder / variant["url"].rsplit("/", 1)[1]) as image:
            assert image.format == "WEBP"
            assert not image.getexif()
            assert "exif" not in image.info
    # The original is kept on disk but never served
    originals = list(folder.glob("*.orig.jpg"))
    assert len(originals) == 1
    hidden = await http.get(f"/api/v1/media/{org.id}/{originals[0].name}")
    assert hidden.status_code == 404
    served = await http.get(asset["url"])
    assert served.status_code == 200 and served.headers["content-type"] == "image/webp"

    # A small image is never upscaled
    small = (await _upload(http, headers, _jpeg(300, 200, exif=False), "kucuk.jpg")).json()
    assert [v["width"] for v in small["variants"]] == [300]

    usage = (await http.get("/api/v1/admin-features/media/usage", headers=headers)).json()
    assert usage["count"] == 2 and usage["used_bytes"] > 0 and usage["quota_bytes"] == 20 * 1024 ** 3


async def test_svg_and_fake_images_are_rejected(db_session, http):
    _, headers = await _tenant(db_session)
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    assert (await _upload(http, headers, svg, "x.svg")).status_code == 422
    assert (await _upload(http, headers, b"\x89PNG\r\n\x1a\nnot really", "x.png")).status_code == 422


async def test_quota_is_enforced(db_session, http):
    org, headers = await _tenant(db_session, plan="baslangic")
    org.settings = {"media_quota_mb": 0}
    await db_session.commit()
    res = await _upload(http, headers, _jpeg(200, 200))
    assert res.status_code == 413
    assert res.json()["detail"]["code"] == "media_quota_exceeded"
    org.settings = {}
    await db_session.commit()
    assert (await _upload(http, headers, _jpeg(200, 200))).status_code == 201
    assert (await http.get("/api/v1/admin-features/media/usage", headers=headers)).json()["quota_bytes"] == 1024 ** 3


async def test_tenant_isolation(db_session, http):
    org_a, headers_a = await _tenant(db_session)
    _, headers_b = await _tenant(db_session)
    asset = (await _upload(http, headers_a, _jpeg(600, 400))).json()
    folder = (await http.post("/api/v1/admin-features/media/folders", json={"name": "Kampanyalar"}, headers=headers_a)).json()

    listed_b = (await http.get("/api/v1/admin-features/media", headers=headers_b)).json()
    assert listed_b["total"] == 0
    for method, path, body in [
        ("get", f"/media/{asset['id']}", None),
        ("patch", f"/media/{asset['id']}", {"alt_text": "x"}),
        ("post", f"/media/{asset['id']}/crop", {"x": 0, "y": 0, "width": 0.5, "height": 0.5}),
        ("get", f"/media/{asset['id']}/usage", None),
        ("delete", f"/media/{asset['id']}", None),
        ("put", f"/media/folders/{folder['id']}", {"name": "Benim"}),
        ("delete", f"/media/folders/{folder['id']}", None),
    ]:
        res = await http.request(method.upper(), f"/api/v1/admin-features{path}", headers=headers_b, json=body)
        assert res.status_code == 404, (method, path, res.status_code)
    # Moving someone else's asset changes nothing; another tenant's folder is refused
    moved = await http.post("/api/v1/admin-features/media/move", json={"ids": [asset["id"]]}, headers=headers_b)
    assert moved.json()["moved"] == 0
    upload_into_foreign = await _upload(http, headers_b, _jpeg(100, 100), folder_id=folder["id"])
    assert upload_into_foreign.status_code == 404
    assert (await http.get("/api/v1/admin-features/media", headers=headers_a)).json()["total"] == 1


async def test_metadata_folders_and_crop(db_session, http):
    _, headers = await _tenant(db_session)
    asset = (await _upload(http, headers, _jpeg(1000, 500))).json()
    folder = (await http.post("/api/v1/admin-features/media/folders", json={"name": "Haberler"}, headers=headers)).json()
    assert (await http.post("/api/v1/admin-features/media/folders", json={"name": "Haberler"}, headers=headers)).status_code == 409

    updated = (await http.patch(f"/api/v1/admin-features/media/{asset['id']}", headers=headers, json={
        "alt_text": "Su kuyusu açılışı", "caption": "Afrika 2026", "credit": "Foto: Ali",
        "focal_x": 0.2, "focal_y": 0.8, "tags": ["Su", "afrika", "su"], "folder_id": folder["id"],
    })).json()
    assert updated["alt_text"] == "Su kuyusu açılışı" and updated["tags"] == ["su", "afrika"]
    assert updated["folder_id"] == folder["id"] and updated["focal_x"] == 0.2
    assert (await http.patch(f"/api/v1/admin-features/media/{asset['id']}", headers=headers,
                             json={"focal_x": 1.5})).status_code == 422

    in_folder = (await http.get("/api/v1/admin-features/media", params={"folder": folder["id"]}, headers=headers)).json()
    assert in_folder["total"] == 1
    assert (await http.get("/api/v1/admin-features/media", params={"tag": "afrika"}, headers=headers)).json()["total"] == 1
    assert (await http.get("/api/v1/admin-features/media", params={"q": "kuyusu"}, headers=headers)).json()["total"] == 1
    assert (await http.get("/api/v1/admin-features/media", params={"folder": "root"}, headers=headers)).json()["total"] == 0

    cropped = await http.post(f"/api/v1/admin-features/media/{asset['id']}/crop", headers=headers,
                              json={"x": 0.25, "y": 0, "width": 0.5, "height": 1})
    assert cropped.status_code == 200, cropped.text
    data = cropped.json()
    assert data["cropped"] and (data["width"], data["height"]) == (500, 500)
    assert "-k.webp?v=" in data["url"] and [v["width"] for v in data["variants"]] == [480, 500]
    assert (await http.get(data["url"].split("?")[0])).status_code == 200
    assert data["source_url"].endswith(".webp") and "-k" not in data["source_url"]

    await http.delete(f"/api/v1/admin-features/media/folders/{folder['id']}", headers=headers)
    assert (await http.get("/api/v1/admin-features/media", params={"folder": "root"}, headers=headers)).json()["total"] == 1


async def test_where_used_blocks_delete(db_session, http, tmp_path):
    org, headers = await _tenant(db_session)
    used = (await _upload(http, headers, _jpeg(600, 400))).json()
    spare = (await _upload(http, headers, _jpeg(600, 400))).json()
    org.logo_url = used["url"]
    org.site = {"hero": {"image_url": used["variants"][0]["url"]}}
    db_session.add(SitePage(organization_id=org.id, slug="tarihce", title="Tarihçe",
                            body=f"<img src=\"{used['url']}\">"))
    await db_session.commit()

    refs = (await http.get(f"/api/v1/admin-features/media/{used['id']}/usage", headers=headers)).json()
    fields = {(r["type"], r["field"]) for r in refs}
    assert ("organization", "logo_url") in fields and ("organization", "site") in fields
    assert ("site_pages", "body") in fields
    assert (await http.get(f"/api/v1/admin-features/media/{spare['id']}/usage", headers=headers)).json() == []

    unused = (await http.get("/api/v1/admin-features/media", params={"unused": "true"}, headers=headers)).json()
    assert [a["id"] for a in unused["items"]] == [spare["id"]]

    blocked = await http.delete(f"/api/v1/admin-features/media/{used['id']}", headers=headers)
    assert blocked.status_code == 409 and blocked.json()["detail"]["code"] == "media_in_use"
    assert (await http.delete(f"/api/v1/admin-features/media/{spare['id']}", headers=headers)).status_code == 200
    forced = await http.delete(f"/api/v1/admin-features/media/{used['id']}", params={"force": "true"}, headers=headers)
    assert forced.status_code == 200 and forced.json()["was_used"]
    assert not list((tmp_path / str(org.id)).iterdir())
    assert (await http.get("/api/v1/admin-features/media/usage", headers=headers)).json()["used_bytes"] == 0


async def test_legacy_uploads_are_registered(db_session, http, tmp_path):
    org, headers = await _tenant(db_session)
    folder = tmp_path / str(org.id)
    folder.mkdir()
    png = io.BytesIO()
    Image.new("RGBA", (64, 32), (255, 0, 0, 128)).save(png, format="PNG")
    (folder / ("a" * 24 + ".png")).write_bytes(png.getvalue())
    (folder / ("b" * 24 + ".png")).write_bytes(b"broken")
    (folder / "notes.txt").write_text("x")

    listed = (await http.get("/api/v1/admin-features/media", headers=headers)).json()
    assert listed["total"] == 1
    legacy = listed["items"][0]
    assert legacy["url"] == f"/api/v1/media/{org.id}/{'a' * 24}.png" and legacy["width"] == 64
    # Listing again does not duplicate it
    assert (await http.get("/api/v1/admin-features/media", headers=headers)).json()["total"] == 1

    # The old upload endpoint (ImageField) now lands in the library too
    old = await http.post("/api/v1/admin-features/uploads", headers=headers,
                          files={"file": ("logo.png", png.getvalue(), "image/png")})
    assert old.status_code == 201 and old.json()["url"].endswith(".webp")
    assert (await http.get("/api/v1/admin-features/media", headers=headers)).json()["total"] == 2
    assert (await db_session.get(MediaAsset, uuid.UUID(old.json()["id"]))).original_name == "logo.png"


async def test_media_requires_content_permission(db_session, http):
    _, readonly = await _tenant(db_session, role=UserRole.READONLY)
    assert (await http.get("/api/v1/admin-features/media", headers=readonly)).status_code == 200
    assert (await _upload(http, readonly, _jpeg(100, 100))).status_code == 403
    _, editor = await _tenant(db_session, role=UserRole.EDITOR)
    assert (await _upload(http, editor, _jpeg(100, 100))).status_code == 201
