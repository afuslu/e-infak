import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.api.v1 import sms as sms_api
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod
from app.models.organization import Organization
from app.models.sms_message import SmsMessage
from app.models.user import User, UserRole
from app.services import sms_service
from app.services.sms_service import (
    enqueue_sms, format_amount, process_in, render_template, segment_info, send_event_sms, unknown_variables,
)
from app.sms import SmsError, SmsResult, SmsUnreachable


def _request(org, method="POST"):
    request = Request({"type": "http", "method": method, "path": "/api/v1/admin-features/sms/x", "headers": [],
                       "query_string": b"", "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _setup(db, **donor_fields):
    slug = f"s-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Hayır Derneği", legal_name="Hayır Derneği", email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", phone="0222 233 30 30", iban="TR240021000004444444400001")
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x", first_name="Ayşe",
                 last_name="Admin", role=UserRole.STK_ADMIN)
    campaign = Campaign(organization_id=org.id, slug="gazze", title="Gazze Yemek", summary="s",
                        target_cents=1_000_000, collected_cents=0)
    donor = Donor(organization_id=org.id, first_name="Seçkin", last_name="Bozkurt", phone="0545 623 67 12",
                  **donor_fields)
    db.add_all([admin, campaign, donor])
    await db.flush()
    return org, admin, campaign, donor


@pytest.fixture
def provider(monkeypatch):
    """A configured SMS account whose sends are recorded instead of leaving the machine."""
    sent, behaviour = [], {"error": None}

    async def account(_db, _org_id):
        return {"provider": "netgsm", "username": "850", "password": "p", "sender": "DERNEK"}

    def deliver(phone, message, _account, commercial=False):
        if behaviour["error"]:
            raise behaviour["error"]
        behaviour["commercial"] = commercial
        sent.append((phone, message))
        return SmsResult("netgsm", f"job-{len(sent)}")

    import app.services.tenant_credentials as tc
    monkeypatch.setattr(tc, "sms_account", account)
    monkeypatch.setattr(sms_service, "deliver", deliver)
    return sent, behaviour


# --- Counting and templates ----------------------------------------------------------

@pytest.mark.parametrize("message,encoding,units,parts", [
    ("Merhaba", "gsm", 7, 1),
    ("a" * 160, "gsm", 160, 1),
    ("a" * 161, "gsm", 161, 2),
    ("a" * 307, "gsm", 307, 3),
    ("ÇÖÜöü", "gsm", 5, 1),            # in the basic alphabet
    ("ş", "tr", 2, 1),                 # Turkish table: two characters each
    ("a" * 153 + "ğ", "tr", 155, 1),
    ("a" * 154 + "ğ", "tr", 156, 2),
    ("€[]", "gsm", 6, 1),
    ("📞 ara", "unicode", 6, 1),       # an emoji is two UTF-16 units
    ("я" * 71, "unicode", 71, 2),
    ("", "gsm", 0, 0),
])
def test_segment_info(message, encoding, units, parts):
    info = segment_info(message)
    assert (info["encoding"], info["units"], info["parts"]) == (encoding, units, parts)


def test_templates_render_known_variables_and_keep_unknown_ones():
    body = "Değerli bağışçımız, {tutar} {para_birimi} {bagis_kalemi} bağışınız ulaşmıştır. {donor_name} {olmayan}"
    rendered = render_template(body, {"tutar": "1.000,00", "para_birimi": "TL", "ad_soyad": "Ali Veli"})
    assert rendered == "Değerli bağışçımız, 1.000,00 TL bağışınız ulaşmıştır. Ali Veli {olmayan}"
    assert unknown_variables(body) == ["olmayan"]
    assert format_amount(475_000) == "4.750,00" and format_amount(5_000) == "50,00"


def test_typographic_characters_do_not_force_unicode():
    assert segment_info(sms_service.clean_sms_text("“Merhaba” – selam…\r\n"))["encoding"] == "gsm"


# --- Queue ---------------------------------------------------------------------------

async def test_enqueue_numbers_dedupes_and_sends(db_session, provider, sms_kicks):
    sent, _ = provider
    org, _admin, _campaign, donor = await _setup(db_session)
    first = await enqueue_sms(db_session, org.id, donor.phone, "Bağışınız ulaştı", donor_id=donor.id,
                              dedupe_key="makbuz:1")
    second = await enqueue_sms(db_session, org.id, "5551112233", "İkinci")
    assert await enqueue_sms(db_session, org.id, donor.phone, "Bağışınız ulaştı", dedupe_key="makbuz:1") is None
    assert (first.seq_no, second.seq_no) == (1, 2)
    assert first.phone == "905456236712" and first.encoding == "tr" and first.status == "queued"
    await db_session.commit()
    assert sorted(sms_kicks) == sorted([str(first.id), str(second.id)])  # handed to a worker only after commit

    assert await process_in(db_session, first.id) == "sent"
    assert await process_in(db_session, first.id) == "skipped"  # never twice
    assert sent == [("905456236712", "Bağışınız ulaştı")]
    assert first.provider_ref == "job-1" and first.sent_at is not None

    with pytest.raises(SmsError):
        await enqueue_sms(db_session, org.id, "123", "kısa numara")
    with pytest.raises(SmsError):
        await enqueue_sms(db_session, org.id, donor.phone, "a" * 2000)


async def test_scheduled_message_waits_and_failures_are_recorded(db_session, provider, sms_kicks):
    sent, behaviour = provider
    org, _admin, _campaign, donor = await _setup(db_session)
    later = await enqueue_sms(db_session, org.id, donor.phone, "Yarın",
                              send_at=datetime.now(timezone.utc) + timedelta(hours=5))
    await db_session.commit()
    assert later.status == "scheduled" and str(later.id) not in sms_kicks
    assert await process_in(db_session, later.id) == "not_due" and not sent

    later.send_after = datetime.now(timezone.utc) - timedelta(seconds=1)
    behaviour["error"] = SmsUnreachable("NetGSM sunucusuna ulaşılamadı")
    assert await process_in(db_session, later.id) == "queued"  # retried later
    assert later.attempts == 1 and later.send_after > datetime.now(timezone.utc)
    for _ in range(2):
        later.send_after = datetime.now(timezone.utc) - timedelta(seconds=1)
        await process_in(db_session, later.id)
    assert later.status == "failed" and later.attempts == 3

    refused = await enqueue_sms(db_session, org.id, donor.phone, "Reddedilecek")
    behaviour["error"] = SmsError("NetGSM gönderimi reddetti (kod 40: başlık tanımlı değil)")
    assert await process_in(db_session, refused.id) == "failed"
    assert "kod 40" in refused.error and refused.attempts == 1


async def test_event_sms_follows_the_template_mode_and_is_sent_once(db_session):
    org, admin, campaign, donor = await _setup(db_session)
    donation = Donation(organization_id=org.id, campaign_id=campaign.id, donor_id=donor.id,
                        receipt_number=f"R-{uuid.uuid4().hex[:8]}", amount_cents=100_000,
                        payment_method=PaymentMethod.CREDIT_CARD, status=DonationStatus.CONFIRMED)
    db_session.add(donation)
    await db_session.flush()
    related = ("donation", donation.id)
    queued = await send_event_sms(db_session, org.id, "bagis_alindi", donor.phone, donor=donor, donation=donation,
                                  related=related)
    assert "Seçkin Bozkurt" in queued.body and "1.000,00 TL" in queued.body and "Gazze Yemek" in queued.body
    assert await send_event_sms(db_session, org.id, "bagis_alindi", donor.phone, donor=donor, donation=donation,
                                related=related) is None

    # A template switched to "manual" waits for staff
    templates = await sms_api.list_templates(_request(org, "GET"), db_session)
    makbuz = next(t for t in templates if t["event_key"] == "makbuz")
    await sms_api.update_template(_request(org), uuid.UUID(makbuz["id"]), sms_api.TemplateIn(
        name=makbuz["name"], body=makbuz["body"], event_key="makbuz", auto_mode="manual"), db_session, admin)
    assert await send_event_sms(db_session, org.id, "makbuz", donor.phone, donor=donor, donation=donation,
                                related=("donation", uuid.uuid4())) is None


async def test_text_written_on_the_receipt_replaces_the_automatic_sms(db_session):
    org, admin, campaign, donor = await _setup(db_session)
    donation = Donation(organization_id=org.id, campaign_id=campaign.id, donor_id=donor.id,
                        receipt_number=f"R-{uuid.uuid4().hex[:8]}", amount_cents=20_000, payment_provider="manual",
                        payment_method=PaymentMethod.CASH, status=DonationStatus.CONFIRMED)
    db_session.add(donation)
    await db_session.flush()
    written = await sms_service.queue_receipt_sms(db_session, donation, donor, "Elle yazılan metin", admin.id)
    assert written.related_id == donation.id
    assert sms_service.receipt_event(donation.payment_provider) == "makbuz"
    assert sms_service.receipt_event("bank:ziraatkatilim") == "havale_eslesti"
    assert await send_event_sms(db_session, org.id, "makbuz", donor.phone, donor=donor, donation=donation,
                                related=("donation", donation.id),
                                dedupe_key=sms_service.receipt_key(donation.id)) is None
    status = await sms_service.related_sms(db_session, org.id, "donation", [donation.id])
    assert status[str(donation.id)]["status"] == "queued" and status[str(donation.id)]["count"] == 1


# --- API -----------------------------------------------------------------------------

async def test_quick_send_needs_consent_or_informational_and_can_be_scheduled(db_session, sms_kicks):
    org, admin, _campaign, donor = await _setup(db_session)
    with pytest.raises(HTTPException) as exc:
        await sms_api.send_sms(_request(org), sms_api.SendIn(donor_id=donor.id, body="Kampanyamız başladı"),
                               db_session, admin)
    assert exc.value.status_code == 409

    now = await sms_api.send_sms(_request(org), sms_api.SendIn(
        donor_id=donor.id, body="Bağışınız ulaştı", informational=True), db_session, admin)
    assert now["status"] == "queued" and now["seq_no"] == 1 and now["id"] in sms_kicks

    later = await sms_api.send_sms(_request(org), sms_api.SendIn(
        donor_id=donor.id, body="Hatırlatma", informational=True,
        send_at=datetime.now(timezone.utc) + timedelta(days=2)), db_session, admin)
    assert later["status"] == "scheduled"

    listing = await sms_api.list_messages(_request(org, "GET"), db_session, status=None, source=None, q="bozkurt",
                                          donor_id=None, related_type=None, related_id=None, date_from=None,
                                          date_to=None, page=1, page_size=50)
    assert listing["total"] == 2 and listing["counts"]["scheduled"] == 1
    assert listing["items"][0]["donor_name"] == "Seçkin Bozkurt"

    cancelled = await sms_api.cancel_message(_request(org), uuid.UUID(later["id"]), db_session, admin)
    assert cancelled["status"] == "cancelled"
    again = await sms_api.retry_message(_request(org), uuid.UUID(later["id"]), db_session, admin)
    assert again["status"] == "queued" and later["id"] in sms_kicks

    other, other_admin, _c, _d = await _setup(db_session)
    with pytest.raises(HTTPException) as exc:
        await sms_api.cancel_message(_request(other), uuid.UUID(now["id"]), db_session, other_admin)
    assert exc.value.status_code == 404  # another organisation's message
    with pytest.raises(HTTPException) as exc:
        await sms_api.send_sms(_request(other), sms_api.SendIn(donor_id=donor.id, body="x y", informational=True),
                               db_session, other_admin)
    assert exc.value.status_code == 404


async def test_templates_crud_preview_and_validation(db_session):
    org, admin, _campaign, donor = await _setup(db_session, allow_sms=True)
    defaults = await sms_api.list_templates(_request(org, "GET"), db_session)
    assert {t["event_key"] for t in defaults} >= {"bagis_alindi", "makbuz", "havale_eslesti", "kurban_kesildi"}
    assert len(await sms_api.list_templates(_request(org, "GET"), db_session)) == len(defaults)  # seeded once

    with pytest.raises(HTTPException) as exc:
        await sms_api.create_template(_request(org), sms_api.TemplateIn(name="Hatalı", body="Sayın {isim}"),
                                      db_session, admin)
    assert exc.value.status_code == 422
    with pytest.raises(HTTPException) as exc:
        await sms_api.create_template(_request(org), sms_api.TemplateIn(
            name="İkinci makbuz", body="Makbuz {tutar}", event_key="makbuz"), db_session, admin)
    assert exc.value.status_code == 409

    created = await sms_api.create_template(_request(org), sms_api.TemplateIn(
        name="Vacip Kurban Hisse",
        body="Değerli bağışçımız, {tutar} {para_birimi} tutarındaki {bagis_kalemi} bağışınız ulaşmıştır."),
        db_session, admin)
    preview = await sms_api.preview_sms(
        _request(org, "GET"), uuid.UUID(created["id"]), donor_id=donor.id, donation_id=None, transfer_id=None,
        variables='{"tutar": "4.000,00", "bagis_kalemi": "VACİP KURBAN HİSSE", "olmayan": "x"}', db=db_session)
    assert preview["body"] == "Değerli bağışçımız, 4.000,00 TL tutarındaki VACİP KURBAN HİSSE bağışınız ulaşmıştır."
    assert preview["segments"]["encoding"] == "tr" and preview["allow_sms"] is True

    await sms_api.delete_template(_request(org), uuid.UUID(created["id"]), db_session, admin)
    assert created["id"] not in {t["id"] for t in await sms_api.list_templates(_request(org, "GET"), db_session)}


async def test_hakder_preset_loads_once_and_binds_events(db_session):
    from app.services.sms_presets import PRESETS, load_preset

    org, _admin, _campaign, _donor = await _setup(db_session)
    first = await load_preset(db_session, org.id, "hakder")
    again = await load_preset(db_session, org.id, "hakder")
    # "Makbuz SMS", "Bağış Ulaştı SMS" and "Banka Hesap Bilgileri" replace the built-in defaults
    assert first == {"created": 3, "updated": 3} and again == {"created": 0, "updated": len(PRESETS["hakder"])}
    templates = {t["name"]: t for t in await sms_api.list_templates(_request(org, "GET"), db_session)}
    assert templates["Makbuz SMS"]["event_key"] == "makbuz" and "hakder.org" in templates["Makbuz SMS"]["body"]
    assert templates["Bağış Ulaştı SMS"]["event_key"] == "havale_eslesti"
    assert all(t["segments"]["encoding"] != "unicode" for t in templates.values())  # no emoji: normal SMS price


# --- Bulk ----------------------------------------------------------------------------

async def test_bulk_sms_resolves_audience_personalises_and_can_be_cancelled(db_session, provider, sms_kicks):
    from datetime import datetime as dt
    from app.models.sms_batch import SmsBatch
    from app.services.sms_audience import Audience

    sent, behaviour = provider
    org, admin, campaign, donor = await _setup(db_session, allow_sms=True, tags=["vip"])
    db_session.add_all([
        Donor(organization_id=org.id, first_name="İzinsiz", last_name="Kişi", phone="05321110001", tags=["vip"]),
        Donor(organization_id=org.id, first_name="Aynı", last_name="Numara", phone="905456236712", allow_sms=True, tags=["vip"]),
        Donor(organization_id=org.id, first_name="Telefonsuz", allow_sms=True, tags=["vip"]),
        Donor(organization_id=org.id, first_name="Bozuk", phone="123", allow_sms=True, tags=["vip"]),
        Donor(organization_id=org.id, first_name="Başka", phone="05329990000", allow_sms=True, tags=["genel"]),
    ])
    await db_session.flush()

    body = "Sayın {ad_soyad}, hayırlı kandiller. {kurum}"
    plan = sms_api.BatchIn(body=body, audience=Audience(kind="tag", tag="vip"), quiet_hours=False)
    preview = await sms_api.preview_batch(_request(org), plan, db_session)
    assert preview["recipients"] == 1 and preview["stats"] == {
        "matched": 5, "no_phone": 1, "no_consent": 1, "invalid": 1, "duplicate": 1}
    assert preview["sample"]["body"] == "Sayın Seçkin Bozkurt, hayırlı kandiller. Hayır Derneği"

    # informational: donors without permission can be included; promotion never
    wide = sms_api.BatchIn(body=body, audience=Audience(kind="tag", tag="vip", include_without_consent=True), quiet_hours=False)
    assert (await sms_api.preview_batch(_request(org), wide, db_session))["recipients"] == 2
    promo = wide.model_copy(update={"commercial": True})
    assert (await sms_api.preview_batch(_request(org), promo, db_session))["recipients"] == 1

    created = await sms_api.send_batch(_request(org), promo, db_session, admin)
    assert created["total"] == 1 and created["state"] == "sending" and f"batch:{created['id']}" in sms_kicks
    message = (await db_session.execute(select_messages(created["id"]))).scalars().one()
    assert message.source == "bulk" and message.commercial and message.donor_id == donor.id
    assert await process_in(db_session, message.id) == "sent" and behaviour["commercial"] is True
    assert sent[-1] == ("905456236712", "Sayın Seçkin Bozkurt, hayırlı kandiller. Hayır Derneği")

    # a pasted list, scheduled, then cancelled
    listed = await sms_api.send_batch(_request(org), sms_api.BatchIn(
        body="Duyuru", audience=Audience(kind="numbers", numbers="0532 111 00 02\n5321110003, 5321110003;12"),
        send_at=dt.now(timezone.utc) + timedelta(days=1), quiet_hours=False), db_session, admin)
    assert listed["total"] == 2 and listed["state"] == "scheduled"
    stored = await db_session.get(SmsBatch, uuid.UUID(listed["id"]))
    assert stored.audience["numbers"] == "2 numara"
    assert (await sms_api.cancel_bulk(_request(org), stored.id, db_session, admin)) == {"cancelled": 2}
    rows = {b["id"]: b for b in await sms_api.list_batches(_request(org, "GET"), db_session, limit=30)}
    assert rows[listed["id"]]["state"] == "cancelled" and rows[created["id"]]["sent"] == 1

    with pytest.raises(HTTPException) as exc:  # nobody to send to
        await sms_api.send_batch(_request(org), sms_api.BatchIn(body="x y", audience=Audience(kind="tag", tag="yok")), db_session, admin)
    assert exc.value.status_code == 422


def select_messages(batch_id):
    from sqlalchemy import select
    return select(SmsMessage).where(SmsMessage.batch_id == uuid.UUID(batch_id))


def test_bulk_sms_waits_for_the_morning():
    from datetime import datetime as dt
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("Europe/Istanbul")
    assert sms_service.after_quiet_hours(dt(2026, 11, 13, 14, 0, tzinfo=tz)) == dt(2026, 11, 13, 14, 0, tzinfo=tz)
    assert sms_service.after_quiet_hours(dt(2026, 11, 13, 22, 30, tzinfo=tz)) == dt(2026, 11, 14, 8, 0, tzinfo=tz)
    assert sms_service.after_quiet_hours(dt(2026, 11, 13, 3, 0, tzinfo=tz)) == dt(2026, 11, 13, 8, 0, tzinfo=tz)
