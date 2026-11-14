import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from app.api.deps import Permission, ROLE_PERMISSIONS, require_admin_route_feature, require_admin_route_permission
from app.api.v1 import cms, crm
from app.api.v1.admin_features import OrgSettingsUpdate
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.schemas.checkout import CheckoutItem
from app.utils.cms import normalize_whatsapp, parse_video_url, slugify, validate_link, validate_tawk_id
from app.utils.content import sanitize_long_text


def _request(org, method="GET", path="/api/v1/admin-features/x"):
    request = Request({"type": "http", "method": method, "path": path, "headers": [], "query_string": b"", "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


# --- Pure validators ---------------------------------------------------------------

def test_slugify_handles_turkish():
    assert slugify("Şehitler İçin Çeşme Ağacı Ödülü!") == "sehitler-icin-cesme-agaci-odulu"


@pytest.mark.parametrize("url,expected", [
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1", ("youtube", "dQw4w9WgXcQ")),
    ("https://youtu.be/dQw4w9WgXcQ", ("youtube", "dQw4w9WgXcQ")),
    ("https://youtube.com/shorts/dQw4w9WgXcQ", ("youtube", "dQw4w9WgXcQ")),
    ("https://vimeo.com/123456789", ("vimeo", "123456789")),
])
def test_video_urls_are_normalised(url, expected):
    assert parse_video_url(url) == expected


@pytest.mark.parametrize("url", [
    "javascript:alert(1)", "https://evil.example/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=<script>",
])
def test_unsafe_video_urls_are_rejected(url):
    with pytest.raises(ValueError):
        parse_video_url(url)


@pytest.mark.parametrize("link", ["javascript:alert(1)", "//evil.example", "data:text/html,x", "ftp://x"])
def test_menu_links_reject_dangerous_schemes(link):
    with pytest.raises(ValueError):
        validate_link(link)


def test_menu_links_accept_internal_and_https():
    assert validate_link("/sayfa/tarihce") == "/sayfa/tarihce"
    assert validate_link("https://example.com/x") == "https://example.com/x"


def test_whatsapp_and_tawk_normalisation():
    assert normalize_whatsapp("0 (532) 111 22 33") == "905321112233"
    assert validate_tawk_id("https://embed.tawk.to/64b1f0c0cc26a871b0281234/1h5abcdef") == "64b1f0c0cc26a871b0281234/1h5abcdef"
    with pytest.raises(ValueError):
        validate_tawk_id("x');alert(1);//")
    settings = OrgSettingsUpdate(whatsapp_number="05321112233", live_chat_provider="", live_chat_id="")
    assert settings.whatsapp_number == "905321112233"
    assert settings.live_chat_provider is None and settings.live_chat_id is None


def test_long_text_keeps_paragraphs_and_strips_markup():
    text = sanitize_long_text("<p>Bir</p><p>İki <script>alert(1)</script><b>kalın</b></p>\n\n\n\nÜç")
    assert text == "Bir\n\nİki kalın\n\nÜç"


def test_gift_name_is_cleaned():
    item = CheckoutItem(campaign_id=uuid.uuid4(), unit_amount_cents=1000, on_behalf_of="  <b>Annem</b>\nFatma  ")
    assert item.on_behalf_of == "Annem Fatma"
    assert CheckoutItem(campaign_id=uuid.uuid4(), unit_amount_cents=1000, on_behalf_of="  ").on_behalf_of is None


async def test_new_routes_map_to_permissions_and_features():
    editor = User(role=UserRole.EDITOR)
    accountant = User(role=UserRole.MUHASEBE)
    for path in ("/api/v1/admin-features/pages", "/api/v1/admin-features/menu/order", "/api/v1/admin-features/gallery"):
        assert await require_admin_route_permission(Request({"type": "http", "method": "POST", "path": path, "headers": []}), editor)
    manual = Request({"type": "http", "method": "POST", "path": "/api/v1/admin-features/donations/manual", "headers": []})
    assert await require_admin_route_permission(manual, accountant)
    with pytest.raises(HTTPException):
        await require_admin_route_permission(manual, editor)
    assert Permission.DONOR_MANAGE in ROLE_PERMISSIONS[UserRole.CRM]


# --- Database-backed ---------------------------------------------------------------

async def _setup(db):
    slug = f"t-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name=slug, legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="baslangic", enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x",
                 first_name="Ayşe", last_name="Admin", role=UserRole.STK_ADMIN)
    campaign = Campaign(organization_id=org.id, slug="genel", title="Genel Bağış", summary="s",
                        target_cents=1_000_000, collected_cents=0)
    db.add_all([admin, campaign])
    await db.flush()
    return org, admin, campaign


async def test_post_and_page_slugs_are_unique_and_public_hides_drafts(db_session):
    org, admin, _ = await _setup(db_session)
    payload = cms.ContentPostIn(title="Kış Yardımı Başladı", body="<p>Bir</p><p>İki</p>",
                                video_url="https://youtu.be/dQw4w9WgXcQ")
    first = await cms.admin_create_post(_request(org, "POST"), payload, db_session, admin)
    second = await cms.admin_create_post(_request(org, "POST"), payload, db_session, admin)
    assert first["slug"] == "kis-yardimi-basladi"
    assert second["slug"] == "kis-yardimi-basladi-2"
    assert first["video_embed_url"] == "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    with pytest.raises(HTTPException) as exc:
        await cms.admin_create_post(_request(org, "POST"), payload.model_copy(update={"slug": "kis-yardimi-basladi"}), db_session, admin)
    assert exc.value.status_code == 409

    public = await cms.public_get_post(_request(org), "kis-yardimi-basladi", db_session)
    assert public["body"] == "Bir\n\nİki"
    listed = await cms.public_list_posts(_request(org), None, 50, 0, db_session)
    assert all("body" not in p for p in listed)

    draft = await cms.admin_create_page(_request(org, "POST"), cms.PageIn(title="Tarihçe", body="x"), db_session, admin)
    with pytest.raises(HTTPException):
        await cms.public_get_page(_request(org), draft["slug"], db_session)
    await cms.admin_update_page(_request(org, "PUT"), uuid.UUID(draft["id"]),
                                cms.PageIn(title="Tarihçe", body="x", is_published=True), db_session, admin)
    assert (await cms.public_get_page(_request(org), "tarihce", db_session))["title"] == "Tarihçe"


async def test_menu_and_gallery(db_session):
    org, admin, _ = await _setup(db_session)
    a = await cms.admin_create_menu_item(_request(org, "POST"), cms.MenuItemIn(label="Hakkımızda", url="/hakkimizda"), db_session, admin)
    b = await cms.admin_create_menu_item(_request(org, "POST"), cms.MenuItemIn(label="Blog", url="/haberler?tur=blog"), db_session, admin)
    await cms.admin_create_menu_item(_request(org, "POST"), cms.MenuItemIn(location="footer", label="KVKK", url="/kvkk"), db_session, admin)
    await cms.admin_reorder_menu(_request(org, "PUT"), cms.MenuOrder(ids=[uuid.UUID(b["id"]), uuid.UUID(a["id"])]), db_session, admin)
    menu = await cms.public_menu(_request(org), db_session)
    assert [m["label"] for m in menu["header"]] == ["Blog", "Hakkımızda"]
    assert [m["label"] for m in menu["footer"]] == ["KVKK"]

    with pytest.raises(ValidationError):
        cms.GalleryItemIn(kind="video", title="x", video_url="https://evil.example/v")
    video = await cms.admin_create_gallery_item(
        _request(org, "POST"), cms.GalleryItemIn(kind="video", title="Tanıtım", video_url="https://vimeo.com/123456789"),
        db_session, admin,
    )
    assert video["video_embed_url"] == "https://player.vimeo.com/video/123456789"
    photos = await cms.public_gallery(_request(org), "photo", None, db_session)
    assert photos == []


async def test_volunteer_application_requires_consent_and_honeypot_is_dropped(db_session):
    org, admin, _ = await _setup(db_session)
    with pytest.raises(ValidationError):
        cms.VolunteerApplicationIn(full_name="Ali Veli", phone="05321112233", kvkk_accepted=False)
    base = dict(full_name="Ali Veli", phone="05321112233", kvkk_accepted=True, areas=["Kumanya", "<b>Eğitim</b>"])
    await cms.public_create_volunteer_application(_request(org, "POST"), cms.VolunteerApplicationIn(**base), db_session, None)
    await cms.public_create_volunteer_application(
        _request(org, "POST"), cms.VolunteerApplicationIn(**base, website="spam.example"), db_session, None)
    rows = await cms.admin_list_volunteers(_request(org), None, None, db_session, admin)
    assert len(rows) == 1
    assert rows[0]["areas"] == ["Kumanya", "Eğitim"]
    updated = await cms.admin_update_volunteer(_request(org, "PUT"), uuid.UUID(rows[0]["id"]),
                                               cms.VolunteerUpdate(status="contacted", staff_notes="Arandı"), db_session, admin)
    assert updated["status"] == "contacted"


async def test_manual_receipt_flow_updates_totals_and_can_be_cancelled(db_session):
    org, admin, campaign = await _setup(db_session)
    payload = crm.ManualDonationIn(
        idempotency_key=uuid.uuid4().hex, donor=crm.ManualDonor(first_name="Hasan", last_name="Elden", phone="0532 111 22 33"),
        campaign_id=campaign.id, amount_cents=150_000, payment_method="cash", on_behalf_of="Rahmetli babam",
    )
    row = await crm.create_manual_donation(_request(org, "POST"), payload, db_session, admin)
    again = await crm.create_manual_donation(_request(org, "POST"), payload, db_session, admin)
    assert again["id"] == row["id"]  # idempotent
    assert row["is_manual"] and row["issued_by_name"] == "Ayşe Admin"
    assert row["on_behalf_of"] == "Rahmetli babam"
    await db_session.refresh(campaign)
    assert campaign.collected_cents == 150_000

    # Same phone matches the existing donor instead of creating a duplicate
    second = await crm.create_manual_donation(
        _request(org, "POST"),
        payload.model_copy(update={"idempotency_key": uuid.uuid4().hex, "amount_cents": 50_000}),
        db_session, admin,
    )
    card = await crm.get_donor_card(_request(org), uuid.UUID((await crm.search_donations(
        _request(org), q=second["receipt_number"], db=db_session, current_user=admin,
        **_search_defaults()))["items"][0]["donor_id"]), db_session, admin)
    assert card["total_donations"] == 2
    assert card["total_donated_cents"] == 200_000
    assert len(card["donations"]) == 2

    cancelled = await crm.cancel_manual_donation(_request(org, "POST"), uuid.UUID(row["id"]), crm.CancelIn(reason="Mükerrer giriş"), db_session, admin)
    assert cancelled["status"] == "cancelled"
    await db_session.refresh(campaign)
    assert campaign.collected_cents == 50_000
    with pytest.raises(HTTPException):
        await crm.cancel_manual_donation(_request(org, "POST"), uuid.UUID(row["id"]), crm.CancelIn(reason="tekrar"), db_session, admin)


def _search_defaults(**overrides):
    params = dict(start=None, end=None, campaign_id=None, status_filter=None, payment_method=None, currency=None,
                  min_amount_cents=None, max_amount_cents=None, issued_by=None, assigned=None, on_behalf=None,
                  page=1, page_size=50)
    params.update(overrides)
    return params


async def test_online_donations_cannot_be_cancelled_and_filters_work(db_session):
    org, admin, campaign = await _setup(db_session)
    donor = Donor(organization_id=org.id, first_name="Zeynep", last_name="Kart", phone="905551112233", country="Almanya",
                  total_donations=1, total_donated_cents=9_000)
    db_session.add(donor)
    await db_session.flush()
    online = Donation(organization_id=org.id, campaign_id=campaign.id, donor_id=donor.id, receipt_number=f"R-{uuid.uuid4().hex[:8]}",
                      amount_cents=9_000, currency="TRY", payment_method=PaymentMethod.CREDIT_CARD, status=DonationStatus.CONFIRMED,
                      payment_provider="ziraatpay", paid_at=datetime.now(timezone.utc) - timedelta(days=3))
    db_session.add(online)
    await db_session.commit()
    with pytest.raises(HTTPException) as exc:
        await crm.cancel_manual_donation(_request(org, "POST"), online.id, crm.CancelIn(reason="deneme"), db_session, admin)
    assert exc.value.status_code == 409

    result = await crm.search_donations(_request(org), q="zeynep", db=db_session, current_user=admin,
                                        **_search_defaults(payment_method=PaymentMethod.CREDIT_CARD, issued_by="online",
                                                           min_amount_cents=5_000))
    assert result["total"] == 1 and result["totals"][0]["total_cents"] == 9_000
    none = await crm.search_donations(_request(org), q=None, db=db_session, current_user=admin,
                                      **_search_defaults(issued_by="manual"))
    assert none["total"] == 0

    abroad = await crm.list_donors(_request(org), q=None, assigned=None, region="yurtdisi", donor_type=None,
                                   has_donation=None, sort="recent", page=1, page_size=50, db=db_session, current_user=admin)
    assert [d["full_name"] for d in abroad["items"]] == ["Zeynep Kart"]

    updated = await crm.update_donor(
        _request(org, "PUT"), donor.id,
        crm.DonorUpdate(first_name="Zeynep", last_name="Kart", phone="905551112233", country="Almanya", assigned_user_id=admin.id),
        db_session, admin,
    )
    assert updated["assigned_user_name"] == "Ayşe Admin"
    mine = await crm.list_donors(_request(org), q=None, assigned="me", region=None, donor_type=None,
                                 has_donation=None, sort="name", page=1, page_size=50, db=db_session, current_user=admin)
    assert mine["total"] == 1

    with pytest.raises(HTTPException) as exc:
        await crm.send_donor_sms(_request(org, "POST"), donor.id, crm.DonorSms(message="Merhaba"), db_session, admin)
    assert exc.value.status_code == 409  # no SMS consent


async def test_cms_routes_are_gated_by_website_feature():
    org = Organization(plan="baslangic", enabled_addons=[], extra_user_seats=0)
    org.id = uuid.uuid4()
    await require_admin_route_feature(_request(org, path="/api/v1/admin-features/pages"))
    await require_admin_route_feature(_request(org, path="/api/v1/admin-features/donors/x"))


async def test_receipt_with_several_items_pending_then_paid_and_cancelled_as_one(db_session):
    from app.models.donation import Donation, DonationStatus
    org, admin, campaign = await _setup(db_session)
    second_campaign = Campaign(organization_id=org.id, slug="kurban", title="Kurban", summary="s",
                               target_cents=1_000_000, collected_cents=0)
    db_session.add(second_campaign)
    await db_session.flush()
    payload = crm.ManualDonationIn(
        idempotency_key=uuid.uuid4().hex, donor=crm.ManualDonor(first_name="Hızır", last_name="Peçe", phone="0544 854 41 12"),
        lines=[crm.ReceiptLine(campaign_id=campaign.id, amount_cents=60_000, on_behalf_of="Annem"),
               crm.ReceiptLine(campaign_id=second_campaign.id, amount_cents=40_000)],
        payment_method="bank_transfer", paid_on=datetime.now(crm.TZ).date(), paid_time="14:20", status="pending",
    )
    row = await crm.create_manual_donation(_request(org, "POST"), payload, db_session, admin)
    assert row["total_cents"] == 100_000 and len(row["receipt_numbers"]) == 2
    assert row["status"] == "pending" and row["receipt_group"]
    paid_at = datetime.fromisoformat(str(row["paid_at"])) if not isinstance(row["paid_at"], datetime) else row["paid_at"]
    assert paid_at.astimezone(crm.TZ).strftime("%H:%M") == "14:20"
    await db_session.refresh(campaign)
    assert campaign.collected_cents == 0  # pending: not counted yet

    paid = await crm.mark_manual_donation_paid(_request(org, "POST"), uuid.UUID(row["id"]), db_session, admin)
    assert paid == {"status": "confirmed", "lines": 2}
    await db_session.refresh(campaign)
    await db_session.refresh(second_campaign)
    assert (campaign.collected_cents, second_campaign.collected_cents) == (60_000, 40_000)

    await crm.cancel_manual_donation(_request(org, "POST"), uuid.UUID(row["id"]), crm.CancelIn(reason="Yanlış kayıt"), db_session, admin)
    group = (await db_session.execute(select_group(row["receipt_group"], org.id))).scalars().all()
    assert len(group) == 2 and all(d.status == DonationStatus.CANCELLED for d in group)
    await db_session.refresh(campaign)
    assert campaign.collected_cents == 0

    with pytest.raises(ValidationError):  # no item at all
        crm.ManualDonationIn(idempotency_key=uuid.uuid4().hex, donor=crm.ManualDonor(first_name="A"))


def select_group(group, org_id):
    from sqlalchemy import select
    from app.models.donation import Donation
    return select(Donation).where(Donation.organization_id == org_id, Donation.payment_details["receipt_group"].astext == group)
