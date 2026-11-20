"""WhatsApp Business, NetGSM Netsantral call center, operator SMS donations and donation videos."""
import json
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

from app.core.config import settings
from app.models.campaign import Campaign
from app.models.channels import CallLog, DonationVideo, SmsDonationRecord, VideoView, WhatsAppMessage
from app.models.donation import Donation, DonationStatus, Donor
from app.models.kurban import KurbanAnimal, KurbanCampaign, KurbanShare
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services import netsantral as ns
from app.services import sms_donations as smsd
from app.services import videos as vs
from app.services import whatsapp as wa
from app.services.integrations import HOOK_SECRET, find_donor_by_phone, hook_token, phone_key, resolve_hook
from app.services.tenant_credentials import save_credentials


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch):
    monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())


async def _setup(db):
    slug = f"c-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Hayır Derneği", legal_name="Hayır Derneği", email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com")
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x", first_name="Ayşe",
                 last_name="Admin", role=UserRole.STK_ADMIN, phone_extension="101")
    campaign = Campaign(organization_id=org.id, slug="su", title="Su Kuyusu", summary="s", target_cents=1_000_000,
                        collected_cents=0)
    donor = Donor(organization_id=org.id, first_name="Seçkin", last_name="Bozkurt", phone="0545 623 67 12")
    db.add_all([admin, campaign, donor])
    await db.flush()
    return org, admin, campaign, donor


# --- shared helpers ----------------------------------------------------------------------------

def test_phone_key_ignores_prefixes():
    assert phone_key("0545 623 67 12") == phone_key("+90 545 623 6712") == phone_key("905456236712") == "5456236712"


async def test_donor_found_by_phone_and_hook_token_checked(db_session):
    org, admin, _, donor = await _setup(db_session)
    assert (await find_donor_by_phone(db_session, org.id, "905456236712")).id == donor.id
    assert await find_donor_by_phone(db_session, org.id, "05000000000") is None
    await save_credentials(db_session, org.id, "sms_donation", {HOOK_SECRET: "s3cret"}, actor="t")
    assert (await resolve_hook(db_session, "sms_donation", hook_token(org.id, "s3cret")))[0] == org.id
    assert await resolve_hook(db_session, "sms_donation", hook_token(org.id, "wrong")) is None
    assert await resolve_hook(db_session, "sms_donation", "not-a-token") is None
    assert await resolve_hook(db_session, "netsantral", hook_token(org.id, "s3cret")) is None  # other integration


# --- WhatsApp ----------------------------------------------------------------------------------

def test_whatsapp_payloads():
    p = wa.message_payload("905456236712", kind="template", template_name="kesim", language="tr",
                           params=["Seçkin", "12"])
    assert p["template"]["name"] == "kesim" and p["template"]["components"][0]["parameters"][1]["text"] == "12"
    assert wa.message_payload("90545", kind="text", text="Merhaba")["text"]["body"] == "Merhaba"
    assert wa.normalize_phone("0545 623 67 12") == "905456236712"
    assert wa.render_params(["{ad}", "Sabit"], {"ad": "Seçkin"}) == ["Seçkin", "Sabit"]


async def test_whatsapp_send_and_status_webhook(db_session):
    org, admin, _, donor = await _setup(db_session)
    creds = {"phone_number_id": "111", "access_token": "tok"}
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((str(request.url), json.loads(request.content)))
        return httpx.Response(200, json={"messages": [{"id": "wamid.ABC"}]})

    msg = WhatsAppMessage(organization_id=org.id, donor_id=donor.id, phone=donor.phone, kind="template",
                          template_name="tesekkur", language="tr", params=["Seçkin"])
    db_session.add(msg)
    await db_session.flush()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await wa.send_queued(db_session, msg, creds, client)
    assert msg.status == "sent" and msg.provider_ref == "wamid.ABC"
    assert seen[0][0].endswith("/111/messages") and seen[0][1]["to"] == "905456236712"

    body = {"entry": [{"changes": [{"value": {"statuses": [
        {"id": "wamid.ABC", "status": "delivered", "timestamp": "1700000000"},
        {"id": "wamid.ABC", "status": "read", "timestamp": "1700000100"},
        {"id": "wamid.OTHER", "status": "read", "timestamp": "1700000100"},
    ]}}]}]}
    assert await wa.apply_statuses(db_session, org.id, body) == 2
    assert msg.status == "read" and msg.delivered_at and msg.read_at
    # a late "delivered" never moves a read message back
    await wa.apply_statuses(db_session, org.id, {"entry": [{"changes": [{"value": {"statuses": [
        {"id": "wamid.ABC", "status": "delivered", "timestamp": "1700000200"}]}}]}]})
    assert msg.status == "read"


async def test_whatsapp_closed_window_error_is_explained(db_session):
    org, _, _, donor = await _setup(db_session)
    msg = WhatsAppMessage(organization_id=org.id, phone=donor.phone, kind="text", body="Merhaba")
    db_session.add(msg)
    await db_session.flush()

    def handler(request):
        return httpx.Response(400, json={"error": {"message": "Re-engagement message", "code": 131047}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        await wa.send_queued(db_session, msg, {"phone_number_id": "1", "access_token": "t"}, client)
    assert msg.status == "failed" and "24 saatlik" in msg.error


# --- Netsantral --------------------------------------------------------------------------------

def test_originate_request_follows_netgsm_doc():
    creds = {"pbx_number": "0850 302 00 00", "username": "8503020000", "password": "p"}
    params = ns.originate_params(creds, "+90 545 623 67 12", "101", "crm1")
    assert params["customer_num"] == "05456236712" and params["pbxnum"] == "8503020000"
    assert params["internal_num"] == "101" and params["originate_order"] == "if"
    assert params["trunk"] == "8503020000" and params["wait_response"] == 0


async def test_originate_errors_are_translated():
    creds = {"pbx_number": "8503020000", "username": "8503020000", "password": "p"}

    def handler(request):
        assert request.url.path == "/8503020000/originate"
        return httpx.Response(200, json={"status": "error", "message": "No registration"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ns.NetsantralError, match="santrale bağlı değil"):
            await ns.originate(creds, "05456236712", "101", "x", client)
    with pytest.raises(ns.NetsantralError, match="dahili"):
        await ns.originate(creds, "05456236712", "", "x")


async def test_call_events_build_one_call_and_cdr_adds_recording(db_session):
    org, _, _, donor = await _setup(db_session)
    ring = {"pbx_num": "101", "unique_id": "1428481992.3556", "scenario": "Inbound_call",
            "customer_num": "905456236712", "timestamp": "1763650000000"}
    call = await ns.apply_event(db_session, org.id, ring)
    assert call.status == "ringing" and call.direction == "in" and call.donor_id == donor.id and call.extension == "101"
    await ns.apply_event(db_session, org.id, {"unique_id": "1428481992.3556", "scenario": "Answer",
                                               "timestamp": "1763650005000"})
    await ns.apply_event(db_session, org.id, {"unique_id": "1428481992.3556", "scenario": "Hangup", "talktime": "64",
                                               "timestamp": "1763650070000"})
    assert call.status == "ended" and call.talk_seconds == 64 and call.answered_at
    cdr = {"bas": "2025-11-20 17:46:40", "arayan": "05456236712", "aranan": "8503020000-queue-X", "sure": 64,
           "sondurum": 1, "yon": 1, "seskaydi": "https://dosyaindir.netgsm.com.tr/upload.php?q=abc",
           "scenario": "cdr", "timestamp": "1763650080000"}
    same = await ns.apply_event(db_session, org.id, cdr)
    assert same.id == call.id and call.recording_url.endswith("q=abc")
    calls = (await db_session.execute(select(CallLog).where(CallLog.organization_id == org.id))).scalars().all()
    assert len(calls) == 1

    missed = await ns.apply_event(db_session, org.id, {"unique_id": "2", "scenario": "Inbound_call",
                                                        "customer_num": "05321112233"})
    await ns.apply_event(db_session, org.id, {"unique_id": "2", "scenario": "Hangup", "talktime": "0"})
    assert missed.status == "missed" and missed.donor_id is None


# --- SMS donations -----------------------------------------------------------------------------

def test_sms_donation_records_are_read_loosely():
    item = smsd.normalize({"MSISDN": "905456236712", "Tutar": "10,00 TL", "Mesaj": "su ahmet",
                           "İşlem No": "T-1", "Tarih": "20.11.2026 14:05", "Operatör": "Turkcell"})
    assert item["amount_cents"] == 1000 and item["keyword"] == "SU" and item["ref"] == "T-1"
    assert item["phone"] == "05456236712" and item["operator"] == "Turkcell"
    assert item["received_at"].hour == 14
    assert smsd.parse_amount("1.250,50") == 125050 and smsd.parse_amount(20) == 2000
    a = smsd.normalize({"phone": "05456236712", "keyword": "SU"}, default_amount=10)
    b = smsd.normalize({"phone": "05456236712", "keyword": "SU"}, default_amount=10)
    assert a["amount_cents"] == 1000 and a["ref"].startswith("h-")
    with pytest.raises(smsd.SmsDonationError):
        smsd.normalize({"phone": "05456236712"})


async def test_sms_donation_books_donation_once_and_queues_unmatched(db_session):
    org, admin, campaign, donor = await _setup(db_session)
    org.settings = {"sms_donation": {"keywords": {"SU": str(campaign.id)}, "create_donors": True}}
    await db_session.flush()
    rec, created = await smsd.record(db_session, org, {"msisdn": "905456236712", "amount": "10", "keyword": "SU",
                                                       "id": "R1"})
    assert created and rec.status == "recorded" and rec.donor_id == donor.id
    donation = await db_session.get(Donation, rec.donation_id)
    assert donation.amount_cents == 1000 and donation.campaign_id == campaign.id
    assert donation.status == DonationStatus.CONFIRMED and donation.payment_provider == "sms_donation"
    again, created_again = await smsd.record(db_session, org, {"msisdn": "905456236712", "amount": "10",
                                                               "keyword": "SU", "id": "R1"})
    assert not created_again and again.id == rec.id

    new, _ = await smsd.record(db_session, org, {"msisdn": "905321112233", "amount": "20", "keyword": "BILINMEYEN",
                                                 "id": "R2"})
    assert new.status == "unmatched" and new.donation_id is None
    created_donor = await db_session.get(Donor, new.donor_id)
    assert created_donor.first_name == "SMS Bağışçısı" and "sms-bagis" in created_donor.tags
    await smsd.assign(db_session, org, new, campaign.id, None)
    assert new.status == "recorded" and new.donation_id


# --- videos ------------------------------------------------------------------------------------

def test_video_tokens_and_ranges():
    vid, donor = uuid.uuid4(), uuid.uuid4()
    assert vs.parse_token(vs.token_for(vid, donor)) == (vid, donor)
    assert vs.parse_token(vs.token_for(vid)) == (vid, None)
    forged = vs.token_for(vid, donor)[:-2] + "xx"
    assert vs.parse_token(forged) is None
    assert vs.parse_range("bytes=0-99", 1000) == (0, 99)
    assert vs.parse_range("bytes=900-", 1000) == (900, 999)
    assert vs.parse_range("bytes=-100", 1000) == (900, 999)
    assert vs.parse_range("bytes=2000-", 1000) is None
    with pytest.raises(vs.VideoError):
        vs.extension_for("film.avi", "video/x-msvideo")


async def test_video_chunks_attach_to_animal_and_views_are_counted(db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_ROOT", str(tmp_path))
    monkeypatch.setattr(vs, "CHUNK_BYTES", 4)
    org, admin, campaign, donor = await _setup(db_session)
    kc = KurbanCampaign(organization_id=org.id, title="Kurban 2026", price_per_share_cents=100_000)
    db_session.add(kc)
    await db_session.flush()
    animal = KurbanAnimal(organization_id=org.id, campaign_id=kc.id, animal_number="12")
    db_session.add(animal)
    await db_session.flush()
    video = DonationVideo(organization_id=org.id, original_name="K-012.mp4", file_name="x.mp4",
                          content_type="video/mp4", size_bytes=10, kurban_animal_id=animal.id)
    db_session.add(video)
    await db_session.flush()
    video.file_name = f"{video.id}.mp4"
    video.received_bytes = vs.write_chunk(video, 0, b"0123")
    with pytest.raises(vs.VideoError):
        vs.write_chunk(video, 0, b"0123")  # out of order
    video.received_bytes = vs.write_chunk(video, 1, b"4567")
    video.received_bytes = vs.write_chunk(video, 2, b"89")
    assert vs.video_path(video).read_bytes() == b"0123456789"
    assert b"".join(vs.iter_file(vs.video_path(video), 2, 5)) == b"2345"

    from app.api.v1.videos import _attach_to_animal, _number_key
    assert _number_key("K-012.mp4") == _number_key("12") == "12"
    video.status = "ready"
    await _attach_to_animal(db_session, video, animal)
    assert animal.video_url == vs.watch_path(video.id) and animal.video_status == "recorded"
    assert (await vs.video_for_animal(db_session, animal.id)).id == video.id

    await vs.record_view(db_session, video, donor.id)
    await db_session.flush()
    await vs.record_view(db_session, video, donor.id)
    await db_session.flush()
    view = (await db_session.execute(select(VideoView).where(VideoView.video_id == video.id))).scalar_one()
    assert view.view_count == 2 and view.donor_id == donor.id


async def test_webhooks_and_video_page_over_http(db_session, tmp_path, monkeypatch):
    """Through the real app: tenant middleware lets /hooks and /media/video pass, routes do not collide."""
    from app.main import app

    monkeypatch.setattr(settings, "MEDIA_ROOT", str(tmp_path))
    org, admin, campaign, donor = await _setup(db_session)
    org.settings = {"sms_donation": {"keywords": {"SU": str(campaign.id)}}}
    await save_credentials(db_session, org.id, "netsantral", {"pbx_number": "8503020000", "username": "8503020000",
                                                              "password": "p", HOOK_SECRET: "nsec"}, actor="t")
    await save_credentials(db_session, org.id, "sms_donation", {HOOK_SECRET: "ssec"}, actor="t")
    video = DonationVideo(organization_id=org.id, original_name="v.mp4", file_name="v.mp4", content_type="video/mp4",
                          size_bytes=10, received_bytes=10, status="ready", title="Kesim videonuz")
    db_session.add(video)
    await db_session.commit()
    (tmp_path / "videos" / str(org.id)).mkdir(parents=True)
    (tmp_path / "videos" / str(org.id) / "v.mp4").write_bytes(b"0123456789")

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://e-infak.org") as http:
        r = await http.post(f"/api/v1/hooks/netsantral/{hook_token(org.id, 'nsec')}",
                            json={"unique_id": "u1", "scenario": "Inbound_call", "customer_num": "905456236712"})
        assert r.status_code == 200, r.text
        bad = await http.post(f"/api/v1/hooks/netsantral/{hook_token(org.id, 'nope')}", json={})
        assert bad.status_code == 404
        r = await http.post(f"/api/v1/hooks/sms-donation/{hook_token(org.id, 'ssec')}",
                            json={"records": [{"msisdn": "905456236712", "amount": "10", "keyword": "su", "id": "W1"},
                                              {"msisdn": "905456236712", "amount": "10", "keyword": "su", "id": "W1"}]})
        body = r.json()
        assert r.status_code == 200 and body["results"][0]["status"] == "recorded" and body["results"][1]["duplicate"]

        token = vs.token_for(video.id, donor.id)
        page = await http.get(f"/api/v1/media/video/{token}")
        assert page.status_code == 200 and "Kesim videonuz" in page.text and f"/api/v1/media/video/{token}/file" in page.text
        part = await http.get(f"/api/v1/media/video/{token}/file", headers={"Range": "bytes=2-5"})
        assert part.status_code == 206 and part.content == b"2345" and part.headers["content-range"] == "bytes 2-5/10"
        assert (await http.get(f"/api/v1/media/video/{token[:-1]}x")).status_code == 404

    await db_session.rollback()
    call = (await db_session.execute(select(CallLog).where(CallLog.organization_id == org.id))).scalar_one()
    assert call.donor_id == donor.id
    views = (await db_session.execute(select(VideoView).where(VideoView.video_id == video.id))).scalar_one()
    assert views.donor_id == donor.id and views.view_count == 1
