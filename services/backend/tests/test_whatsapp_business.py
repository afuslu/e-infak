"""WhatsApp Business: event notifications with SMS fallback, inbox, consent, auto replies, bulk
consent filter, templates, links/QR and calls."""
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

from app.core.config import settings
from app.models.campaign import Campaign
from app.models.channels import WhatsAppCall, WhatsAppConversation, WhatsAppMessage
from app.models.donation import Donation, DonationStatus, Donor
from app.models.organization import Organization, OrganizationDomain
from app.models.sms_message import SmsMessage
from app.models.user import User, UserRole
from app.services import whatsapp as wa
from app.services import whatsapp_calls as calls
from app.services import whatsapp_inbox as inbox
from app.services.integrations import HOOK_SECRET, hook_token
from app.services.sms_service import send_event_sms
from app.services.tenant_credentials import save_credentials


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch):
    monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(wa, "kick_dispatch", lambda: None)


async def _setup(db, *, events=None, whatsapp=None):
    slug = f"w-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, subdomain=slug, name="Hayır Derneği", legal_name="Hayır Derneği",
                       email=f"{slug}@example.com", primary_domain=f"{slug}.example.com", plan="ileri",
                       enabled_addons=["whatsapp"], extra_user_seats=0,
                       settings={"whatsapp": {**(whatsapp or {}), "events": events or {}}})
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x", first_name="Ayşe",
                 last_name="Admin", role=UserRole.STK_ADMIN)
    campaign = Campaign(organization_id=org.id, slug="su-kuyusu", title="Su Kuyusu", summary="s",
                        target_cents=1_000_000, collected_cents=0)
    donor = Donor(organization_id=org.id, first_name="Seçkin", last_name="Bozkurt", phone="0545 623 67 12")
    db.add_all([admin, campaign, donor,
                OrganizationDomain(organization_id=org.id, domain=f"{slug}.example.org", status="active",
                                   verification_token="t", is_primary=True)])
    await db.flush()
    await save_credentials(db, org.id, "whatsapp", {"phone_number_id": "111", "access_token": "tok",
                                                    HOOK_SECRET: "wsec"}, actor="t")
    return org, admin, campaign, donor


def _donation(org, campaign, donor):
    return Donation(organization_id=org.id, campaign_id=campaign.id, donor_id=donor.id, amount_cents=25_000,
                    currency="TRY", status=DonationStatus.CONFIRMED, receipt_number=f"R-{uuid.uuid4().hex[:6]}",
                    payment_provider="paytr")


EVENT = {"bagis_alindi": {"channel": "whatsapp", "template_name": "bagis_alindi", "language": "tr",
                          "params": ["{ad_soyad}", "{tutar}", "{makbuz_no}"]}}


# --- automatic notifications --------------------------------------------------------------------

async def test_event_goes_to_whatsapp_and_sms_only_when_it_fails(db_session):
    org, _, campaign, donor = await _setup(db_session, events=EVENT)
    donation = _donation(org, campaign, donor)
    db_session.add(donation)
    await db_session.flush()

    queued = await send_event_sms(db_session, org.id, "bagis_alindi", donor.phone, donor=donor, donation=donation,
                                  related=("donation", donation.id))
    assert isinstance(queued, WhatsAppMessage)
    assert queued.template_name == "bagis_alindi" and queued.params[:2] == ["Seçkin Bozkurt", "250,00"]
    assert queued.fallback and "250,00" in queued.fallback["body"]
    sms = (await db_session.execute(select(SmsMessage).where(SmsMessage.organization_id == org.id))).scalars().all()
    assert sms == []
    # the same event again is not sent twice
    assert await send_event_sms(db_session, org.id, "bagis_alindi", donor.phone, donor=donor, donation=donation,
                                related=("donation", donation.id)) is None

    def handler(request):
        return httpx.Response(400, json={"error": {"message": "x", "code": 131026}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await wa.send_queued(db_session, queued, {"phone_number_id": "111", "access_token": "tok"}, client)
    assert queued.status == "failed" and "WhatsApp kullanmıyor" in queued.error
    sms = (await db_session.execute(select(SmsMessage).where(SmsMessage.organization_id == org.id))).scalars().all()
    assert len(sms) == 1 and "250,00" in sms[0].body and sms[0].related_id == donation.id
    # a late "failed" status from the webhook does not queue a second SMS
    await wa.run_fallback(db_session, queued)
    assert len((await db_session.execute(select(SmsMessage).where(SmsMessage.organization_id == org.id))).scalars().all()) == 1


async def test_event_channels_both_and_opted_out_donor(db_session):
    org, _, campaign, donor = await _setup(db_session, events={"bagis_alindi": {**EVENT["bagis_alindi"], "channel": "both"}})
    donation = _donation(org, campaign, donor)
    db_session.add(donation)
    await db_session.flush()
    queued = await send_event_sms(db_session, org.id, "bagis_alindi", donor.phone, donor=donor, donation=donation,
                                  related=("donation", donation.id))
    assert isinstance(queued, SmsMessage)
    assert (await db_session.execute(select(WhatsAppMessage).where(WhatsAppMessage.organization_id == org.id))).scalar_one()

    org.settings = {"whatsapp": {"events": EVENT}}
    donor.whatsapp_opt_out = True
    other = _donation(org, campaign, donor)
    db_session.add(other)
    await db_session.flush()
    queued = await send_event_sms(db_session, org.id, "bagis_alindi", donor.phone, donor=donor, donation=other,
                                  related=("donation", other.id))
    assert isinstance(queued, SmsMessage)  # WhatsApp stopped → the SMS goes instead


async def test_sms_only_organisations_are_unchanged(db_session):
    org, _, campaign, donor = await _setup(db_session)
    donation = _donation(org, campaign, donor)
    db_session.add(donation)
    await db_session.flush()
    queued = await send_event_sms(db_session, org.id, "bagis_alindi", donor.phone, donor=donor, donation=donation,
                                  related=("donation", donation.id))
    assert isinstance(queued, SmsMessage)
    assert not (await db_session.execute(select(WhatsAppMessage).where(WhatsAppMessage.organization_id == org.id))).first()


# --- inbox ---------------------------------------------------------------------------------------

def _incoming(text=None, *, sender="905456236712", ref="wamid.IN1", ts=None, **extra):
    message = {"from": sender, "id": ref, "timestamp": str(int(ts or datetime.now(timezone.utc).timestamp())),
               "type": "text", "text": {"body": text}}
    message.update(extra)
    return {"entry": [{"changes": [{"field": "messages", "value": {
        "contacts": [{"wa_id": sender, "profile": {"name": "Seçkin B."}}], "messages": [message]}}]}]}


async def test_incoming_message_builds_conversation_once(db_session):
    org, _, _, donor = await _setup(db_session)
    body = _incoming("Merhaba, «Su Kuyusu» hakkında bilgi almak istiyorum. (Kod: SU-KUYUSU)")
    created = await inbox.apply_incoming(db_session, org.id, body, {})
    assert len(created) == 1 and created[0].direction == "in" and created[0].donor_id == donor.id
    assert await inbox.apply_incoming(db_session, org.id, body, {}) == []  # Meta retry
    conv = (await db_session.execute(select(WhatsAppConversation).where(
        WhatsAppConversation.organization_id == org.id))).scalar_one()
    assert conv.phone == "905456236712" and conv.unread_count == 1 and conv.contact_name == "Seçkin B."
    assert conv.source_ref == "SU-KUYUSU" and wa.window_open(conv.last_inbound_at)

    parsed = inbox.parse_message({"type": "interactive", "interactive": {
        "type": "button_reply", "button_reply": {"id": "rule:0", "title": "Bağış yap"}}})
    assert parsed["interactive"]["id"] == "rule:0" and parsed["body"] == "Bağış yap"
    parsed = inbox.parse_message({"type": "image", "image": {"id": "M1", "mime_type": "image/jpeg", "caption": "dekont"}})
    assert parsed["media"]["id"] == "M1" and parsed["body"] == "dekont"


async def test_stop_and_start_keywords(db_session):
    org, _, _, donor = await _setup(db_session)
    await inbox.apply_incoming(db_session, org.id, _incoming("dur"), {})
    assert donor.whatsapp_opt_out is True
    conv = (await db_session.execute(select(WhatsAppConversation).where(
        WhatsAppConversation.organization_id == org.id))).scalar_one()
    assert conv.opted_out
    replies = (await db_session.execute(select(WhatsAppMessage).where(
        WhatsAppMessage.organization_id == org.id, WhatsAppMessage.direction == "out"))).scalars().all()
    assert len(replies) == 1 and "çıkarıldınız" in replies[0].body
    assert await inbox.opted_out(db_session, org.id, "0545 623 67 12")

    await inbox.apply_incoming(db_session, org.id, _incoming("Başla", ref="wamid.IN2"), {})
    assert donor.whatsapp_opt_out is False and donor.whatsapp_opt_in_at and donor.whatsapp_consent_source == "keyword"
    assert not conv.opted_out


async def test_auto_replies_rule_welcome_and_away(db_session):
    rules = [{"keywords": ["iban", "hesap numarası"], "text": "IBAN: {iban}", "buttons": []},
             {"keywords": ["bağış yapmak"], "text": "Bağış için tıklayın", "url": "https://ornek.org/bagis",
              "url_label": "Bağış yap"}]
    org, _, _, _ = await _setup(db_session, whatsapp={"auto_reply": {
        "rules": rules,
        "welcome": {"enabled": True, "text": "Hoş geldiniz", "buttons": ["Bağış yapmak", "Temsilci"]},
        "away": {"enabled": True, "text": "Mesai dışındayız", "start": "00:00", "end": "00:01", "days": ["mon"]},
    }})
    org.iban = "TR00 0000"
    await inbox.apply_incoming(db_session, org.id, _incoming("Selam"), {})
    first = (await db_session.execute(select(WhatsAppMessage).where(
        WhatsAppMessage.organization_id == org.id, WhatsAppMessage.direction == "out"))).scalar_one()
    assert first.kind == "interactive" and first.interactive["buttons"][0] == {"id": "rule:1", "title": "Bağış yapmak"}

    await inbox.apply_incoming(db_session, org.id, _incoming(None, ref="wamid.IN2", type="interactive", interactive={
        "type": "button_reply", "button_reply": {"id": "rule:1", "title": "Bağış yapmak"}}), {})
    await inbox.apply_incoming(db_session, org.id, _incoming("IBAN alabilir miyim?", ref="wamid.IN3"), {})
    conv = (await db_session.execute(select(WhatsAppConversation).where(
        WhatsAppConversation.organization_id == org.id))).scalar_one()
    conv.last_auto_reply_at -= timedelta(hours=13)  # the away note waits 12 h after any automatic answer
    await inbox.apply_incoming(db_session, org.id, _incoming("Teşekkürler", ref="wamid.IN4"), {})
    await inbox.apply_incoming(db_session, org.id, _incoming("Bir şey daha", ref="wamid.IN5"), {})
    out = (await db_session.execute(select(WhatsAppMessage).where(
        WhatsAppMessage.organization_id == org.id, WhatsAppMessage.direction == "out",
    ).order_by(WhatsAppMessage.created_at, WhatsAppMessage.id))).scalars().all()
    bodies = [m.body for m in out]
    assert "Bağış için tıklayın" in bodies and "IBAN: TR00 0000" in bodies
    cta = next(m for m in out if m.body == "Bağış için tıklayın")
    assert cta.interactive["type"] == "cta_url"
    assert bodies.count("Mesai dışındayız") == 1  # once, then quiet for 12 hours


def test_interactive_and_template_payloads():
    p = wa.message_payload("90545", kind="interactive", interactive={
        "type": "button", "body": "Seçin", "buttons": [{"id": "a", "title": "Bağış yapmak için tıklayın"}, {"title": ""}]})
    assert p["interactive"]["action"]["buttons"] == [{"type": "reply", "reply": {"id": "a", "title": "Bağış yapmak için tı"}}]
    p = wa.message_payload("90545", kind="interactive", interactive={"type": "call_permission_request"})
    assert p["interactive"] == {"type": "call_permission_request", "action": {"name": "call_permission_request"}}
    p = wa.message_payload("90545", kind="document", media={"id": "M1", "filename": "makbuz.pdf"}, text="Makbuzunuz",
                           reply_to="wamid.X")
    assert p["document"] == {"id": "M1", "caption": "Makbuzunuz", "filename": "makbuz.pdf"}
    assert p["context"] == {"message_id": "wamid.X"}
    assert wa.validate_interactive({"type": "cta_url", "body": "x", "url": "ftp://x"})
    comps = wa.template_components({"body": "Sayın {{1}}, {{2}} TL", "examples": ["Ayşe"], "footer": "Kurum",
                                    "header": {"format": "TEXT", "text": "Teşekkürler"},
                                    "buttons": [{"type": "URL", "text": "Panel", "url": "https://x.org"}]})
    assert [c["type"] for c in comps] == ["HEADER", "BODY", "FOOTER", "BUTTONS"]
    assert comps[1]["example"] == {"body_text": [["Ayşe", "örnek2"]]}
    assert inbox.fold("  İptal! ") == "IPTAL" and inbox.fold("Başla") == "BASLA"


def test_signature_and_window():
    body = b'{"a":1}'
    good = "sha256=" + hmac.new(b"s3", body, hashlib.sha256).hexdigest()
    assert wa.verify_signature("s3", body, good) and not wa.verify_signature("s3", body, "sha256=00")
    assert wa.verify_signature(None, body, None)
    now = datetime.now(timezone.utc)
    assert wa.window_open(now - timedelta(hours=23), now) and not wa.window_open(now - timedelta(hours=25), now)


def test_away_hours_cross_midnight():
    away = {"start": "22:00", "end": "06:00", "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]}
    late = datetime(2026, 11, 26, 21, 30, tzinfo=timezone.utc)  # 00:30 in Istanbul
    noon = datetime(2026, 11, 26, 9, 0, tzinfo=timezone.utc)
    assert inbox.in_hours(away, late) and not inbox.in_hours(away, noon)


# --- calls ---------------------------------------------------------------------------------------

async def test_call_webhooks(db_session):
    org, _, _, donor = await _setup(db_session)
    connect = {"entry": [{"changes": [{"field": "calls", "value": {"calls": [{
        "id": "wacid.1", "from": "905456236712", "to": "908500000000", "event": "connect",
        "timestamp": "1700000000", "direction": "USER_INITIATED", "session": {"sdp_type": "offer", "sdp": "v=0..."},
    }]}}]}]}
    ringing = await calls.apply_call_events(db_session, org.id, connect)
    assert len(ringing) == 1 and ringing[0].sdp_offer == "v=0..." and ringing[0].donor_id == donor.id
    terminate = {"entry": [{"changes": [{"field": "calls", "value": {"calls": [{
        "id": "wacid.1", "from": "905456236712", "event": "terminate", "status": "COMPLETED",
        "direction": "USER_INITIATED", "timestamp": "1700000060"}]}}]}]}
    await calls.apply_call_events(db_session, org.id, terminate)
    call = (await db_session.execute(select(WhatsAppCall).where(WhatsAppCall.organization_id == org.id))).scalar_one()
    assert call.status == "missed" and call.ended_at

    spec = calls.settings_payload({"enabled": True, "hours_enabled": True,
                                   "hours": [{"day": "MONDAY", "open": "09:00", "close": "18:00"}],
                                   "sip": {"enabled": False}})
    assert spec["calling"]["status"] == "ENABLED"
    assert spec["calling"]["call_hours"]["weekly_operating_hours"][0] == {"day_of_week": "MONDAY", "open_time": "0900",
                                                                          "close_time": "1800"}
    assert spec["calling"]["sip"] == {"status": "DISABLED"}
    back = calls.settings_from_meta(spec)
    assert back["enabled"] and back["hours"][0]["open"] == "09:00"


# --- over HTTP -----------------------------------------------------------------------------------

async def test_webhook_signature_inbox_reply_bulk_and_qr(db_session, monkeypatch):
    from app.core.db import engine
    from app.core.security import create_access_token
    from app.main import app

    await engine.dispose()  # pooled connections belong to an earlier test's event loop

    org, admin, campaign, donor = await _setup(db_session, whatsapp={"display_phone": "908501234567"})
    await save_credentials(db_session, org.id, "whatsapp", {"phone_number_id": "111", "access_token": "tok",
                                                            HOOK_SECRET: "wsec", "app_secret": "appsec"}, actor="t")
    other = Donor(organization_id=org.id, first_name="Ali", last_name="Veli", phone="05321112233",
                  whatsapp_opt_in_at=datetime.now(timezone.utc))
    db_session.add(other)
    await db_session.commit()

    sent = []

    async def fake_post(creds, payload, client=None):
        sent.append(payload)
        return wa.WhatsAppResult(ok=True, message_id=f"wamid.OUT{len(sent)}")

    monkeypatch.setattr(wa, "post_message", fake_post)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://e-infak.org") as http:
            raw = json.dumps(_incoming("Merhaba")).encode()
            url = f"/api/v1/hooks/whatsapp/{hook_token(org.id, 'wsec')}"
            assert (await http.post(url, content=raw, headers={"x-hub-signature-256": "sha256=bad"})).status_code == 401
            sig = "sha256=" + hmac.new(b"appsec", raw, hashlib.sha256).hexdigest()
            r = await http.post(url, content=raw, headers={"x-hub-signature-256": sig, "content-type": "application/json"})
            assert r.status_code == 200, r.text

            headers = {"Host": f"{org.slug}.example.org",
                       "Authorization": f"Bearer {create_access_token({'sub': str(admin.id)})}"}
            r = await http.get("/api/v1/admin-features/whatsapp/conversations", headers=headers)
            assert r.status_code == 200, r.text
            item = r.json()["items"][0]
            assert item["donor_name"] == "Seçkin Bozkurt" and item["window_open"] and item["unread_count"] == 1
            r = await http.post(f"/api/v1/admin-features/whatsapp/conversations/{item['id']}/reply",
                                json={"kind": "text", "text": "Merhaba {ad}, nasıl yardımcı olabiliriz?"}, headers=headers)
            assert r.status_code == 200, r.text
            assert sent[-1]["text"]["body"] == "Merhaba Seçkin, nasıl yardımcı olabiliriz?"
            detail = (await http.get(f"/api/v1/admin-features/whatsapp/conversations/{item['id']}", headers=headers)).json()
            assert [m["direction"] for m in detail["messages"]] == ["in", "out"] and detail["unread_count"] == 0

            r = await http.post("/api/v1/admin-features/whatsapp/bulk", headers=headers, json={
                "kind": "template", "template_name": "duyuru", "dry_run": True,
                "audience": {"kind": "numbers", "numbers": "05456236712\n05321112233"}})
            assert r.status_code == 200, r.text
            assert r.json()["recipients"] in (0, 1) and r.json()["stats"]["no_whatsapp_consent"] >= 1

            r = await http.get(f"/api/v1/admin-features/whatsapp/link?campaign_id={campaign.id}", headers=headers)
            assert r.status_code == 200, r.text
            assert r.json()["url"].startswith("https://wa.me/908501234567?text=") and r.json()["code"] == "SU-KUYUSU"
            r = await http.get(f"/api/v1/admin-features/whatsapp/qr?campaign_id={campaign.id}", headers=headers)
            assert r.status_code == 200 and r.headers["content-type"].startswith("image/svg+xml")

            r = await http.put("/api/v1/admin-features/whatsapp/events/bagis_alindi", headers=headers,
                               json={"channel": "whatsapp", "template_name": "bagis_alindi", "params": ["{ad}"]})
            assert r.status_code == 200 and r.json()["channel"] == "whatsapp"
            events = (await http.get("/api/v1/admin-features/whatsapp/events", headers=headers)).json()
            assert next(e for e in events if e["key"] == "bagis_alindi")["template_name"] == "bagis_alindi"
    finally:
        await engine.dispose()  # leave no connection bound to this test's loop
