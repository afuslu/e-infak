import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.banking import CONNECTORS, register
from app.banking.base import BankConnector, BankMovement
from app.banking.matching import Matcher, analyse, approve
from app.banking.parsers import categories_in, is_pos_settlement, kurban_intent, parse_description, phones_in
from app.banking.sync import sync_account
from app.models.automation import BankAccount, BankMatchRule, BankTransaction, ReconciliationStatus
from app.models.campaign import Campaign, CampaignCategory, CampaignStatus
from app.models.donation import Donation, Donor, PaymentMethod
from app.models.kurban import KurbanShare
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services.stkpro_import import StkProImporter, campaign_key, phone_of


async def _setup(db):
    slug = f"o-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Test Derneği", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x",
                 first_name="Seçkin", last_name="Bozkurt", role=UserRole.STK_ADMIN)
    db.add(admin)
    await db.flush()
    return org, admin


# --- parsers -----------------------------------------------------------------------------------

def test_parses_ziraat_and_vakif_descriptions():
    zk = parse_description("Gelen FAST Gönderen-HÜSEYİN İNCE TÜRKİYE CUMHURİYETİ ZİRAAT BANKASI A.Ş. berna ince kurban bağışı")
    assert (zk.sender, zk.note) == ("HÜSEYİN İNCE", "berna ince kurban bağışı")
    vk = parse_description("Amir- RESUL MUTLU Gönd.Bank.Kodu- 32 Aciklama- MEDRESE YARDIM")
    assert (vk.sender, vk.note) == ("RESUL MUTLU", "MEDRESE YARDIM")
    assert parse_description("Amir= CANSU KESKİN Aciklama= Sadaka bağış").sender == "CANSU KESKİN"
    assert parse_description("Gönderen: YASEMİN KARA Adak Kurban Bağışı Parası").sender == "YASEMİN KARA"
    assert parse_description("Amir- MEHMET ATMACA - Lehdar- HAYIRA AÇILAN KAPI DERNEĞİ").sender == "MEHMET ATMACA"
    assert phones_in("KEREM ATMACA 05513651372, ayrıca 0541 212 75 59") == ["05513651372", "05412127559"]
    assert "kurban" in categories_in("Afrika büyük baş kurban hisesi")
    assert "su" in categories_in("Gazze'ye temiz su")
    assert kurban_intent("keçi Şükür") == "sukur"
    assert is_pos_settlement("ISYERİ NO 9628833 Terminal No -00360691 Valor tarihi - 24-05-2026 POS Satis")


def test_stkpro_campaign_names_and_phones():
    assert (campaign_key("koyun adak", "KURBAN").title, campaign_key("koyun adak", "KURBAN").kurban_type) == ("Koyun", "adak")
    big = campaign_key("Büyükbaş kurban hissesi (vacip)", "KURBAN")
    assert (big.title, big.kurban_type) == ("Büyükbaş Kurban Hissesi", "vacip")
    assert campaign_key("Keçiㅤㅤㅤㅤㅤ", "KURBAN").title == "Keçi"
    assert campaign_key("keçi süt", "KUMANYA").category == CampaignCategory.GIDA
    assert campaign_key("koyun şifa", "KURBAN").kurban_type == "sifa"
    assert campaign_key("Afganistan Su Kuyusu", "SU KUYUSU").category == CampaignCategory.SU
    assert campaign_key("Zekat Bağışı", "STANDART").category == CampaignCategory.ZEKAT
    assert phone_of("90", "5364359168") == "05364359168"
    assert phone_of("49", "15123456789") == "4915123456789"
    assert phone_of("90", None) is None


# --- STK PRO import ------------------------------------------------------------------------------

DONORS = [
    {"No": "21263", "Ad Soyad": "ZEKERİYA ÖZLER", "Kod": "90", "Cep Telefon": "5364359168", "Eposta": None,
     "T.C. Kimlik": None, "Üyelik Tarihi": "22.06.2026 16:25", "Personel": "SEÇKİN BOZKURT", "İl": "Eskişehir"},
    {"No": "21559", "Ad Soyad": "YİĞİT OZAN KAYNAK", "Kod": "90", "Cep Telefon": "5558988691",
     "Üyelik Tarihi": "23.06.2026 10:00"},
]
DONATIONS = [
    {"Bağış No": "3049", "Makbuz No": "2578", "Tür": "STANDART", "Kampanya Adı": "Kuran-ı Kerim Bağışı", "Adet": "1",
     "Tutar": 1500, "Toplam Tutar": 1500, "Toplam Tutar Birimi": "₺", "Bağışçı": "YİĞİT OZAN KAYNAK", "Kod": "90",
     "Cep Telefon": "5558988691", "Bağış Tarihi": "10/11/2026 16:13:00", "Ödeme Şekli": "Ziraat Katılım",
     "Personel": "SEÇKİN BOZKURT", "Durum": "Ödendi", "Bağışçı No": "21559",
     "Açıklama (Makbuz)": "Gelen FAST Gönderen-AYŞE KAYNAK TÜRKİYE CUMHURİYETİ ZİRAAT BANKASI A.Ş. kuran"},
    {"Bağış No": "3050", "Makbuz No": "2579", "Tür": "KURBAN", "Kampanya Adı": "koyun adak", "Adet": "1",
     "Toplam Tutar": 9000, "Toplam Tutar Birimi": "₺", "Bağışçı": "ZEKERİYA ÖZLER", "Kimin Adına": "Ahmet Özler",
     "Bağış Tarihi": "10/11/2026 16:55:00", "Ödeme Şekli": "Kredi Kartı", "Durum": "Ödendi", "Bağışçı No": "21263"},
    {"Bağış No": "3051", "Makbuz No": "2579", "Tür": "STANDART", "Kampanya Adı": "Gazze Yemek", "Adet": "1",
     "Toplam Tutar": 250, "Bağışçı": "ZEKERİYA ÖZLER", "Bağış Tarihi": "10/11/2026 16:55:00",
     "Ödeme Şekli": "Kredi Kartı", "Durum": "Ödendi", "Bağışçı No": "21263"},
    {"Bağış No": "3052", "Makbuz No": "2580", "Tür": "STANDART", "Kampanya Adı": "Genel Bağış", "Toplam Tutar": 0,
     "Bağışçı": "SEVİL ATA", "Bağış Tarihi": "10/11/2026 17:00:00", "Ödeme Şekli": "Nakit (Dernek)", "Durum": "Ödendi"},
]


async def test_stkpro_import_links_donors_creates_campaigns_and_is_idempotent(db_session):
    org, admin = await _setup(db_session)
    importer = StkProImporter(db_session, org.id, actor=admin, season_year=2026)
    await importer.import_donors(DONORS)
    await importer.import_donations(DONATIONS)
    report = importer.report
    assert (report.donors_created, report.donations_created) == (2, 3)
    assert report.errors and report.errors[0]["bagis_no"] == "3052"  # zero amount
    assert {"Koyun", "Kuran-ı Kerim Bağışı", "Gazze Yemek"} <= set(report.campaigns_created)
    assert report.last_receipt_no == 2579

    donor = (await db_session.execute(select(Donor).where(Donor.organization_id == org.id,
                                                          Donor.external_ref == "21263"))).scalar_one()
    assert donor.phone == "05364359168" and donor.assigned_user_id == admin.id and donor.city == "Eskişehir"
    assert donor.total_donations == 2 and donor.total_donated_cents == 925_000

    donations = (await db_session.execute(select(Donation).where(Donation.organization_id == org.id))).scalars().all()
    receipts = sorted(d.official_receipt_no for d in donations if d.official_receipt_no)
    assert receipts == ["2578", "2579"]  # the second line of receipt 2579 keeps it in its details only
    transfer = next(d for d in donations if d.payment_details["stkpro_bagis_no"] == "3049")
    assert transfer.payment_method == PaymentMethod.BANK_TRANSFER and transfer.issued_by_id == admin.id

    share = (await db_session.execute(select(KurbanShare).where(KurbanShare.organization_id == org.id))).scalar_one()
    assert (share.kurban_type, share.on_behalf_of) == ("adak", "Ahmet Özler")

    rule = (await db_session.execute(select(BankMatchRule).where(BankMatchRule.organization_id == org.id))).scalar_one()
    assert (rule.pattern, rule.kind) == ("ayse kaynak", "sender")

    again = StkProImporter(db_session, org.id, actor=admin)
    await again.import_donors(DONORS)
    await again.import_donations(DONATIONS)
    assert (again.report.donors_created, again.report.donations_created, again.report.donations_skipped) == (0, 0, 3)


# --- matcher and approval ------------------------------------------------------------------------

async def _bank_setup(db):
    org, admin = await _setup(db)
    kurban = Campaign(organization_id=org.id, slug="koyun", title="Koyun", summary="s", target_cents=0,
                      category=CampaignCategory.KURBAN, status=CampaignStatus.ACTIVE)
    gazze = Campaign(organization_id=org.id, slug="gazze-yemek", title="Gazze Yemek", summary="s", target_cents=0,
                     status=CampaignStatus.ACTIVE)
    genel = Campaign(organization_id=org.id, slug="genel", title="Genel Bağış", summary="s", target_cents=0,
                     status=CampaignStatus.ACTIVE)
    ali = Donor(organization_id=org.id, first_name="ALİ", last_name="GÜNDEM", phone="05321112233")
    berna = Donor(organization_id=org.id, first_name="BERNA", last_name="İNCE", phone="05330000000")
    db.add_all([kurban, gazze, genel, ali, berna])
    await db.flush()
    db.add(BankMatchRule(organization_id=org.id, kind="sender", pattern="huseyin ince", donor_id=berna.id))
    await db.flush()
    return org, admin, kurban, gazze, genel, ali, berna


def _tx(org, description, amount=150_000, external_id=None):
    return BankTransaction(organization_id=org.id, external_id=external_id or uuid.uuid4().hex, amount_cents=amount,
                           booked_at=datetime.now(timezone.utc), currency="TRY", description=description,
                           raw_data={}, suggestion={})


async def test_matcher_suggests_donor_and_campaign_and_approval_learns(db_session):
    org, admin, kurban, gazze, genel, ali, berna = await _bank_setup(db_session)
    learnt = _tx(org, "Gelen FAST Gönderen-HÜSEYİN İNCE TÜRKİYE CUMHURİYETİ ZİRAAT BANKASI A.Ş. berna ince koyun adak")
    by_name = _tx(org, "Amir- ALİ GÜNDEM Aciklama- gazze yemek")
    by_phone = _tx(org, "Gönderen: MEHMET YILMAZ havale 0532 111 22 33 sadaka")
    unknown = _tx(org, "Amir- VELİ KARA Aciklama-")
    pos = _tx(org, "ISYERİ NO 9628833 Terminal No -00360691 Valor tarihi - 24-05-2026 POS Satis")
    outgoing = _tx(org, "Kira ödemesi", amount=-500_000)
    db_session.add_all([learnt, by_name, by_phone, unknown, pos, outgoing])
    await db_session.flush()

    matcher = Matcher(db_session, org.id)
    for t in (learnt, by_name, by_phone, unknown, pos, outgoing):
        await analyse(db_session, t, matcher)

    s = learnt.suggestion
    assert s["donor"]["id"] == str(berna.id) and s["donor"]["confidence"] == 0.95
    assert s["campaign"]["id"] == str(kurban.id) and s["kurban_type"] == "adak"
    assert s["campaign"]["confidence"] == "medium" and not s["auto"]  # one title word: a person confirms
    assert by_name.suggestion["auto"]  # known donor + full campaign title
    assert by_name.suggestion["donor"]["id"] == str(ali.id)
    assert by_name.suggestion["campaign"]["id"] == str(gazze.id) and by_name.suggestion["campaign"]["confidence"] == "high"
    assert by_phone.suggestion["donor"]["id"] == str(ali.id)
    assert unknown.suggestion["donor"]["confidence"] == 0 and not unknown.suggestion["auto"]
    assert pos.status == outgoing.status == ReconciliationStatus.IGNORED

    new_donor = Donor(organization_id=org.id, first_name="VELİ", last_name="KARA")
    db_session.add(new_donor)
    await db_session.flush()
    donation = await approve(db_session, unknown, donor=new_donor, campaign=genel, user_id=admin.id, matcher=matcher)
    assert donation.payment_method == PaymentMethod.BANK_TRANSFER and donation.amount_cents == 150_000
    assert unknown.status == ReconciliationStatus.MATCHED and unknown.donation_id == donation.id
    with pytest.raises(ValueError):
        await approve(db_session, unknown, donor=new_donor, campaign=genel, user_id=admin.id)
    again = _tx(org, "Amir- VELİ KARA Aciklama- genel")
    db_session.add(again)
    await db_session.flush()
    await analyse(db_session, again, matcher)
    assert again.suggestion["donor"]["id"] == str(new_donor.id) and again.suggestion["donor"]["confidence"] == 0.95


class _FakeBank(BankConnector):
    key = "testbank"
    label = "Test Bank"
    ready = True
    movements: list = []

    async def fetch(self, account, since, until):
        return list(self.movements)


async def test_sync_account_stores_new_movements_and_auto_approves(db_session):
    register(_FakeBank)
    try:
        org, admin, kurban, gazze, genel, ali, berna = await _bank_setup(db_session)
        account = BankAccount(organization_id=org.id, bank_key="testbank", label="Ana hesap", currency="TRY",
                              auto_approve=True, default_campaign_id=genel.id)
        db_session.add(account)
        await db_session.flush()
        now = datetime.now(timezone.utc)
        _FakeBank.movements = [
            BankMovement("D1", now - timedelta(hours=2), 90_000, description="Amir- ALİ GÜNDEM Aciklama- gazze yemek"),
            BankMovement("D2", now - timedelta(hours=1), 50_000, description="Amir- VELİ KARA Aciklama-"),
            BankMovement("D3", now, -10_000, description="Masraf"),
        ]
        result = await sync_account(db_session, account, until=now)
        assert (result["new"], result["auto_approved"], result["ignored"]) == (3, 1, 1)
        assert account.last_error is None and account.last_synced_at == now
        rows = {t.external_id: t for t in (await db_session.execute(select(BankTransaction).where(
            BankTransaction.organization_id == org.id))).scalars()}
        assert rows["testbank:D1"].status == ReconciliationStatus.MATCHED and rows["testbank:D1"].source == "api"
        assert rows["testbank:D2"].status == ReconciliationStatus.UNMATCHED
        donation = await db_session.get(Donation, rows["testbank:D1"].donation_id)
        assert donation.campaign_id == gazze.id and donation.donor_id == ali.id and donation.payment_provider == "bank:testbank"

        again = await sync_account(db_session, account, until=now + timedelta(minutes=10))
        assert again["new"] == 0  # the overlap window re-reads but does not duplicate
    finally:
        CONNECTORS.pop("testbank", None)


def _request(org):
    from starlette.requests import Request
    request = Request({"type": "http", "method": "POST", "path": "/api/v1/x", "headers": [], "query_string": b"",
                       "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    return request


async def test_incoming_transfer_api_approve_with_new_donor_and_rules(db_session):
    from fastapi import HTTPException
    from app.api.v1 import bank_sync

    org, admin, kurban, gazze, genel, ali, berna = await _bank_setup(db_session)
    other_org, _ = await _setup(db_session)
    tx = _tx(org, "Amir- ZEYNEP ARSLAN Aciklama- su kuyusu")
    db_session.add(tx)
    await db_session.flush()
    await analyse(db_session, tx, Matcher(db_session, org.id))
    await db_session.commit()
    request = _request(org)

    listed = await bank_sync.list_transfers(request, limit=200, offset=0, db=db_session, _=admin)
    assert listed["total"] == 1 and listed["items"][0]["suggestion"]["sender"] == "ZEYNEP ARSLAN"
    with pytest.raises(HTTPException):  # another organisation cannot touch it
        await bank_sync.approve_transfer(tx.id, bank_sync.ApproveIn(campaign_id=genel.id, donor_id=ali.id),
                                         _request(other_org), db=db_session, current_user=admin)

    result = await bank_sync.approve_transfer(
        tx.id, bank_sync.ApproveIn(campaign_id=genel.id, new_donor=bank_sync.NewDonorIn(full_name="Zeynep Arslan",
                                                                                         phone="5051234567")),
        request, db=db_session, current_user=admin)
    donation = await db_session.get(Donation, uuid.UUID(result["donation_id"]))
    donor = await db_session.get(Donor, donation.donor_id)
    assert donor.phone == "05051234567" and donation.campaign_id == genel.id
    with pytest.raises(HTTPException):
        await bank_sync.ignore_transfer(tx.id, request, db=db_session, current_user=admin)

    rule = await bank_sync.create_rule(bank_sync.RuleIn(pattern="Su Kuyusu", campaign_id=genel.id), request,
                                       db=db_session, _=admin)
    assert rule["pattern"] == "su kuyusu"
    nxt = _tx(org, "Amir- ZEYNEP ARSLAN Aciklama- SU KUYUSU hissesi")
    db_session.add(nxt)
    await db_session.flush()
    await analyse(db_session, nxt, Matcher(db_session, org.id))
    assert nxt.suggestion["campaign"]["id"] == str(genel.id) and nxt.suggestion["campaign"]["confidence"] == "high"
    assert nxt.suggestion["donor"]["id"] == str(donor.id) and nxt.suggestion["auto"]

    banks = await bank_sync.list_banks(request, db=db_session, _=admin)
    assert {b["key"] for b in banks} >= {"vakifkatilim", "ziraatkatilim", "kuveytturk"}
    assert not any(b["ready"] for b in banks if b["key"] in ("vakifkatilim", "ziraatkatilim", "kuveytturk"))


async def test_stkpro_reuses_site_campaigns_links_kurban_and_applies_aliases(db_session):
    from app.models.kurban import KurbanCampaign

    org, admin = await _setup(db_session)
    keci = Campaign(organization_id=org.id, slug="keci", title="Keçi", summary="s", target_cents=0,
                    category=CampaignCategory.KURBAN, status=CampaignStatus.ACTIVE)
    sut = Campaign(organization_id=org.id, slug="sut-keci", title="Süt Keçisi", summary="s", target_cents=0,
                   status=CampaignStatus.ACTIVE)
    db_session.add_all([keci, sut])
    await db_session.flush()
    rows = [
        {"Bağış No": "1", "Makbuz No": "1", "Tür": "KURBAN", "Kampanya Adı": "keçi akika", "Toplam Tutar": 7000,
         "Bağışçı": "ALİ VELİ", "Bağış Tarihi": "01/06/2026 10:00:00", "Ödeme Şekli": "Nakit (Dernek)", "Durum": "Ödendi"},
        {"Bağış No": "2", "Makbuz No": "2", "Tür": "KUMANYA", "Kampanya Adı": "keçi süt", "Toplam Tutar": 3000,
         "Bağışçı": "ALİ VELİ", "Bağış Tarihi": "01/06/2026 11:00:00", "Ödeme Şekli": "Nakit (Dernek)", "Durum": "Ödendi"},
        {"Bağış No": "3", "Makbuz No": "3", "Tür": "STANDART", "Kampanya Adı": "ESKİŞEHİR CAMİ PROJESİ", "Toplam Tutar": 100,
         "Bağışçı": "ALİ VELİ", "Bağış Tarihi": "01/06/2026 12:00:00", "Ödeme Şekli": "Nakit (Dernek)", "Durum": "Ödendi"},
    ]
    importer = StkProImporter(db_session, org.id, actor=admin, campaign_status=CampaignStatus.PAUSED,
                              aliases={"keçi süt": "Süt Keçisi"})
    await importer.import_donations(rows)
    report = importer.report
    assert report.campaigns_created == ["ESKİŞEHİR CAMİ PROJESİ"] and report.kurban_campaigns_linked == ["Keçi"]
    assert report.kurban_shares == 1
    link = (await db_session.execute(select(KurbanCampaign).where(KurbanCampaign.donation_campaign_id == keci.id))).scalar_one()
    assert link.organization_id == org.id
    by_no = {d.payment_details["stkpro_bagis_no"]: d for d in (await db_session.execute(
        select(Donation).where(Donation.organization_id == org.id))).scalars()}
    assert by_no["1"].campaign_id == keci.id and by_no["2"].campaign_id == sut.id
    cami = await db_session.get(Campaign, by_no["3"].campaign_id)
    assert cami.status == CampaignStatus.PAUSED  # old campaign kept for history, not shown on the site
