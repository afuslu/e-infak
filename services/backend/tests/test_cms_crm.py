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
    settings = OrgSettingsUpdate(whatsapp_number="05321112233", instagram_url="@dernegimiz", live_chat_provider="", live_chat_id="")
    assert settings.whatsapp_number == "905321112233"
    assert settings.instagram_url == "https://www.instagram.com/dernegimiz"
    assert settings.live_chat_provider is None and settings.live_chat_id is None
    assert OrgSettingsUpdate(instagram_url="https://instagram.com/ornek_dernek/").instagram_url == "https://www.instagram.com/ornek_dernek"
    with pytest.raises(ValueError):
        OrgSettingsUpdate(instagram_url="https://evil.example.com/dernegimiz")


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
    rows = await cms.admin_list_volunteers(_request(org), db=db_session, current_user=admin)
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

    abroad = await crm.list_donors(_request(org), filters=crm.DonorFilter(region="yurtdisi"), sort="recent", page=1,
                                   page_size=50, db=db_session, current_user=admin)
    assert [d["full_name"] for d in abroad["items"]] == ["Zeynep Kart"]

    updated = await crm.update_donor(
        _request(org, "PUT"), donor.id,
        crm.DonorUpdate(first_name="Zeynep", last_name="Kart", phone="905551112233", country="Almanya", assigned_user_id=admin.id),
        db_session, admin,
    )
    assert updated["assigned_user_name"] == "Ayşe Admin"
    mine = await crm.list_donors(_request(org), filters=crm.DonorFilter(assigned="me"), sort="name", page=1,
                                 page_size=50, db=db_session, current_user=admin)
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


async def test_donor_column_filters_and_bulk_actions(db_session):
    org, admin, campaign = await _setup(db_session)
    a = Donor(organization_id=org.id, first_name="Ali", last_name="Veli", phone="905321112233", external_ref="25739",
              membership_type="Erp", referral_source="Cami", total_donations=1, total_donated_cents=960_000)
    b = Donor(organization_id=org.id, first_name="Ayşe", last_name="Kaya", phone="905449998877", external_ref="9",
              membership_type="Web", total_donations=0, total_donated_cents=0)
    c = Donor(organization_id=org.id, first_name="Test", last_name="Silinecek", membership_type="Web")
    db_session.add_all([a, b, c])
    await db_session.flush()
    db_session.add(Donation(organization_id=org.id, campaign_id=campaign.id, donor_id=a.id, receipt_number=f"R-{uuid.uuid4().hex[:8]}",
                            amount_cents=960_000, currency="TRY", payment_method=PaymentMethod.BANK_TRANSFER,
                            status=DonationStatus.CONFIRMED, paid_at=datetime.now(timezone.utc)))
    await db_session.commit()

    async def listed(**filters):
        result = await crm.list_donors(_request(org), filters=crm.DonorFilter(**filters), sort="no", direction="asc",
                                       page=1, page_size=10, db=db_session, current_user=admin)
        return [d["first_name"] for d in result["items"]]

    assert await listed(no="2573") == ["Ali"]
    assert await listed(phone="0544 999") == ["Ayşe"]
    assert await listed(membership_type="Web", name="ay") == ["Ayşe"]
    assert await listed(referral_source="Cami") == ["Ali"]
    assert (await listed(membership_type="Web"))[0] == "Ayşe"  # "9" sorts before "25739", empty numbers last

    upd = await crm.bulk_donors(_request(org, "POST"), crm.DonorBulkIn(
        action="update", select_all=True, filters=crm.DonorFilter(membership_type="Web"),
        update=crm.DonorBulkUpdate(referral_source="Kermes", add_tag="2026"),
    ), db_session, admin)
    assert upd == {"selected": 2, "updated": 2}
    assert await listed(referral_source="Kermes") == ["Ayşe", "Test"]

    exported = await crm.bulk_donors(_request(org, "POST"), crm.DonorBulkIn(
        action="export", ids=[a.id], columns=["no", "full_name", "total", "membership_type"],
    ), db_session, admin)
    assert [col["label"] for col in exported["columns"]] == ["No", "Ad Soyad", "Toplam Bağış", "Üyelik Tipi"]
    assert exported["rows"] == [["25739", "Ali Veli", 9600.0, "Erp"]]

    deleted = await crm.bulk_donors(_request(org, "POST"), crm.DonorBulkIn(action="delete", ids=[a.id, c.id]), db_session, admin)
    assert deleted == {"selected": 2, "deleted": 1, "skipped": 1}  # the donor with a donation stays
    assert await listed() == ["Ayşe", "Ali"]


def test_donor_form_validates_profile_fields():
    donor = crm.DonorIn(first_name="Ali", phone="0532 111 22 33", phone2="", blood_group="AB+", gender="erkek",
                        birth_date="1990-05-01", membership_type="  ", phone2_code="49")
    assert donor.phone2 is None and donor.membership_type is None and donor.blood_group == "AB+"
    with pytest.raises(ValidationError):
        crm.DonorIn(first_name="Ali", blood_group="C+")


async def test_campaign_stk_fields_and_tabs(db_session):
    from app.api.v1 import campaign_tabs, campaigns
    from app.schemas.campaign import CampaignCreate, CampaignUpdate

    org, admin, _ = await _setup(db_session)
    req = _request(org, "POST")
    tab = await campaign_tabs.create_tab(campaign_tabs.TabIn(name="Gazze"), req, db_session, admin)
    again = await campaign_tabs.create_tab(campaign_tabs.TabIn(name="Gazze"), req, db_session, admin)
    assert tab["slug"] == "gazze" and again["slug"] == "gazze-2"

    created = await campaigns.create_campaign(req, CampaignCreate(
        title="Gazze Acil Çadır", summary="s", target_cents=1_500_000, campaign_type="project", country="Filistin",
        reference_amounts={"TRY": 1_500_000, "USD": 0, "EUR": "40000"}, fixed_amount=True, tab_id=tab["id"],
        groups=[" Acil ", ""], status="active",
    ), db_session, admin)
    assert created.campaign_type == "project" and created.reference_amounts == {"TRY": 1_500_000, "EUR": 40_000}
    assert created.groups == ["Acil"]
    assert created.allow_custom_amount is False and created.suggested_amounts_cents == [1_500_000]  # Sabit Tutar

    with pytest.raises(HTTPException):  # fixed amount needs a TL reference
        await campaigns.update_campaign(req, created.id, CampaignUpdate(reference_amounts={"USD": 5000}), db_session, admin)
    hidden = await campaigns.update_campaign(req, created.id, CampaignUpdate(show_on_site=False, campaign_type=None), db_session, admin)
    assert hidden.show_on_site is False and hidden.campaign_type == "project"

    tabs = await campaign_tabs.list_tabs(_request(org), db_session, admin)
    assert [t for t in tabs if t["id"] == tab["id"]][0]["campaign_count"] == 1
    pages = await campaign_tabs.campaign_pages(_request(org), db_session, admin)
    assert [p["slug"] for p in pages if p["title"] == "Gazze Acil Çadır"] == ["gazze-acil-cadir"]

    with pytest.raises(ValidationError):
        CampaignUpdate(redirect_mode="url", redirect_target="javascript:alert(1)")


async def test_receipt_numbers_continue_and_receipts_group_lines(db_session):
    org, admin, campaign = await _setup(db_session)
    org.settings = {**(org.settings or {}), "receipt_seq_start": 2675}
    donor = Donor(organization_id=org.id, first_name="Mehmet", last_name="Özgür", phone="905363643170", referral_source="Cami")
    db_session.add(donor)
    await db_session.commit()

    def manual(key, lines):
        return crm.ManualDonationIn(idempotency_key=key, donor_id=donor.id, payment_method="cash", send_receipt=False,
                                    lines=[crm.ReceiptLine(campaign_id=campaign.id, amount_cents=c) for c in lines])

    first = await crm.create_manual_donation(_request(org, "POST"), manual("k" * 20, [15_000_00, 1_000_00]), db_session, admin)
    second = await crm.create_manual_donation(_request(org, "POST"), manual("m" * 20, [250_00]), db_session, admin)
    assert first["receipt_seq"] == 2675 and second["receipt_seq"] == 2676

    async def receipts(**kw):
        params = dict(receipt_no=None, name=None, phone=None, start=None, end=None, created_type_filter=None,
                      min_total_cents=None, max_total_cents=None, payment_method=None, staff=None, referral=None,
                      status_filter=None, campaign_id=None, with_totals=False, sort="no_desc", page=1, page_size=25)
        params.update(kw)
        return await crm.list_receipts(_request(org), db=db_session, current_user=admin, **params)

    listed = await receipts()
    assert [(r["receipt_seq"], r["total_cents"], r["lines"]) for r in listed["items"]] == [(2676, 250_00, 1), (2675, 16_000_00, 2)]
    assert listed["items"][0]["created_type"] == "Erp - Temsilci"
    assert (await receipts(receipt_no="2675"))["total"] == 1
    assert (await receipts(min_total_cents=1_000_000))["items"][0]["receipt_seq"] == 2675
    assert (await receipts(referral="Cami", phone="0536 364"))["total"] == 2
    totals = await receipts(with_totals=True)
    assert totals["totals"] == [{"currency": "TRY", "total_cents": 16_250_00}]


async def test_presence_active_sessions_and_representatives(db_session):
    from app.api.v1 import security

    org, admin, _ = await _setup(db_session)
    db_session.add(Donor(organization_id=org.id, first_name="Ali", assigned_user_id=admin.id, total_donated_cents=5_000))
    await db_session.commit()
    await security.presence(security.PresenceIn(path="/admin/bagiscilar"), _request(org, "POST"), db_session, admin)
    live = await security.active_sessions(_request(org), True, db_session, admin)
    assert [(i["name"], i["path"], i["live"]) for i in live["items"]] == [("Ayşe Admin", "/admin/bagiscilar", True)]
    reps = await crm.representatives(_request(org), db_session, admin)
    assert [(r["name"], r["donor_count"], r["total_donated_cents"]) for r in reps] == [("Ayşe Admin", 1, 5_000)]


async def test_stk_dashboard_and_type_reports(db_session):
    from app.api.v1 import reports

    org, admin, campaign = await _setup(db_session)
    campaign.campaign_type = "kurban"
    donor = Donor(organization_id=org.id, first_name="Ali", referral_source="Cami")
    db_session.add(donor)
    await db_session.commit()
    row = await crm.create_manual_donation(_request(org, "POST"), crm.ManualDonationIn(
        idempotency_key="d" * 20, donor_id=donor.id, payment_method="cash", send_receipt=False,
        lines=[crm.ReceiptLine(campaign_id=campaign.id, amount_cents=1_000_00), crm.ReceiptLine(campaign_id=campaign.id, amount_cents=500_00)],
    ), db_session, admin)
    assert row["receipt_seq"]
    dash = await reports.stk_dashboard(_request(org), None, None, db_session, admin)
    assert dash["today_receipts"] == 1 and dash["today_cents"] == 1_500_00 and dash["donors_today"] == 1
    assert sum(d["total_cents"] for d in dash["days"]) == 1_500_00
    types = await reports.type_report(_request(org), None, None, "TRY", db_session)
    assert types["types"] == [{"label": "Kurban", "count": 2, "total_cents": 1_500_00}]
    sources = await reports.source_report(_request(org), None, None, db_session)
    assert sources["sources"] == [{"label": "Cami", "count": 1, "total_cents": 1_500_00}]
