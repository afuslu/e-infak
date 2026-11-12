import uuid

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from app.api.v1 import campaigns, cms
from app.api.v1.admin_features import OrgSettingsUpdate, update_org_settings
from app.models.campaign import Campaign, CampaignStatus
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.utils.i18n import clean_translations, localize, request_language


def _request(org=None, method="GET", query=b"", headers=None):
    request = Request({
        "type": "http", "method": method, "path": "/api/v1/x", "query_string": query,
        "headers": headers or [], "client": ("1.2.3.4", 1),
    })
    if org is not None:
        request.state.organization_id = str(org.id)
        request.state.organization = org
    return request


def test_request_language_from_query_or_header():
    assert request_language(_request(query=b"lang=en")) == "en"
    assert request_language(_request(headers=[(b"x-locale", b"ar")])) == "ar"
    assert request_language(_request(query=b"lang=tr")) is None
    assert request_language(_request(query=b"lang=../../etc")) is None


def test_clean_translations_drops_unknown_and_strips_markup():
    cleaned = clean_translations(
        {"en": {"title": "<b>Water</b>\nwell", "evil": "x", "body": "<p>One</p><p>Two</p>"}, "tr": {"title": "x"},
         "xx-yy": {"title": "bad"}, "ar": {"title": "  "}},
        fields=("title", "body"), long_fields=("body",),
    )
    assert cleaned == {"en": {"title": "Water well", "body": "One\n\nTwo"}}


def test_localize_falls_back_per_field():
    data = localize({"title": "Su", "summary": "Özet"}, {"en": {"title": "Water"}}, "en", ("title", "summary"))
    assert data == {"title": "Water", "summary": "Özet", "lang": "en"}
    assert localize({"title": "Su"}, {"en": {"title": "Water"}}, "de", ("title",))["lang"] == "tr"


def test_languages_setting_is_normalised():
    assert OrgSettingsUpdate(languages=["EN", "tr", "ar", "en"]).languages == ["tr", "en", "ar"]
    with pytest.raises(ValidationError):
        OrgSettingsUpdate(languages=["english"])


async def _org(db, plan):
    slug = f"l-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name=slug, legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan=plan, enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x", first_name="A", last_name="Y",
                 role=UserRole.STK_ADMIN)
    db.add(admin)
    await db.flush()
    return org, admin


async def test_multiple_languages_need_the_feature(db_session):
    org, admin = await _org(db_session, "baslangic")
    with pytest.raises(HTTPException) as exc:
        await update_org_settings(_request(org, "PUT"), OrgSettingsUpdate(languages=["tr", "en"]), db_session, admin)
    assert exc.value.status_code == 403
    org2, admin2 = await _org(db_session, "orta")
    saved = await update_org_settings(_request(org2, "PUT"), OrgSettingsUpdate(languages=["en"]), db_session, admin2)
    assert saved["languages"] == ["tr", "en"]


async def test_public_content_is_served_in_requested_language(db_session):
    org, admin = await _org(db_session, "orta")
    await cms.admin_create_post(_request(org, "POST"), cms.ContentPostIn(
        title="Kış yardımı", body="Türkçe metin", translations={"en": {"title": "Winter aid", "body": "English text"}},
    ), db_session, admin)
    en = await cms.public_get_post(_request(org, query=b"lang=en"), "kis-yardimi", db_session)
    assert (en["title"], en["body"], en["lang"]) == ("Winter aid", "English text", "en")
    tr = await cms.public_get_post(_request(org), "kis-yardimi", db_session)
    assert tr["title"] == "Kış yardımı" and "translations" not in tr

    await cms.admin_create_menu_item(_request(org, "POST"), cms.MenuItemIn(
        label="Hakkımızda", url="/hakkimizda", translations={"ar": {"label": "من نحن"}}), db_session, admin)
    menu = await cms.public_menu(_request(org, headers=[(b"x-locale", b"ar")]), db_session)
    assert menu["header"][0]["label"] == "من نحن"

    campaign = Campaign(organization_id=org.id, slug="su", title="Su Kuyusu", summary="Özet", target_cents=0,
                        status=CampaignStatus.ACTIVE, translations={"en": {"title": "Water Well"}})
    db_session.add(campaign)
    await db_session.flush()
    detail = await campaigns.get_campaign(_request(org, query=b"lang=en"), "su", db_session)
    assert detail.title == "Water Well" and detail.summary == "Özet"
    await db_session.refresh(campaign)
    assert campaign.title == "Su Kuyusu"  # the stored record is never modified
