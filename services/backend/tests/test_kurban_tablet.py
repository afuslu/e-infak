"""Kasap tableti: kart görselleri, kesim sırası, bildirimsiz kesim ve video gelince otomatik SMS."""
import uuid

from fastapi import Request

from app.api.v1 import crm, kurban, videos
from app.core.config import settings
from app.models.kurban import KurbanShare
from app.services import videos as vs
from tests.test_kurban_auto_assign import _animals, _campaign
from tests.test_orta_modules import _manual, _queued_sms, _request, _setup

PNG = b"\x89PNG\r\n\x1a\n"


def _body_request(org, data: bytes) -> Request:
    async def receive():
        return {"type": "http.request", "body": data, "more_body": False}

    request = Request({"type": "http", "method": "PUT", "path": "/api/v1/x", "headers": [], "query_string": b"",
                       "client": ("1.2.3.4", 1)}, receive)
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _slaughtered_animal(db, org, admin):
    """Üç hisseli bir hayvan, tabletten bildirimsiz kesilmiş."""
    kc_id, dc_id = await _campaign(db, org, admin)
    await crm.create_manual_donation(_request(org, "POST"), _manual(
        dc_id, 1_500_000, first_name="Hasan", phone="05321112233",
        metadata={"kurban_type": "adak", "kurban_names": ["Hasan Işık", "Fatma Şen", "Ahmet Çağ"]}), db, admin)
    animal_id = uuid.UUID((await _animals(db, org, admin, kc_id))[0]["id"])
    res = await kurban.slaughter_animals(_request(org, "POST"), kurban.SlaughterRequest(
        items=[kurban.SlaughterItem(animal_id=animal_id)], notify=False), db, admin)
    assert res == {"marked": 1, "sms_queued": 0, "sms_failed": 0}
    return kc_id, animal_id


async def _upload(db, org, admin, animal_id, data: bytes = b"0123456789") -> dict:
    started = await videos.start_upload(videos.UploadIn(filename="K-001.mp4", size=len(data), content_type="video/mp4",
                                                        kurban_animal_id=animal_id), _request(org, "POST"), db, admin)
    result = {}
    for index in range(0, -(-len(data) // vs.CHUNK_BYTES)):
        part = data[index * vs.CHUNK_BYTES:(index + 1) * vs.CHUNK_BYTES]
        result = await videos.upload_chunk(uuid.UUID(started["id"]), _body_request(org, part), index, db, admin)
    return {**result, "id": started["id"]}


async def test_card_pngs_and_queue(db_session):
    org, admin = await _setup(db_session)
    kc_id, dc_id = await _campaign(db_session, org, admin)
    await crm.create_manual_donation(_request(org, "POST"), _manual(
        dc_id, 3_500_000, first_name="Hasan", phone="05321112233",
        metadata={"kurban_type": "vacip", "kurban_names": ["İsmail", "Şükrü", "Gülşen", "Ayşe", "Ümit", "Çağrı", "Işıl"]}),
        db_session, admin)
    queue = await kurban.slaughter_queue(_request(org), kc_id, db_session, admin)
    assert [a["animal_number"] for a in queue["waiting"]] == ["AF-001"] and queue["slaughtered"] == []
    assert queue["auto_notify_video"] is True
    animal = queue["waiting"][0]
    assert len(animal["shares"]) == 7

    png = await kurban.animal_card_png(_request(org), uuid.UUID(animal["id"]), db_session, admin)
    assert png.media_type == "image/png" and png.body.startswith(PNG)
    share_png = await kurban.share_card_png(_request(org), uuid.UUID(animal["shares"][0]["id"]), db_session, admin)
    assert share_png.body.startswith(PNG)

    await kurban.slaughter_animals(_request(org, "POST"), kurban.SlaughterRequest(
        items=[kurban.SlaughterItem(animal_id=uuid.UUID(animal["id"]))], notify=False), db_session, admin)
    queue = await kurban.slaughter_queue(_request(org), kc_id, db_session, admin)
    assert queue["waiting"] == [] and [a["animal_number"] for a in queue["slaughtered"]] == ["AF-001"]


async def test_tablet_slaughter_sends_sms_once_video_is_uploaded(db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_ROOT", str(tmp_path))
    monkeypatch.setattr(vs, "CHUNK_BYTES", 4)
    org, admin = await _setup(db_session)
    _, animal_id = await _slaughtered_animal(db_session, org, admin)
    assert await _queued_sms(db_session, org) == []
    shares = (await db_session.execute(KurbanShare.__table__.select().where(KurbanShare.animal_id == animal_id))).all()
    assert shares and all(s.notified_at is None for s in shares)

    first = await _upload(db_session, org, admin, animal_id)
    assert first["status"] == "ready"
    sms = await _queued_sms(db_session, org)
    assert len(sms) == 1  # aynı telefona tek SMS
    assert "/api/v1/media/video/" in sms[0].body and "{" not in sms[0].body
    animal = await kurban._animal(db_session, org.id, animal_id)
    assert animal.video_status == "sent"

    await _upload(db_session, org, admin, animal_id)  # yeniden çekim: tekrar SMS gitmez
    assert len(await _queued_sms(db_session, org)) == 1

    # Kişiye özel izleme sayfasında bağışçının isim kartı görünür.
    parsed = sms[0].body.split("/api/v1/media/video/")[1].split()[0]
    page = await videos.watch(parsed, db_session)
    assert f"/api/v1/media/video/{parsed}/card.png" in page.body.decode()
    card = await videos.watch_card(parsed, db_session)
    assert card.body.startswith(PNG)


async def test_auto_notify_can_be_switched_off(db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_ROOT", str(tmp_path))
    monkeypatch.setattr(vs, "CHUNK_BYTES", 4)
    org, admin = await _setup(db_session)
    saved = await kurban.save_settings(kurban.KurbanSettingsIn(auto_notify_video=False), _request(org, "PUT"), db_session)
    assert saved == {"auto_notify_video": False}
    _, animal_id = await _slaughtered_animal(db_session, org, admin)
    await _upload(db_session, org, admin, animal_id)
    assert await _queued_sms(db_session, org) == []
    assert (await kurban._animal(db_session, org.id, animal_id)).video_status == "recorded"


async def test_normal_slaughter_still_notifies_immediately(db_session, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_ROOT", str(tmp_path))
    monkeypatch.setattr(vs, "CHUNK_BYTES", 4)
    org, admin = await _setup(db_session)
    kc_id, dc_id = await _campaign(db_session, org, admin)
    await crm.create_manual_donation(_request(org, "POST"), _manual(dc_id, 500_000, phone="05321112233"), db_session, admin)
    animal_id = uuid.UUID((await _animals(db_session, org, admin, kc_id))[0]["id"])
    res = await kurban.slaughter_animals(_request(org, "POST"), kurban.SlaughterRequest(
        items=[kurban.SlaughterItem(animal_id=animal_id)]), db_session, admin)
    assert res["sms_queued"] == 1
    await _upload(db_session, org, admin, animal_id)
    assert len(await _queued_sms(db_session, org)) == 1
    # Zaten bildirilmişti: durum "sent"e çekilmez, personel videoyu ayrıca gönderebilir.
    assert (await kurban._animal(db_session, org.id, animal_id)).video_status == "recorded"
