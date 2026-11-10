import io
import json
import uuid

import pytest
from fastapi import HTTPException
from openpyxl import Workbook
from sqlalchemy import select
from starlette.datastructures import UploadFile
from starlette.requests import Request

from app.api.v1 import crm, data_tools, receipt_books
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor
from app.models.donor_note import DonorNote
from app.models.organization import Organization
from app.models.user import User, UserRole


def _request(org, method="GET"):
    request = Request({"type": "http", "method": method, "path": "/api/v1/x", "headers": [], "query_string": b"", "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _setup(db):
    slug = f"o-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Test Derneği", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x",
                 first_name="Ayşe", last_name="Y", role=UserRole.STK_ADMIN)
    campaign = Campaign(organization_id=org.id, slug="genel", title="Genel Bağış", summary="s", target_cents=0)
    db.add_all([admin, campaign])
    await db.flush()
    return org, admin, campaign


def _manual(campaign, amount=10_000, **extra):
    donor = extra.pop("donor", crm.ManualDonor(first_name="Ali", phone="05321112233"))
    return crm.ManualDonationIn(idempotency_key=uuid.uuid4().hex, campaign_id=campaign.id, amount_cents=amount,
                                payment_method="cash", donor=donor, send_receipt=False, **extra)


def _upload(name: str, content: bytes) -> UploadFile:
    return UploadFile(file=io.BytesIO(content), filename=name)


def _xlsx(rows: list[list]) -> bytes:
    wb = Workbook()
    for row in rows:
        wb.active.append(row)
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


async def test_receipt_book_numbers_are_never_reused(db_session):
    org, admin, campaign = await _setup(db_session)
    book = await receipt_books.create_book(_request(org, "POST"), receipt_books.BookIn(
        series="A", start_no=1, end_no=5, branch="Kadıköy Şube"), db_session, admin)
    with pytest.raises(HTTPException) as exc:
        await receipt_books.create_book(_request(org, "POST"), receipt_books.BookIn(series="a", start_no=5, end_no=9), db_session, admin)
    assert exc.value.status_code == 409
    book_id = uuid.UUID(book["id"])

    async def cut(**kw):
        return await crm.create_manual_donation(_request(org, "POST"), _manual(campaign, receipt_book_id=book_id, **kw), db_session, admin)

    assert (await cut())["official_receipt_no"] == "A-1"
    third = await cut(official_no=3)
    assert third["official_receipt_no"] == "A-3"
    assert (await cut())["official_receipt_no"] == "A-2"
    with pytest.raises(HTTPException) as exc:
        await cut(official_no=3)
    assert exc.value.status_code == 409
    assert (await cut())["official_receipt_no"] == "A-4"  # 3 elle kesildiği için atlandı

    # Makbuz iptal edilse de numarası boşa çıkmaz.
    await crm.cancel_manual_donation(_request(org, "POST"), uuid.UUID(third["id"]), crm.CancelIn(reason="Hatalı tutar"), db_session, admin)
    voided = await receipt_books.void_sheet(_request(org, "POST"), book_id, receipt_books.VoidIn(number=5, reason="Yırtıldı"), db_session, admin)
    assert voided["status"] == "closed" and voided["remaining"] == 0
    with pytest.raises(HTTPException) as exc:
        await cut()
    assert exc.value.status_code == 409

    sheets = await receipt_books.book_sheets(_request(org), book_id, db_session, admin)
    assert [s["state"] for s in sheets["sheets"]] == ["used", "used", "cancelled", "used", "voided"]

    # Koçansız elle makbuz ve kanal ayrımı
    await crm.create_manual_donation(_request(org, "POST"), _manual(campaign, 7_000), db_session, admin)
    summary = await receipt_books.receipt_channel_summary(_request(org), None, None, "TRY", db_session, admin)
    channels = {c["label"]: (c["count"], c["total_cents"]) for c in summary["channels"]}
    assert channels == {"Kadıköy Şube": (3, 30_000), "Elle (koçansız)": (1, 7_000)}


async def test_donor_import_wizard_matches_and_fills_blanks(db_session):
    org, admin, _ = await _setup(db_session)
    existing = Donor(organization_id=org.id, first_name="Ali", last_name="Veli", phone="05321112233", tags=["eski"])
    db_session.add(existing)
    await db_session.flush()
    content = _xlsx([
        ["Ad Soyad", "Telefon", "E-posta", "Şehir", "Grup", "SMS izni"],
        ["Ali Veli", 5321112233, "ali@example.com", "Bursa", "Ramazan", "evet"],  # mevcut kişi (telefon)
        ["Zeynep Kara", "0532 999 88 77", None, "İzmir", "Ramazan; Kurban", "hayır"],
        ["Zeynep K.", "05329998877", "z@example.com", None, None, None],  # dosya içi tekrar
        [None, "05320000000", None, None, None, None],  # ad yok
        ["Hata Li", "123", None, None, None, None],  # telefon geçersiz
    ])
    intro = await data_tools.import_donors(_request(org, "POST"), _upload("liste.xlsx", content), None, True, None, db_session, admin)
    mapping = intro["suggested_mapping"]
    assert mapping == {"full_name": 0, "phone": 1, "email": 2, "city": 3, "tags": 4, "allow_sms": 5}

    dry = await data_tools.import_donors(_request(org, "POST"), _upload("liste.xlsx", content), json.dumps(mapping), True, None,
                                         db_session, admin)
    assert (dry["created"], dry["matched"], dry["error_count"]) == (1, 2, 2)
    assert [e["row"] for e in dry["errors"]] == [5, 6]
    assert (await db_session.execute(select(Donor).where(Donor.organization_id == org.id))).scalars().all() == [existing]

    done = await data_tools.import_donors(_request(org, "POST"), _upload("liste.xlsx", content), json.dumps(mapping), False, "2026",
                                          db_session, admin)
    assert done["committed"] and (done["created"], done["matched"]) == (1, 2)
    await db_session.refresh(existing)
    assert existing.email == "ali@example.com" and existing.city == "Bursa" and existing.allow_sms
    assert existing.tags == ["2026", "Ramazan", "eski"]
    zeynep = (await db_session.execute(select(Donor).where(Donor.organization_id == org.id, Donor.phone == "05329998877"))).scalar_one()
    assert zeynep.email == "z@example.com" and zeynep.tags == ["2026", "Kurban", "Ramazan"]


async def test_receipt_import_is_idempotent_and_validates(db_session):
    org, admin, campaign = await _setup(db_session)
    kurban = Campaign(organization_id=org.id, slug="fitre-2026", title="Fitre 2026", summary="s", target_cents=0)
    db_session.add(kurban)
    await db_session.flush()
    csv_text = (
        "Bağışçı;Telefon;Tutar;Tarih;Bağış türü;Ödeme;Makbuz No\n"
        "Hasan Can;05551112233;1.250,50;05.03.2025;Fitre 2026;Nakit;K-100\n"
        "Hasan Can;05551112233;300;06.03.2025;;Havale;K-101\n"
        "Fatma Ak;05552223344;abc;06.03.2025;;Nakit;\n"
        "Fatma Ak;05552223344;100;06.03.2025;Bilinmeyen;Nakit;K-100\n"
    ).encode()
    intro = await data_tools.import_receipts(_request(org, "POST"), _upload("eski.csv", csv_text), None, True, None, db_session, admin)
    mapping = intro["suggested_mapping"]
    assert mapping == {"full_name": 0, "phone": 1, "amount": 2, "paid_on": 3, "campaign": 4, "payment_method": 5,
                       "official_receipt_no": 6}

    args = (json.dumps(mapping), False, campaign.id, db_session, admin)
    done = await data_tools.import_receipts(_request(org, "POST"), _upload("eski.csv", csv_text), *args)
    assert (done["imported"], done["error_count"], done["new_donors"]) == (2, 2, 1)
    assert {e["row"] for e in done["errors"]} == {4, 5}
    donations = (await db_session.execute(select(Donation).where(Donation.organization_id == org.id)
                                          .order_by(Donation.amount_cents.desc()))).scalars().all()
    assert [(d.amount_cents, d.campaign_id, d.official_receipt_no, d.payment_provider) for d in donations] == [
        (125_050, kurban.id, "K-100", "import"), (30_000, campaign.id, "K-101", "import")]
    hasan = (await db_session.execute(select(Donor).where(Donor.organization_id == org.id, Donor.phone == "05551112233"))).scalar_one()
    assert (hasan.total_donations, hasan.total_donated_cents) == (2, 155_050)

    again = await data_tools.import_receipts(_request(org, "POST"), _upload("eski.csv", csv_text), *args)
    assert (again["imported"], again["already_imported"]) == (0, 2)


async def test_duplicates_and_merge_move_everything(db_session):
    org, admin, campaign = await _setup(db_session)
    a = Donor(organization_id=org.id, first_name="Mehmet", last_name="Öz", phone="05551234567", tags=["kurban"], notes="ilk kayıt")
    b = Donor(organization_id=org.id, first_name="Mehmet", last_name="Oz", phone="05551234567", email="m@example.com", city="Konya")
    c = Donor(organization_id=org.id, first_name="M.", email="M@example.com", tags=["zekat"], allow_sms=True)
    lone = Donor(organization_id=org.id, first_name="Tek", phone="05000000000")
    db_session.add_all([a, b, c, lone])
    await db_session.flush()
    for donor in (a, b, c):
        await crm.create_manual_donation(_request(org, "POST"), _manual(campaign, 5_000, donor_id=donor.id, donor=None), db_session, admin)
    db_session.add(DonorNote(donor_id=c.id, author_id=admin.id, content="Telefonla görüşüldü"))
    await db_session.flush()

    found = await data_tools.find_duplicates(_request(org), False, db_session, admin)
    assert found["group_count"] == 1
    group = found["groups"][0]
    assert set(group["reasons"]) == {"Telefon", "E-posta"}
    assert {d["id"] for d in group["donors"]} == {str(a.id), str(b.id), str(c.id)}

    merged = await data_tools.merge_donors(_request(org, "POST"), data_tools.MergeIn(
        target_id=a.id, source_ids=[b.id, c.id]), db_session, admin)
    assert merged["moved"]["donations"] == 2 and merged["moved"]["donor_notes"] == 1
    await db_session.refresh(a)
    assert (a.total_donations, a.total_donated_cents) == (3, 15_000)
    assert a.email == "m@example.com" and a.city == "Konya" and a.allow_sms and a.tags == ["kurban", "zekat"]
    assert (await db_session.execute(select(Donor.id).where(Donor.id.in_([b.id, c.id])))).all() == []
    assert (await data_tools.find_duplicates(_request(org), False, db_session, admin))["group_count"] == 0

    with pytest.raises(HTTPException):
        await data_tools.merge_donors(_request(org, "POST"), data_tools.MergeIn(target_id=a.id, source_ids=[a.id]), db_session, admin)
