from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select

from app.models.automation import BankAccount, BankTransaction, OutboxEvent, ReconciliationStatus
from app.models.donation import Donation, Donor, PaymentMethod
from app.models.donor_note import DonorNote
from app.models.kurban import KurbanAnimal, KurbanCampaign, KurbanShare, KurbanStatus
from app.services.kurban_placement import place_shares
from app.services.offline_donation import record_offline_donation
from app.services.stkpro_final import StkProFinalImporter
from app.services.stkpro_import import StkProImporter, split_note_entries
from tests.test_stkpro_bank_sync import _setup

ACC = "53-2469017-1"


def _donor(no, name, phone, **extra):
    return {"No": no, "Ad Soyad": name, "Kod": "90", "Cep Telefon": phone, "Üyelik Tarihi": "22.06.2026 16:25", **extra}


def _line(no, receipt, name, donor, amount, when, campaign="Gazze Yemek", kind="STANDART", account=None, **extra):
    return {"Bağış No": no, "Makbuz No": receipt, "Tür": kind, "Kampanya Adı": campaign, "Adet": "1", "Toplam Tutar": amount,
            "Toplam Tutar Birimi": "₺", "Bağışçı": name, "Kod": "90", "Bağış Tarihi": when, "Durum": "Ödendi", "Bağışçı No": donor,
            "Ödeme Şekli": "Ziraat Katılım" if account else "Nakit (Dernek)", "Ek Hesap": account, **extra}


def _bank(no, key, amount, when, name, state="Eşleştirildi"):
    return {"No": no, "Banka": "ziraatkatilim", "Hesap": ACC, "İşlem ID": key, "Tutar": amount, "Tarih": when,
            "Bağışçı": name, "Açıklama": f"Gönderen: {name}", "Durum": state}


def test_note_lines_carry_their_author():
    assert [(a, t) for _, a, t in split_note_entries("22.06.2026 16:32 · EMİN ÇIRAK: aradı\n22.06.2026 16:25 · -: meşgul")] == [
        ("EMİN ÇIRAK", "aradı"), (None, "meşgul")]


@pytest.mark.asyncio
async def test_final_import_links_what_both_systems_have(db_session):
    db = db_session
    org, admin = await _setup(db)
    account = BankAccount(organization_id=org.id, bank_key="ziraatkatilim", label="ZK", iban="TR1", currency="TRY")
    db.add(account)
    await db.flush()
    old_donors = [_donor("1", "ALİ ŞAHİN", "5321110001"), _donor("2", "ALİ ŞAHİN", "5321110001"), _donor("3", "EMEL AK", "5321110003")]
    old_lines = [_line("10", "100", "EMEL AK", "3", 900, "01/09/2026 10:00:00", "koyun adak", "KURBAN"),
                 _line("11", "101", "EMEL AK", "3", 1000, "02/09/2026 10:00:00")]
    first = StkProImporter(db, org.id, actor=admin, season_year=2026)
    await first.import_donors([old_donors[0], old_donors[2]])  # number 2 was merged into 1 by staff afterwards
    await first.import_donations(old_lines)
    kurban = (await db.execute(select(KurbanCampaign).where(KurbanCampaign.organization_id == org.id))).scalar_one()
    await place_shares(db, kurban)
    kurban.auto_assign = True
    gazze = first._campaigns["gazze yemek"]
    ali = first._donors["1"]
    own = {}
    for name, cents, minute in (("same", 50_000, 0), ("split", 200_000, 5), ("only", 7_000, 9)):
        own[name], _ = await record_offline_donation(
            db, organization_id=org.id, campaign=gazze, donor=ali, amount_cents=cents, currency="TRY",
            method=PaymentMethod.BANK_TRANSFER, paid_at=datetime(2026, 11, 20, 9, minute, 22, tzinfo=timezone.utc),
            issued_by_id=admin.id, provider="bank:ziraatkatilim", idempotency_key=f"bank:{name}:{org.id}")
    waiting = BankTransaction(organization_id=org.id, external_id="ziraatkatilim:53-2469017-1:777:20261121090000:30000",
                              booked_at=datetime(2026, 11, 21, 9, tzinfo=timezone.utc), amount_cents=30_000, currency="TRY")
    db.add(waiting)
    await db.flush()
    assert [own[k].receipt_seq for k in ("same", "split", "only")] == [102, 103, 104]
    outbox = (await db.execute(select(func.count(OutboxEvent.id)))).scalar_one()

    donors = [{**old_donors[0], "Görüşme Notları": "22.06.2026 16:32 · SEÇKİN BOZKURT: aradı\n23.06.2026 10:00 · -: meşgul\n22.06.2026 16:25 · -: meşgul"},
              {**old_donors[1], "Görüşme Notları": "24.06.2026 10:00 · -: ikinci kart"},
              {**old_donors[2], "Ad Soyad": "EMEL AKSU"}, _donor("4", "YENİ KİŞİ", "5321110004")]
    lines = [{**old_lines[0], "Kurban No": "501", "Kimin Adına Telefon": "5329998877"},
             _line("20", "110", "EMEL AK", "3", 1000, "02/09/2026 10:00:00"),  # 11, entered again
             _line("21", "102", "ALİ ŞAHİN", "2", 500, "20/11/2026 12:00:00", "Sadaka Bağışı", account=ACC),
             _line("22", "111", "ALİ ŞAHİN", "1", 1000, "20/11/2026 12:05:00", account=ACC),
             _line("23", "111", "ALİ ŞAHİN", "1", 1000, "20/11/2026 12:05:00", account=ACC),
             _line("24", "112", "YENİ KİŞİ", "4", 300, "21/11/2026 12:00:00", account=ACC),
             _line("25", "113", "YENİ KİŞİ", "4", 950, "22/11/2026 12:00:00", "koyun akika", "KURBAN", **{"Kurban No": "502"}),
             {**_line("26", "104", "YENİ KİŞİ", "4", 40, "22/11/2026 13:00:00"), "Ödeme Şekli": "Kredi Kartı"}]
    kurbans = [{"Kurban No": "501", "Kurban Türü": "Adak Kurban", "Ülkesi": "Çad", "Durum": "Kesildi", "Video Durum": "Gönderildi"},
               {"Kurban No": "502", "Kurban Türü": "Akika Kurban", "Ülkesi": "Afrika", "Durum": "Kesilmedi"}]
    bank = [_bank("1", "777", 300, "21/11/2026 12:00:00", "YENİ KİŞİ"), _bank("2", "778", 2000, "20/11/2026 12:05:22", "ALİ ŞAHİN"),
            _bank("3", "779", 15, "20/11/2026 15:00:00", "KİMSE", "Eşleşmedi")]
    online = [{"No": "9", "Sipariş ID": "HKD9", "Makbuz": "#104", "Kampanya": "Gazze Yemek", "Kart Maske": "5281 **** **** 8557",
               "Banka Cevap": "Başarılı"}]

    async def run():
        importer = StkProFinalImporter(db, org.id, actor=admin, previous_donors=old_donors, previous_donations=old_lines,
                                       aliases={"Sadaka Bağışı": "Gazze Yemek"})
        await importer.import_donors(donors)
        await importer.import_donations(lines)
        await importer.import_kurban(kurbans)
        await importer.import_bank(bank)
        importer.import_online(online)
        await importer.renumber()
        return importer, await importer.check([])

    importer, check = await run()
    assert (importer.report.donors_created, importer.report.donations_created) == (1, 3)
    assert importer.extra["donors_merged_here"] == ["2 -> 1"] and importer.extra["moved"] == ["11 -> 20"]
    assert check["traced_total"] == check["stk_total"] and not check["receipts_different_here"]
    assert (own["same"].receipt_seq, own["split"].receipt_seq, own["only"].receipt_seq) == (102, 111, 114)
    assert own["same"].campaign_id == gazze.id and own["only"].payment_details["old_receipt_seq"] == 104
    emel = (await db.execute(select(Donor).where(Donor.external_ref == "3", Donor.organization_id == org.id))).scalar_one()
    assert emel.last_name == "AKSU"
    notes = (await db.execute(select(DonorNote).where(DonorNote.donor_id == ali.id).order_by(DonorNote.created_at))).scalars().all()
    assert [n.content for n in notes] == ["meşgul", "aradı", "meşgul", "ikinci kart"] and notes[1].author_id == admin.id

    animals = {a.animal_number: a for a in (await db.execute(select(KurbanAnimal).where(
        KurbanAnimal.organization_id == org.id))).scalars()}
    assert set(animals) == {"501", "502"}
    assert (animals["501"].status, animals["501"].video_status, animals["501"].country) == (KurbanStatus.SLAUGHTERED, "sent", "Çad")
    share = (await db.execute(select(KurbanShare).where(KurbanShare.animal_id == animals["501"].id))).scalar_one()
    assert share.donor_phone == "05329998877" and share.status == KurbanStatus.SLAUGHTERED and kurban.auto_assign

    movements = {t.external_id.split(":")[2]: t for t in (await db.execute(select(BankTransaction).where(
        BankTransaction.organization_id == org.id))).scalars()}
    assert waiting.status == ReconciliationStatus.MATCHED and waiting.donation_id == importer._by_stk["24"].id
    assert movements["778"].donation_id == own["split"].id and movements["779"].status == ReconciliationStatus.IGNORED
    assert movements["778"].external_id == "ziraatkatilim:53-2469017-1:778:20261120090522:200000"
    card = importer._by_stk["26"]
    assert (card.card_last_4, card.transaction_id) == ("8557", "HKD9")
    assert (await db.execute(select(func.count(OutboxEvent.id)))).scalar_one() == outbox

    count = (await db.execute(select(func.count(Donation.id)).where(Donation.organization_id == org.id))).scalar_one()
    again, _ = await run()
    assert (again.report.donors_created, again.report.donations_created, again.report.notes_created) == (0, 0, 0)
    assert not again.extra["renumbered"] and not again.extra["linked"] and not again.extra["kurban"]["shares_moved"]
    assert (await db.execute(select(func.count(Donation.id)).where(Donation.organization_id == org.id))).scalar_one() == count
    assert own["only"].receipt_seq == 114
