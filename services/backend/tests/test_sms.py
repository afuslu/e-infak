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

async def test_quick_send_respects_opt_out_and_can_be_scheduled(db_session, sms_kicks):
    org, admin, _campaign, donor = await _setup(db_session, sms_opt_out=True)
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
                                          date_to=None, page=1, page_size=50, current_user=admin)
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
        variables='{"tutar": "4.000,00", "bagis_kalemi": "VACİP KURBAN HİSSE", "olmayan": "x"}', db=db_session,
        current_user=admin)
    assert preview["body"] == "Değerli bağışçımız, 4.000,00 TL tutarındaki VACİP KURBAN HİSSE bağışınız ulaşmıştır."
    assert preview["segments"]["encoding"] == "tr" and preview["allow_sms"] is True

    await sms_api.delete_template(_request(org), uuid.UUID(created["id"]), db_session, admin)
    assert created["id"] not in {t["id"] for t in await sms_api.list_templates(_request(org, "GET"), db_session)}


async def test_hakder_preset_loads_once_and_binds_events(db_session):
    from app.services.sms_presets import PRESETS, load_preset

    org, _admin, _campaign, _donor = await _setup(db_session)
    first = await load_preset(db_session, org.id, "hakder")
    again = await load_preset(db_session, org.id, "hakder")
    # only the two kurban texts are new; the others replace the built-in defaults of their event or name
    assert first == {"created": 2, "updated": 4} and again == {"created": 0, "updated": len(PRESETS["hakder"])}
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
        Donor(organization_id=org.id, first_name="Reddeden", phone="05321110009", allow_sms=True, sms_opt_out=True, tags=["vip"]),
        Donor(organization_id=org.id, first_name="Aynı", last_name="Numara", phone="905456236712", allow_sms=True, tags=["vip"]),
        Donor(organization_id=org.id, first_name="Telefonsuz", allow_sms=True, tags=["vip"]),
        Donor(organization_id=org.id, first_name="Bozuk", phone="123", allow_sms=True, tags=["vip"]),
        Donor(organization_id=org.id, first_name="Başka", phone="05329990000", allow_sms=True, tags=["genel"]),
    ])
    await db_session.flush()

    body = "Sayın {ad_soyad}, hayırlı kandiller. {kurum}"
    plan = sms_api.BatchIn(body=body, audience=Audience(kind="tag", tag="vip"), quiet_hours=False)
    preview = await sms_api.preview_batch(_request(org), plan, db_session)
    assert preview["recipients"] == 2 and preview["stats"] == {
        "matched": 6, "no_phone": 1, "no_consent": 1, "invalid": 1, "duplicate": 1}
    assert preview["sample"]["body"] == "Sayın Seçkin Bozkurt, hayırlı kandiller. Hayır Derneği"

    # promotion still needs explicit permission
    promo = plan.model_copy(update={"commercial": True})
    assert (await sms_api.preview_batch(_request(org), promo, db_session))["recipients"] == 1

    created = await sms_api.send_batch(_request(org), promo, db_session, admin)
    assert created["total"] == 1 and created["state"] == "sending" and f"batch:{created['id']}" in sms_kicks
    message = (await db_session.execute(select_messages(created["id"]))).scalars().one()
    assert message.source == "bulk" and message.commercial and message.donor_id == donor.id
    assert await process_in(db_session, message.id) == "sent" and behaviour["commercial"] is True
    assert sent[-1] == ("905456236712", "Sayın Seçkin Bozkurt, hayırlı kandiller. Hayır Derneği")

    # a pasted list, scheduled, then cancelled
    listed = await sms_api.send_batch(_request(org), sms_api.BatchIn(
        body="Duyuru", audience=Audience(kind="numbers", numbers="0532 111 00 02\n5321110003, 5321110003;12\n905321110009"),
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


# --- Campaign templates and reminders ------------------------------------------------

async def test_campaign_template_replaces_the_receipt_text(db_session):
    org, admin, campaign, donor = await _setup(db_session)
    await sms_api.list_templates(_request(org, "GET"), db_session)
    own = await sms_api.create_template(_request(org), sms_api.TemplateIn(
        name="Gazze Yemek", body="Değerli bağışçımız, {tutar} TL GAZZE YEMEK bağışınız ulaşmıştır.",
        campaign_id=campaign.id), db_session, admin)
    assert own["campaign_id"] == str(campaign.id)
    with pytest.raises(HTTPException) as exc:
        await sms_api.create_template(_request(org), sms_api.TemplateIn(
            name="İkinci", body="Metin {tutar}", campaign_id=campaign.id), db_session, admin)
    assert exc.value.status_code == 409
    donation = Donation(organization_id=org.id, campaign_id=campaign.id, donor_id=donor.id, payment_provider="manual",
                        receipt_number=f"R-{uuid.uuid4().hex[:8]}", amount_cents=50_000,
                        payment_method=PaymentMethod.CASH, status=DonationStatus.CONFIRMED)
    db_session.add(donation)
    await db_session.flush()
    queued = await send_event_sms(db_session, org.id, "makbuz", donor.phone, donor=donor, donation=donation,
                                  related=("donation", donation.id))
    assert queued.body == "Değerli bağışçımız, 500,00 TL GAZZE YEMEK bağışınız ulaşmıştır."


async def test_due_reminders_go_once_and_only_when_switched_on(db_session):
    from datetime import date
    from app.models.membership import Member, MemberDue
    from app.services.sms_reminders import send_due_reminders

    org, admin, _campaign, donor = await _setup(db_session)
    member = Member(organization_id=org.id, donor_id=donor.id, member_no="1")
    db_session.add(member)
    await db_session.flush()
    today = date(2026, 11, 13)
    db_session.add_all([
        MemberDue(organization_id=org.id, member_id=member.id, period="2026-11", due_date=today, amount_cents=10_000),
        MemberDue(organization_id=org.id, member_id=member.id, period="2026-10", due_date=date(2026, 10, 13), amount_cents=10_000),
        MemberDue(organization_id=org.id, member_id=member.id, period="2026-12", due_date=date(2026, 12, 13), amount_cents=10_000),
    ])
    await db_session.flush()

    async def mine():
        rows = (await db_session.execute(select_org(org.id))).scalars().all()
        return [r for r in rows if r.related_type == "member_due"]

    await send_due_reminders(db_session, today)
    assert await mine() == []  # off by default

    templates = await sms_api.list_templates(_request(org, "GET"), db_session)
    dues = next(t for t in templates if t["event_key"] == "aidat_hatirlatma")
    await sms_api.update_template(_request(org), uuid.UUID(dues["id"]), sms_api.TemplateIn(
        name=dues["name"], body=dues["body"], event_key="aidat_hatirlatma", auto_mode="auto"), db_session, admin)
    await send_due_reminders(db_session, today)
    await send_due_reminders(db_session, today)
    sent = await mine()
    assert len(sent) == 1  # only the one due today, once
    assert "2026-11" in sent[0].body and "100,00 TL" in sent[0].body and "13.11.2026" in sent[0].body


def select_org(org_id):
    from sqlalchemy import select
    return select(SmsMessage).where(SmsMessage.organization_id == org_id)


# --- Delivery reports and balance ----------------------------------------------------

class _Resp:
    def __init__(self, status_code=200, text="", data=None):
        self.status_code, self.text, self._data = status_code, text, data

    def json(self):
        if self._data is None:
            raise ValueError
        return self._data


def test_providers_read_reports_and_balance(monkeypatch):
    import app.sms as sms

    seen = []

    def fake(method, url, **kwargs):
        seen.append((method, url, kwargs))
        if url.endswith("/sms/rest/v2/report"):
            return _Resp(data={"code": "00", "jobs": [
                {"jobid": "11", "status": 1}, {"jobid": "12", "status": 0}, {"jobid": "13", "status": 3}]})
        if url.endswith("netgsm.com.tr/balance"):
            return _Resp(data={"code": "00", "balance": "1.092,150"})
        if "verimor" in url and "status" in url:
            return _Resp(data=[{"status": "NOT_ALLOWED_BY_IYS"}])
        if "verimor" in url:
            return _Resp(text="123")
        if "get-report" in url:
            return _Resp(data={"response": {"order": {"id": "5", "status": "114", "delivered": 1, "undelivered": 0}}})
        return _Resp(data={"response": {"balance": {"amount": 12.5, "sms": 250}}})

    monkeypatch.setattr(sms.requests, "request", fake)
    netgsm = sms.NetgsmProvider({"username": "850", "password": "p"})
    assert netgsm.reports(["11", "12", "13"]) == {
        "11": ("delivered", None), "13": ("failed", "İletilemedi: hatalı veya kısıtlı numara")}
    assert seen[-1][2]["json"]["jobids"] == ["11", "12", "13"] and seen[-1][2]["auth"] == ("850", "p")
    assert netgsm.balance() == {"text": "1.092,150 TL", "amount": 1092.15, "unit": "TL"}
    assert seen[-1][2]["json"] == {"usercode": "850", "password": "p", "stip": 2}  # balance takes credentials in the body
    verimor = sms.VerimorProvider({"username": "u", "password": "p"})
    assert verimor.reports(["7"]) == {"7": ("failed", "İletilemedi: NOT_ALLOWED_BY_IYS")}
    assert verimor.balance()["amount"] == 123
    ileti = sms.IletiMerkeziProvider({"api_key": "k", "api_hash": "h", "sender": "X"})
    assert ileti.reports(["5"]) == {"5": ("delivered", None)} and ileti.balance()["amount"] == 12.5


async def test_reports_mark_messages_delivered_or_failed(db_session, provider, monkeypatch):
    import app.sms as sms

    org, _admin, _campaign, donor = await _setup(db_session)
    first = await enqueue_sms(db_session, org.id, donor.phone, "Bir")
    second = await enqueue_sms(db_session, org.id, donor.phone, "İki")
    fresh = await enqueue_sms(db_session, org.id, donor.phone, "Üç")
    for message in (first, second, fresh):
        await process_in(db_session, message.id)
    for message in (first, second):
        message.sent_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    asked = []

    def reports(self, references):
        asked.append(list(references))
        return {first.provider_ref: ("delivered", None), second.provider_ref: ("failed", "İletilemedi: zaman aşımı")}

    monkeypatch.setattr(sms.NetgsmProvider, "reports", reports)
    await sms_service.collect_reports(db_session)
    mine = [refs for refs in asked if first.provider_ref in refs]
    assert len(mine) == 1 and fresh.provider_ref not in mine[0]  # just-sent messages are not asked about yet
    assert first.status == "delivered" and first.delivered_at is not None
    assert second.status == "failed" and "zaman aşımı" in second.error and fresh.status == "sent"


async def test_modern_bulk_features_csv_ab_throttle_optout_and_test_sms(db_session, provider):
    from datetime import datetime as dt
    from app.models.sms_batch import SmsBatch
    from app.services.sms_audience import Audience, resolve
    from app.services.sms_service import opt_out_token, verify_opt_out_token

    org, admin, campaign, donor = await _setup(db_session, allow_sms=True)
    # Name + phone CSV/paste parsing
    recipients, stats = await resolve(
        db_session, org.id,
        Audience(kind="numbers", numbers="telefon,ad_soyad\n0532 111 22 33, Ahmet Yılmaz\nAyşe Kaya;05334445566"),
    )
    assert len(recipients) == 2 and stats["invalid"] == 0
    assert recipients[0].name == "Ahmet Yılmaz" and recipients[0].first_name == "Ahmet"
    assert recipients[1].name == "Ayşe Kaya" and recipients[1].first_name == "Ayşe"

    # Opt-out HMAC token round-trip
    tok = opt_out_token(org.id, donor.phone, donor.id)
    assert verify_opt_out_token(tok) == (org.id, donor.phone, donor.id)
    assert verify_opt_out_token(tok + "tamper") is None

    # Test SMS endpoint does not create an SmsBatch row
    test_res = await sms_api.send_bulk_test(
        _request(org),
        sms_api.BulkTestIn(phone="05321112233", body="Merhaba {ad_soyad}, {odeme_linki}", sample_name="Ali Veli",
                           campaign_id=campaign.id),
        db_session, admin,
    )
    assert "Merhaba Ali Veli" in test_res["body"] and f"/kampanyalar/{campaign.slug}" in test_res["body"]
    assert (await db_session.execute(select_org(org.id))).scalars().all()[-1].source == "test"

    # A/B test + throttling + scheduled edit
    future = dt.now(timezone.utc) + timedelta(days=2)
    created = await sms_api.send_batch(
        _request(org),
        sms_api.BatchIn(
            name="A/B Kampanya",
            body="Metin A {odeme_linki} {ret_linki}",
            ab_variant_body="Metin B {odeme_linki} {ret_linki}",
            ab_test_percent=50,
            campaign_id=campaign.id,
            throttle_per_minute=100,
            send_at=future,
            quiet_hours=False,
            audience=Audience(kind="numbers", numbers="05321112233, Ahmet\n05334445566, Mehmet"),
        ),
        db_session, admin,
    )
    msgs = (await db_session.execute(select_messages(created["id"]))).scalars().all()
    assert {m.ab_variant for m in msgs} == {"A", "B"}
    assert all(m.track_code for m in msgs)
    assert all("/sms-iptal/" in m.body and "/s/" in m.body for m in msgs)

    # Scheduled batch edit
    await sms_api.update_scheduled_batch(
        _request(org), uuid.UUID(created["id"]),
        sms_api.BatchPatchIn(name="Güncel Ad", body="Yeni Metin {ad}", quiet_hours=False),
        db_session, admin,
    )
    stored = await db_session.get(SmsBatch, uuid.UUID(created["id"]))
    assert stored.name == "Güncel Ad" and stored.body == "Yeni Metin {ad}"


async def test_recipient_lists_feed_sms_audience_and_mail(db_session, monkeypatch):
    import uuid as _uuid
    from starlette.requests import Request as _Request
    from app.api.v1 import mailing as mailing_api
    from app.api.v1.crm import DonorFilter
    from app.models.donation import Donor
    from app.models.organization import Organization
    from app.models.user import User, UserRole
    from app.services import mailing
    from app.services.sms_audience import Audience, resolve

    slug = f"t-{_uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Hakder", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0)
    db_session.add(org)
    await db_session.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x", first_name="A", last_name="B",
                 role=UserRole.STK_ADMIN)
    a = Donor(organization_id=org.id, first_name="Ali", phone="905321112233", allow_sms=True, email="ali@example.com", allow_email=True, city="Eskişehir")
    b = Donor(organization_id=org.id, first_name="Ayşe", phone="905449998877", allow_sms=False, email="ayse@example.com", allow_email=False, city="Eskişehir")
    c = Donor(organization_id=org.id, first_name="Can", phone="905551110000", allow_sms=True, city="Ankara")
    db_session.add_all([admin, a, b, c])
    await db_session.commit()

    req = _Request({"type": "http", "method": "POST", "path": "/api/v1/admin-features/x", "headers": [], "query_string": b"", "client": ("1.2.3.4", 1)})
    req.state.organization_id = str(org.id)
    made = await mailing_api.create_list(mailing_api.ListIn(
        channel="sms", name="Eskişehir", target=mailing_api.DonorTarget(select_all=True, filters=DonorFilter(city="eskişehir"))),
        req, db_session, admin)
    assert made["member_count"] == 2 and made["added"] == 2
    again = await mailing_api.create_list(mailing_api.ListIn(channel="sms", name="x", list_id=made["id"],
                                          target=mailing_api.DonorTarget(ids=[a.id, c.id])), req, db_session, admin)
    assert again["member_count"] == 3 and again["added"] == 1

    recipients, stats = await resolve(db_session, org.id, Audience(kind="list", list_id=made["id"]))
    assert len(recipients) == 3 and stats["no_consent"] == 0

    preview = await mailing_api.send_mail(mailing_api.MailSendIn(
        subject="Merhaba {ad}", body="Selam", target=mailing_api.DonorTarget(ids=[a.id, b.id, c.id]), preview=True),
        req, db_session, admin)
    assert preview["recipients"] == 1 and preview["no_consent"] == 1 and preview["no_email"] == 1

    sent_to = []
    monkeypatch.setattr(mailing, "deliver", lambda to, subject, body, **kw: sent_to.append((to, subject)))
    monkeypatch.setattr("app.tasks.send_mail_batch_task.delay", lambda *a, **k: None)
    created = await mailing_api.send_mail(mailing_api.MailSendIn(
        subject="Merhaba {ad}", body="Selam\n\n<b>{kurum}</b>", target=mailing_api.DonorTarget(ids=[a.id, b.id])),
        req, db_session, admin)
    assert created["recipients"] == 1 and created["seq_no"] == 1

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def same_session():  # run_batch opens its own session; reuse the test one
        yield db_session

    result = await mailing.run_batch(same_session, created["batch_id"])
    assert result == {"sent": 1, "failed": 0} and sent_to == [("ali@example.com", "Merhaba Ali")]
    assert await mailing.run_batch(same_session, created["batch_id"]) == {"skipped": True}  # claimed once only
    html_body = mailing.to_html("Selam\n\n<b>Hakder</b>", org_name="Hakder", commercial=True)
    assert "&lt;b&gt;Hakder&lt;/b&gt;" in html_body and "izin verdiğiniz" in html_body


async def test_opt_out_link_covers_every_phone_format_and_stops_queued_bulk(db_session, provider, sms_kicks):
    from app.services.sms_audience import Audience, resolve
    from app.services.sms_service import opt_out_token

    sent, _behaviour = provider
    org, admin, _campaign, donor = await _setup(db_session, tags=["vip"])  # permission never asked
    db_session.add(Donor(organization_id=org.id, first_name="Kopya", phone="0 545 623 67 12", tags=["vip"]))
    await db_session.flush()
    created = await sms_api.send_batch(_request(org), sms_api.BatchIn(
        body="Duyuru", audience=Audience(kind="tag", tag="vip"), quiet_hours=False), db_session, admin)
    message = (await db_session.execute(select_messages(created["id"]))).scalars().one()

    token = opt_out_token(org.id, message.phone)
    assert (await sms_api.get_opt_out_info(token, db_session))["opted_out"] is False
    await sms_api.confirm_opt_out(token, db_session)
    assert (await sms_api.get_opt_out_info(token, db_session))["opted_out"] is True
    before = len(sent)
    assert await process_in(db_session, message.id) == "cancelled" and len(sent) == before
    for commercial in (False, True):
        recipients, stats = await resolve(db_session, org.id, Audience(kind="tag", tag="vip"), commercial=commercial)
        assert recipients == [] and stats["no_consent"] == 2
    await db_session.refresh(donor)
    with pytest.raises(HTTPException) as exc:
        await sms_api.send_sms(_request(org), sms_api.SendIn(donor_id=donor.id, body="Merhaba"), db_session, admin)
    assert exc.value.status_code == 409


async def test_portal_profile_opt_out_is_explicit(db_session):
    from app.api.v1 import donor_portal as portal

    _org, _admin, _campaign, donor = await _setup(db_session)
    update = portal.DonorProfileUpdate
    out = await portal.update_my_profile(update(city="Konya", allow_sms=False), donor, db_session)
    assert out["sms_opt_out"] is False  # an old app saving an unchanged "off" is not an opt-out
    out = await portal.update_my_profile(update(sms_opt_out=True), donor, db_session)
    assert out["sms_opt_out"] is True
    out = await portal.update_my_profile(update(sms_opt_out=False), donor, db_session)
    assert out["sms_opt_out"] is False and out["allow_sms"] is False
    await portal.update_my_profile(update(allow_sms=True), donor, db_session)
    out = await portal.update_my_profile(update(allow_sms=False), donor, db_session)
    assert out["sms_opt_out"] is True
