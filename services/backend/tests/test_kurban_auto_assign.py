"""Kurban: kayıtta numara, toplu giriş, isim kartı, kesim/video takibi."""
import asyncio
import re
import uuid
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.v1 import crm, kurban
from app.models.donation import Donation
from app.models.kurban import KurbanAnimal, KurbanCampaign, KurbanShare
from app.models.user import UserRole
from app.services import kurban_placement
from tests.conftest import TEST_DATABASE_URL
from tests.test_orta_modules import _manual, _queued_sms, _request, _setup


async def _campaign(db, org, admin, **extra):
    base = dict(title=f"Kurban {uuid.uuid4().hex[:6]}", price_per_share_cents=500_000, country="Afrika",
                season_year=2026, animal_prefix="AF", create_donation_campaign=True)
    created = await kurban.create_campaign(_request(org, "POST"), kurban.KurbanCampaignIn(**{**base, **extra}), db, admin)
    return uuid.UUID(created["id"]), uuid.UUID(created["donation_campaign_id"])


async def _animals(db, org, admin, kc_id, **filters):
    return await kurban.list_animals(_request(org), kc_id, filters.get("status"), filters.get("q"), db, admin,
                                     filters.get("has_free"), filters.get("video_status"))


def _pages(pdf: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page[^s]", pdf))


async def test_receipt_gets_kurban_number_on_save_and_eighth_share_opens_second_animal(db_session):
    org, admin = await _setup(db_session)
    kc_id, dc_id = await _campaign(db_session, org, admin)

    first = await crm.create_manual_donation(_request(org, "POST"), _manual(
        dc_id, 1_500_000, first_name="Hasan", phone="05321112233",
        metadata={"kurban_type": "adak", "kurban_names": ["Hasan", "Fatma", "Ahmet"]}), db_session, admin)
    assert [(s["animal_number"], s["share_number"]) for s in first["kurban_shares"]] == [("AF-001", 1), ("AF-001", 2), ("AF-001", 3)]

    second = await crm.create_manual_donation(_request(org, "POST"), _manual(dc_id, 2_000_000, first_name="Zeynep"), db_session, admin)
    assert {s["animal_number"] for s in second["kurban_shares"]} == {"AF-001"}
    # 8th share: AF-001 is full (7), a second animal is opened
    third = await crm.create_manual_donation(_request(org, "POST"), _manual(dc_id, 500_000, first_name="Ali"), db_session, admin)
    assert [(s["animal_number"], s["share_number"]) for s in third["kurban_shares"]] == [("AF-002", 1)]

    assert (await kurban.distribute_shares(_request(org, "POST"), kc_id, db_session, admin)) == {"assigned": 0, "new_animals": 0}
    animals = await _animals(db_session, org, admin, kc_id)
    assert [(a["animal_number"], len(a["shares"])) for a in animals] == [("AF-001", 7), ("AF-002", 1)]
    assert [a["animal_number"] for a in await _animals(db_session, org, admin, kc_id, has_free=True)] == ["AF-002"]
    assert [a["animal_number"] for a in await _animals(db_session, org, admin, kc_id, has_free=False)] == ["AF-001"]


async def test_auto_assign_off_keeps_shares_unassigned_until_distribute(db_session):
    org, admin = await _setup(db_session)
    kc_id, dc_id = await _campaign(db_session, org, admin, auto_assign=False)
    receipt = await crm.create_manual_donation(_request(org, "POST"), _manual(dc_id, 1_000_000), db_session, admin)
    assert [s["animal_number"] for s in receipt["kurban_shares"]] == [None, None]
    assert (await kurban.distribute_shares(_request(org, "POST"), kc_id, db_session, admin)) == {"assigned": 2, "new_animals": 1}


async def test_sheep_campaign_gives_each_share_its_own_animal_and_label(db_session):
    org, admin = await _setup(db_session)
    kc_id, dc_id = await _campaign(db_session, org, admin, animal_type="sheep", animal_label="Keçi", animal_prefix="KC")
    receipt = await crm.create_manual_donation(_request(org, "POST"), _manual(
        dc_id, 1_000_000, first_name="Ersin", metadata={"kurban_type": "sadaka", "kurban_names": ["Ersin Şenol", "İsmail Işık"]}),
        db_session, admin)
    assert [s["animal_number"] for s in receipt["kurban_shares"]] == ["KC-001", "KC-002"]
    animals = await _animals(db_session, org, admin, kc_id)
    assert {a["animal_label"] for a in animals} == {"Keçi"}


async def test_concurrent_donations_do_not_share_a_slot_or_a_number(db_session):
    org, admin = await _setup(db_session)
    kc_id, dc_id = await _campaign(db_session, org, admin)
    await db_session.commit()
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def one(i):
        async with maker() as session:
            await crm.create_manual_donation(_request(org, "POST"), _manual(dc_id, 500_000, first_name=f"Kişi{i}"), session, admin)

    await asyncio.gather(*(one(i) for i in range(8)))
    await engine.dispose()
    rows = (await db_session.execute(
        select(KurbanAnimal.animal_number, KurbanShare.share_number)
        .join(KurbanShare, KurbanShare.animal_id == KurbanAnimal.id).where(KurbanAnimal.campaign_id == kc_id)
    )).all()
    assert len(rows) == 8 and len(set(rows)) == 8, rows
    assert sorted({number for number, _ in rows}) == ["AF-001", "AF-002"]
    assert sum(1 for number, _ in rows if number == "AF-001") == 7


async def test_bulk_receipts_create_receipts_with_numbers_and_are_idempotent(db_session):
    org, admin = await _setup(db_session)
    kc_id, dc_id = await _campaign(db_session, org, admin, animal_type="sheep", animal_label="Keçi", animal_prefix="KC")
    payload = kurban.BulkReceiptsIn(batch_key=uuid.uuid4().hex, rows=[
        kurban.BulkRow(donor_name="Halil Usta", phone="05551234567", kurban_type="Sadaka"),
        kurban.BulkRow(donor_name="Selim Bey", on_behalf_of="Rahmetli Babası; Annesi", shares=2, payment_method="bank_transfer"),
        kurban.BulkRow(donor_name="Bekleyen Kişi", status="pending"),
    ])
    result = await kurban.bulk_receipts(_request(org, "POST"), kc_id, payload, db_session, admin)
    assert result["failed"] is None and result["total"] == 3
    created = result["created"]
    assert [s["animal_number"] for s in created[0]["kurban_shares"]] == ["KC-001"]
    assert [(s["animal_number"], s["name"]) for s in created[1]["kurban_shares"]] == [("KC-002", "Rahmetli Babası"), ("KC-003", "Annesi")]
    assert created[2]["status"] == "pending" and created[2]["kurban_shares"] == []  # no share until paid
    donations = (await db_session.execute(select(Donation).where(Donation.organization_id == org.id))).scalars().all()
    assert sorted(d.amount_cents for d in donations) == [500_000, 500_000, 1_000_000]
    share = (await db_session.execute(select(KurbanShare).where(KurbanShare.donor_name == "Halil Usta"))).scalar_one()
    assert share.kurban_type == "sadaka" and share.donor_phone

    again = await kurban.bulk_receipts(_request(org, "POST"), kc_id, payload, db_session, admin)
    assert [r["receipt_number"] for r in again["created"]] == [r["receipt_number"] for r in created]
    assert len((await db_session.execute(select(Donation).where(Donation.organization_id == org.id))).scalars().all()) == 3


async def test_bulk_receipts_reject_everything_when_one_row_is_invalid(db_session):
    org, admin = await _setup(db_session)
    kc_id, _ = await _campaign(db_session, org, admin)
    with pytest.raises(HTTPException) as exc:
        await kurban.bulk_receipts(_request(org, "POST"), kc_id, kurban.BulkReceiptsIn(batch_key=uuid.uuid4().hex, rows=[
            kurban.BulkRow(donor_name="Geçerli Kişi"),
            kurban.BulkRow(donor_name="İsim Fazla", on_behalf_of="A; B; C", shares=2),
        ]), db_session, admin)
    assert exc.value.status_code == 422 and exc.value.detail.startswith("2. satır")
    assert not (await db_session.execute(select(Donation).where(Donation.organization_id == org.id))).scalars().all()


async def test_name_cards_one_page_per_shareholder(db_session):
    org, admin = await _setup(db_session)
    kc_id, dc_id = await _campaign(db_session, org, admin)
    receipt = await crm.create_manual_donation(_request(org, "POST"), _manual(
        dc_id, 1_500_000, metadata={"kurban_names": ["Ersin Şenol", "Çağrı Öztürk", "Işıl Güneş"]}), db_session, admin)
    animal_id = uuid.UUID((await _animals(db_session, org, admin, kc_id))[0]["id"])
    for pdf in (
        await kurban.animal_cards(_request(org), animal_id, db_session, admin),
        await kurban.campaign_cards(_request(org), kc_id, "waiting", db_session, admin),
        await kurban.share_cards(_request(org, "POST"), kurban.CardsRequest(
            share_ids=[uuid.UUID(s["share_id"]) for s in receipt["kurban_shares"]]), db_session, admin),
    ):
        assert pdf.body.startswith(b"%PDF") and _pages(pdf.body) == 3
    from app.utils.kurban_pdf import tr_upper
    assert tr_upper("ersin şenol ılgın") == "ERSİN ŞENOL ILGIN"


async def test_slaughter_date_video_status_and_video_link_in_sms(db_session):
    org, admin = await _setup(db_session)
    kc_id, dc_id = await _campaign(db_session, org, admin)
    await crm.create_manual_donation(_request(org, "POST"), _manual(dc_id, 500_000, first_name="Hasan", phone="05321112233"), db_session, admin)
    animal = (await _animals(db_session, org, admin, kc_id))[0]
    assert animal["video_status"] == "none"
    animal_id = uuid.UUID(animal["id"])
    day = date.today() - timedelta(days=2)
    res = await kurban.slaughter_animals(_request(org, "POST"), kurban.SlaughterRequest(
        items=[kurban.SlaughterItem(animal_id=animal_id, video_url="https://youtu.be/kesim1")], slaughtered_on=day),
        db_session, admin)
    assert res["marked"] == 1 and res["sms_queued"] == 1
    row = (await _animals(db_session, org, admin, kc_id, video_status="recorded"))[0]
    assert row["slaughtered_at"].date() == day
    sms = (await _queued_sms(db_session, org))[0]
    assert "https://youtu.be/kesim1" in sms.body and "{" not in sms.body

    updated = await kurban.update_videos(_request(org, "POST"), kurban.VideoUpdate(
        animal_ids=[animal_id], video_status="sent"), db_session, admin)
    assert updated == {"updated": 1}
    assert (await _animals(db_session, org, admin, kc_id, video_status="sent"))[0]["video_url"] == "https://youtu.be/kesim1"
    with pytest.raises(HTTPException):
        await kurban.slaughter_animals(_request(org, "POST"), kurban.SlaughterRequest(
            items=[kurban.SlaughterItem(animal_id=animal_id)], slaughtered_on=date.today() + timedelta(days=1)), db_session, admin)


async def test_animal_number_must_be_unique_in_campaign(db_session):
    org, admin = await _setup(db_session)
    kc_id, _ = await _campaign(db_session, org, admin)
    created = await kurban.create_animals(_request(org, "POST"), kurban.AnimalCreate(campaign_id=kc_id, count=2), db_session, admin)
    with pytest.raises(HTTPException) as exc:
        await kurban.update_animal(_request(org, "PUT"), uuid.UUID(created[1]["id"]),
                                   kurban.AnimalUpdate(animal_number=created[0]["animal_number"]), db_session, admin)
    assert exc.value.status_code == 409


async def test_bulk_parse_reads_xlsx_and_csv_by_header(db_session):
    import io

    from openpyxl import Workbook
    from starlette.datastructures import UploadFile

    org, admin = await _setup(db_session)
    wb = Workbook()
    ws = wb.active
    ws.append(["Bağışçı", "KİMİN ADINA", "Telefon", "Niyet", "Hisse", "Ödeme", "Not"])
    ws.append(["Ersin Şenol", "Annesi", 5551112233, "Sadaka Kurbanı", 2, "Alındı", "x"])
    ws.append([None, None, None, None, None, None, None])
    ws.append(["Ali Kaya", None, "0532 111 22 33", None, None, "Bekliyor", None])
    buffer = io.BytesIO()
    wb.save(buffer)
    parsed = await kurban.bulk_parse(UploadFile(io.BytesIO(buffer.getvalue()), filename="kurban.xlsx"), admin)
    assert parsed["rows"] == [
        {"donor_name": "Ersin Şenol", "on_behalf_of": "Annesi", "phone": "05551112233", "kurban_type": "sadaka",
         "shares": 2, "status": "paid"},
        {"donor_name": "Ali Kaya", "phone": "0532 111 22 33", "status": "pending"},
    ]
    assert parsed["skipped_columns"] == ["Not"]

    csv_file = "Ad Soyad;Tel;Ödeme Yöntemi\nİbrahim Öz;05551112233;Havale\n".encode("cp1254")
    parsed = await kurban.bulk_parse(UploadFile(io.BytesIO(csv_file), filename="liste.csv"), admin)
    assert parsed["rows"] == [{"donor_name": "İbrahim Öz", "phone": "05551112233", "payment_method": "bank_transfer"}]
    with pytest.raises(HTTPException):
        await kurban.bulk_parse(UploadFile(io.BytesIO(b"Telefon\n0555"), filename="x.csv"), admin)
