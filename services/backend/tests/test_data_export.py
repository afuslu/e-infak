"""Full backup, offboarding steps, safe deletion of an organisation and the STK PRO note import."""
import json
import uuid
import zipfile
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from openpyxl import load_workbook
from sqlalchemy import func, select

from app.api.v1 import crm, data_export as api, platform
from app.core.config import settings
from app.models.audit_log import AuditLog
from app.models.data_export import DataExport, OrganizationOffboarding
from app.models.donation import Donation, Donor
from app.models.donor_note import DonorNote
from app.models.organization import Organization
from app.models.payment import PaymentAttempt, PaymentOrder, PaymentOrderItem, PaymentOrderStatus
from app.models.platform import PlatformUser
from app.models.user import Session as UserSession
from app.services import data_export as svc
from app.services.stkpro_import import StkProImporter, split_notes
from tests.test_staff_notify import _donation, _request, _setup


@pytest.fixture(autouse=True)
def media_root(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_ROOT", str(tmp_path))
    return tmp_path


async def _filled(db):
    org, admin, crm_user, campaign, donor = await _setup(db)
    donor.hashed_password = "COK-GIZLI"
    db.add(DonorNote(donor_id=donor.id, author_id=admin.id, content="=Arandı, memnun"))
    db.add(_donation(org, campaign, donor, cents=12550))
    order = PaymentOrder(organization_id=org.id, donor_id=donor.id, merchant_payment_id=uuid.uuid4().hex,
                         idempotency_key=uuid.uuid4().hex, payment_method="credit_card",
                         status=PaymentOrderStatus.FAILED, total_cents=500)
    db.add(order)
    await db.flush()
    db.add(PaymentOrderItem(order_id=order.id, campaign_id=campaign.id, unit_amount_cents=500, total_amount_cents=500))
    db.add(PaymentAttempt(order_id=order.id, session_token="TOKEN-" + uuid.uuid4().hex, safe_response={}))
    db.add(UserSession(user_id=admin.id, refresh_token="REFRESH-" + uuid.uuid4().hex,
                       expires_at=datetime.now(timezone.utc) + timedelta(days=1)))
    db.add(AuditLog(organization_id=org.id, user_id=admin.id, action="x", details={}))
    await db.commit()
    return org, admin, crm_user, campaign, donor


def test_every_table_is_exported_or_deliberately_left_out():
    covered = {t for _, members in svc.DATASETS.values() for t in members}
    assert set(svc.tables()) - covered - svc.EXCLUDED_TABLES == set()
    assert not covered & svc.EXCLUDED_TABLES
    org_id = uuid.uuid4()
    assert [t for t in covered if svc.scope(svc.tables()[t], org_id) is None] == []


@pytest.mark.asyncio
async def test_backup_holds_own_data_without_secrets(db_session, media_root):
    org, admin, _, campaign, donor = await _filled(db_session)
    other, *_ = await _filled(db_session)
    other_donor = (await db_session.execute(select(Donor).where(Donor.organization_id == other.id))).scalar_one()
    other_donor.first_name = "BASKAKURUM"
    folder = media_root / str(org.id)
    folder.mkdir()
    token = "a" * 24
    for name in (f"{token}.orig.jpg", f"{token}.webp", f"{token}-480.webp"):
        (folder / name).write_bytes(b"img")
    export = DataExport(organization_id=org.id, requested_by=admin.id, include_media=True, status="running")
    db_session.add(export)
    await db_session.commit()
    await svc.build(db_session, export)
    await db_session.commit()
    assert export.status == "ready" and export.counts["donors"] == 1 and export.counts["donor_notes"] == 1

    with zipfile.ZipFile(svc.export_path(export)) as z:
        names = z.namelist()
        assert f"gorseller/{token}.orig.jpg" in names and not any("480" in n or n.endswith(f"{token}.webp") for n in names)
        everything = b"".join(z.read(n) for n in names if n.startswith("json/")).decode()
        for secret in ("COK-GIZLI", "TOKEN-", "REFRESH-", "BASKAKURUM"):
            assert secret not in everything
        assert len(z.read("json/payment_attempts.jsonl").splitlines()) == 1
        assert json.loads(z.read("json/donor_notes.jsonl"))["content"] == "=Arandı, memnun"
        with z.open("excel/gorusme-notlari.xlsx") as fh:
            rows = list(load_workbook(fh, read_only=True).active.values)
        assert "'=Arandı, memnun" in rows[1] and "Ali Veli" in rows[1]  # no formula, readable name
        with z.open("excel/bagislar.xlsx") as fh:
            rows = list(load_workbook(fh, read_only=True)["Bağışlar"].values)
        assert 125.5 in rows[1]


@pytest.mark.asyncio
async def test_access_link_and_download_rules(db_session, monkeypatch):
    org, admin, crm_user, *_ = await _filled(db_session)
    other, other_admin, *_ = await _filled(db_session)
    with pytest.raises(HTTPException) as err:
        await api.full_access(_request(org), db=db_session, current_user=crm_user)
    assert err.value.status_code == 403
    assert (await api.full_access(_request(org), db=db_session, current_user=admin)).id == admin.id

    sent = []
    monkeypatch.setattr("app.tasks.build_data_export_task.apply_async", lambda args, **_: sent.append(args))
    made = await api.create_backup(_request(org), api.BackupIn(), db=db_session, user=admin)
    assert sent == [(made["id"],)]
    with pytest.raises(HTTPException) as err:
        await api.create_backup(_request(org), api.BackupIn(), db=db_session, user=admin)
    assert err.value.status_code == 409
    export = await db_session.get(DataExport, uuid.UUID(made["id"]))
    with pytest.raises(HTTPException):
        await api.backup_link(export.id, _request(org), db=db_session, user=admin)  # not ready yet
    await svc.build(db_session, export)
    await db_session.commit()
    with pytest.raises(HTTPException):
        await api.backup_link(export.id, _request(other), db=db_session, user=other_admin)
    url = (await api.backup_link(export.id, _request(org), db=db_session, user=admin))["url"]
    assert (await api.backup_file(url.rsplit("/", 1)[1], db=db_session)).path == svc.export_path(export)
    assert export.downloaded_at
    export.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    with pytest.raises(HTTPException):
        await api.backup_file(url.rsplit("/", 1)[1], db=db_session)
    monkeypatch.setattr(api, "is_impersonating", lambda: True)
    with pytest.raises(HTTPException) as err:
        await api.create_backup(_request(org), api.BackupIn(), db=db_session, user=admin)
    assert err.value.status_code == 403


@pytest.mark.asyncio
async def test_background_task_builds_notifies_and_cleans(db_session, monkeypatch):
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from app import tasks
    from app.models.staff_notification import StaffNotification

    async def no_push(*a, **k):
        return 0, []

    monkeypatch.setattr("app.services.push_service.push_messages", no_push)
    monkeypatch.setattr(tasks, "AsyncSessionLocal", async_sessionmaker(db_session.bind, expire_on_commit=False))
    org, admin, *_ = await _filled(db_session)
    export = DataExport(organization_id=org.id, requested_by=admin.id, include_media=False)
    db_session.add(export)
    await db_session.commit()
    assert (await tasks._build_data_export(str(export.id)))["status"] == "ready"
    assert (await tasks._build_data_export(str(export.id))) == {"skipped": True}
    await db_session.refresh(export)
    assert svc.export_path(export).is_file()
    assert (await db_session.execute(select(StaffNotification.title).where(
        StaffNotification.user_id == admin.id))).scalars().all() == ["Tam yedek hazır"]
    export.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    await db_session.commit()
    await tasks._clean_data_exports()
    await db_session.refresh(export)
    assert export.status == "expired" and not svc.export_path(export).exists()

    monkeypatch.setattr(svc.shutil, "disk_usage", lambda _: type("D", (), {"free": 0})())
    full = DataExport(organization_id=org.id, requested_by=admin.id)
    db_session.add(full)
    await db_session.commit()
    assert (await tasks._build_data_export(str(full.id)))["status"] == "failed"
    await db_session.refresh(full)
    assert "boş alan" in full.error


@pytest.mark.asyncio
async def test_leaving_then_deleting_removes_only_that_organisation(db_session, media_root, monkeypatch):
    org, admin, *_ = await _filled(db_session)
    other, *_ = await _filled(db_session)
    other_order = (await db_session.execute(select(PaymentOrder.id).where(PaymentOrder.organization_id == other.id))).scalar_one()
    (media_root / str(org.id)).mkdir()
    operator = PlatformUser(email=f"{uuid.uuid4().hex}@example.com", hashed_password="x", full_name="Op", role="admin")
    db_session.add(operator)
    await db_session.commit()
    confirm = platform.OrgDeleteIn(confirm_name=org.name)

    async def delete():
        return await platform.delete_organization(org.id, confirm, _request(org), db=db_session, operator=operator)

    async def refused(text):
        with pytest.raises(HTTPException) as err:
            await delete()
        assert err.value.status_code == 409 and text in err.value.detail

    await refused("ayrılma süreci")
    await api.request_offboarding(_request(org), api.OffboardingIn(reason="taşınıyoruz"), db=db_session, user=admin)
    today = datetime.now(svc.TZ).date()
    with pytest.raises(HTTPException):
        await platform.schedule_org_offboarding(org.id, platform.OffboardingScheduleIn(closes_on=today + timedelta(days=2)),
                                                _request(org), db=db_session, operator=operator)

    async def quiet(*a, **k):
        return 0

    monkeypatch.setattr("app.services.staff_notify.notify_system_alert", quiet)
    await platform.schedule_org_offboarding(org.id, platform.OffboardingScheduleIn(closes_on=today + timedelta(days=10)),
                                            _request(org), db=db_session, operator=operator)
    assert (await api.closing_notice(_request(org), db=db_session))["days_left"] == 10
    await refused("gelmeden")
    row = (await db_session.execute(select(OrganizationOffboarding).where(
        OrganizationOffboarding.organization_id == org.id))).scalar_one()
    row.closes_on = today
    await db_session.commit()
    await refused("yedeğini")
    with pytest.raises(HTTPException):
        await api.confirm_backup(_request(org), db=db_session, user=admin)  # nothing downloaded yet
    db_session.add(DataExport(organization_id=org.id, status="ready", downloaded_at=datetime.now(timezone.utc)))
    await db_session.commit()
    await api.confirm_backup(_request(org), db=db_session, user=admin)
    org_id = org.id
    assert (await delete())["ok"]
    assert (await db_session.execute(select(func.count(Organization.id)).where(Organization.id == org_id))).scalar_one() == 0
    assert not (media_root / str(org_id)).exists()
    assert (await db_session.execute(select(func.count(Donor.id)).where(Donor.organization_id == other.id))).scalar_one() == 1
    assert (await db_session.execute(select(func.count(Donation.id)).where(Donation.organization_id == other.id))).scalar_one() == 1
    assert (await db_session.execute(select(func.count(PaymentAttempt.id)).where(
        PaymentAttempt.order_id == other_order))).scalar_one() == 1


def test_note_cells_are_split_by_dated_lines():
    notes = split_notes("12.05.2025 14:30 - Arandı\nSonra dönecek\n\n03/06/2025: Bağış yaptı")
    assert [(w.strftime("%d%m%Y%H%M"), t) for w, t in notes] == [
        ("120520251430", "Arandı\nSonra dönecek"), ("030620250000", "Bağış yaptı")]
    assert split_notes("Düz not") == [(None, "Düz not")]
    assert split_notes(" - ") == [] and split_notes(None) == []


@pytest.mark.asyncio
async def test_stkpro_notes_import_once_and_come_back_in_the_export(db_session):
    org, admin, *_ = await _setup(db_session)
    row = {"No": "7", "Ad Soyad": "Ayşe Kaya", "Cep Telefon": "5321112233", "Açıklama": "Komşu", "Üyelik Tipi": "Gönüllü",
           "Görüşme Notları": "12.05.2025 14:30 - Arandı\n13.05.2025 09:00 - Mesaj atıldı"}
    for expected in (2, 0):
        importer = StkProImporter(db_session, org.id, actor=admin)
        await importer.import_donors([dict(row)])
        assert importer.report.notes_created == expected
    grown = StkProImporter(db_session, org.id, actor=admin)
    await grown.import_donors([{**row, "Görüşme Notları": row["Görüşme Notları"] + "\nAdres alındı"}])
    donor = (await db_session.execute(select(Donor).where(Donor.external_ref == "7", Donor.organization_id == org.id))).scalar_one()
    assert donor.notes == "Komşu" and donor.membership_type == "Gönüllü"
    notes = (await db_session.execute(select(DonorNote.content).where(DonorNote.donor_id == donor.id)
                                      .order_by(DonorNote.created_at))).scalars().all()
    assert notes == ["Arandı", "Mesaj atıldı\nAdres alındı"]
    out = await crm.bulk_donors(_request(org), crm.DonorBulkIn(action="export", ids=[donor.id], columns=["full_name", "notes", "call_notes"]),
                                db=db_session, current_user=admin)
    assert out["rows"][0][1] == "Komşu" and out["rows"][0][2].startswith("12.05.2025 14:30 - Arandı\n")
