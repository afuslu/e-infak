"""Moving an organisation from STK PRO: its Excel exports become donors, donations and kurban shares.

Exports handled (headers as STK PRO writes them):
    bagiscilar_*.xlsx    No, Ad Soyad, Kod, Cep Telefon, Eposta, T.C. Kimlik, Üyelik Tarihi, Üyelik Tipi, Referans,
                         Temsilci, Personel [, Mahalle, Cadde/Sokak, İlçe, İl, Sabit Tel. Kod]
    tum_bagislar_*.xlsx  Bağış No, Makbuz No, Tür, Kampanya Adı, Kampanya Ülkesi, Adet, Tutar, …, Bağışçı, Kod,
                         Cep Telefon, İlçe, Kimin Adına, Bağış Tarihi, Tipi, Ödeme Şekli, Personel, Durum,
                         Bağışçı No, Eposta, TC/Vergi No, Açıklama (Makbuz)
The makbuzlar_*.xlsx exports repeat the donation file grouped by receipt and are not needed.

Links are exact: STK PRO's donor number is kept in Donor.external_ref and donations find their donor through
"Bağışçı No". Everything runs in one transaction; a dry run rolls it back, so its report is exactly what a real
run would write. Running it again skips what is already there (donor number / "stkpro:" idempotency keys).
"""
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Iterable, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.banking.matching import learn_sender
from app.banking.parsers import categories_in, fold, kurban_intent, parse_description
from app.models.campaign import Campaign, CampaignCategory, CampaignStatus
from app.models.donation import Donation, Donor, DonorType, PaymentMethod
from app.models.kurban import KurbanAnimalType, KurbanCampaign
from app.models.user import User

TZ = ZoneInfo("Europe/Istanbul")
INVISIBLE = re.compile(r"[ㅤᅟᅠ​-‏ ﻿]+")
BANK_METHODS = ("katilim", "kuveyt", "ziraat", "vakif", "albaraka", "emlak", "turkiye finans", "havale", "eft")
KURBAN_ANIMALS = {  # folded word -> (campaign title, animal)
    "buyukbas": ("Büyükbaş Kurban Hissesi", KurbanAnimalType.COW),
    "kucukbas": ("Küçükbaş Kurban", KurbanAnimalType.SHEEP),
    "koyun": ("Koyun", KurbanAnimalType.SHEEP),
    "keci": ("Keçi", KurbanAnimalType.SHEEP),
    "koc": ("Koç", KurbanAnimalType.SHEEP),
}
TYPE_CATEGORY = {"kurban": CampaignCategory.KURBAN, "su kuyusu": CampaignCategory.SU,
                 "sponsorluk": CampaignCategory.EGITIM, "kumanya": CampaignCategory.GIDA}


def read_xlsx(path: str) -> list[dict]:
    from openpyxl import load_workbook
    sheet = load_workbook(path, read_only=True, data_only=True).active
    rows = sheet.iter_rows(values_only=True)
    headers = [str(h or "").strip() for h in next(rows)]
    return [dict(zip(headers, r)) for r in rows if any(v not in (None, "") for v in r)]


def _text(value, limit: int = 0) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = INVISIBLE.sub(" ", str(value)).strip()
    text = re.sub(r"\s+", " ", text)
    if not text or text == "-":
        return None
    return text[:limit] if limit else text


def phone_of(code, number) -> Optional[str]:
    digits = re.sub(r"\D", "", str(_text(number) or ""))
    if not digits:
        return None
    code = re.sub(r"\D", "", str(_text(code) or "90")) or "90"
    if code == "90":
        digits = digits[-10:]
        return "0" + digits if len(digits) == 10 else None
    return (code + digits)[:15]


def _when(value) -> datetime:
    if isinstance(value, datetime):
        return value.replace(tzinfo=TZ) if not value.tzinfo else value
    text = _text(value) or ""
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d.%m.%Y %H:%M", "%d.%m.%Y %H:%M:%S", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=TZ)
        except ValueError:
            continue
    raise ValueError(f"Geçersiz tarih: {value}")


def _cents(value) -> int:
    if isinstance(value, (int, float)):
        return int(round(value * 100))
    text = (_text(value) or "0").replace("₺", "").replace(".", "").replace(",", ".")
    return int(round(float(text) * 100))


def _split_name(full: str) -> tuple[str, Optional[str]]:
    parts = full.split()
    return (" ".join(parts[:-1]), parts[-1]) if len(parts) > 1 else (parts[0], None)


def method_of(value) -> PaymentMethod:
    folded = fold(value)
    if "kart" in folded or "kredi" in folded or "pos" in folded:
        return PaymentMethod.CREDIT_CARD
    if any(w in folded for w in BANK_METHODS):
        return PaymentMethod.BANK_TRANSFER
    return PaymentMethod.CASH


@dataclass
class CampaignKey:
    title: str
    category: CampaignCategory
    kurban_type: Optional[str] = None
    animal: Optional[KurbanAnimalType] = None


def campaign_key(name: Optional[str], kind: Optional[str]) -> CampaignKey:
    """'koyun adak' -> Koyun + adak; 'Büyükbaş kurban hissesi (vacip)' -> Büyükbaş Kurban Hissesi + vacip."""
    title = _text(name, 300) or "Genel Bağış"
    folded_kind = fold(kind)
    folded = fold(title)
    # The type column decides when present: "keçi süt" (KUMANYA) is a milk goat, not a sacrifice.
    if folded_kind == "kurban" or (not folded_kind and any(w in folded.split() for w in KURBAN_ANIMALS)):
        animal_word = next((w for w in folded.split() if w in KURBAN_ANIMALS), None)
        if animal_word:
            canonical, animal = KURBAN_ANIMALS[animal_word]
            return CampaignKey(canonical, CampaignCategory.KURBAN, kurban_intent(title) or "vacip", animal)
        return CampaignKey(title, CampaignCategory.KURBAN, kurban_intent(title) or "vacip", KurbanAnimalType.SHEEP)
    category = TYPE_CATEGORY.get(folded_kind)
    if not category:
        found = categories_in(title)
        category = CampaignCategory(found[0]) if found and found[0] in CampaignCategory._value2member_map_ else CampaignCategory.GENEL
    return CampaignKey(title, category)


@dataclass
class ImportReport:
    donors_created: int = 0
    donors_updated: int = 0
    donors_skipped: int = 0
    donations_created: int = 0
    donations_skipped: int = 0
    donors_created_from_donations: int = 0
    kurban_shares: int = 0
    sender_rules: int = 0
    campaigns_created: list = field(default_factory=list)
    campaign_map: dict = field(default_factory=dict)  # STK PRO name -> e-infak title (+ intent)
    totals: Counter = field(default_factory=Counter)  # by payment method label, kuruş
    errors: list = field(default_factory=list)
    last_receipt_no: Optional[int] = None

    def as_dict(self) -> dict:
        return {**{k: v for k, v in self.__dict__.items() if k not in ("totals", "errors")},
                "totals": dict(self.totals), "error_count": len(self.errors), "errors": self.errors[:200]}


class StkProImporter:
    def __init__(self, db: AsyncSession, organization_id: UUID, *, actor: User, create_campaigns: bool = True,
                 campaign_status: CampaignStatus = CampaignStatus.ACTIVE, season_year: Optional[int] = None):
        self.db, self.org_id, self.actor = db, organization_id, actor
        self.create_campaigns, self.campaign_status = create_campaigns, campaign_status
        self.season_year = season_year or date.today().year
        self.report = ImportReport()
        self._donors: dict[str, Donor] = {}
        self._campaigns: dict[str, Campaign] = {}
        self._staff: dict[str, User] = {}

    async def _prepare(self) -> None:
        donors = (await self.db.execute(select(Donor).where(
            Donor.organization_id == self.org_id, Donor.external_ref.isnot(None)))).scalars().all()
        self._donors = {d.external_ref: d for d in donors}
        campaigns = (await self.db.execute(select(Campaign).where(Campaign.organization_id == self.org_id))).scalars().all()
        for c in campaigns:
            self._campaigns.setdefault(fold(c.title), c)
        users = (await self.db.execute(select(User).where(User.organization_id == self.org_id))).scalars().all()
        self._staff = {fold(f"{u.first_name} {u.last_name}"): u for u in users}

    # --- donors -------------------------------------------------------------------------------

    def _donor_values(self, row: dict) -> dict:
        name = _text(row.get("Ad Soyad"), 200) or "İsimsiz Bağışçı"
        first, last = _split_name(name)
        email = (_text(row.get("Eposta"), 255) or "").lower() or None
        if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            email = None
        tc = re.sub(r"\D", "", _text(row.get("T.C. Kimlik")) or "") or None
        address = ", ".join(p for p in (_text(row.get("Mahalle")), _text(row.get("Cadde/Sokak")), _text(row.get("İlçe"))) if p)
        return {"first_name": first[:100], "last_name": (last or "")[:100] or None,
                "phone": phone_of(row.get("Kod"), row.get("Cep Telefon")), "email": email,
                "tc_no": tc if tc and len(tc) == 11 else None, "address": address or None,
                "city": _text(row.get("İl"), 100)}

    async def import_donors(self, rows: Iterable[dict]) -> None:
        await self._prepare()
        for line, row in enumerate(rows, start=2):
            ref = _text(row.get("No"), 64)
            if not ref:
                self.report.errors.append({"file": "bagiscilar", "row": line, "message": "Bağışçı no boş"})
                continue
            values = self._donor_values(row)
            donor = self._donors.get(ref)
            if donor:
                changed = False
                for key, value in values.items():
                    if value and not getattr(donor, key):
                        setattr(donor, key, value)
                        changed = True
                self.report.donors_updated += changed
                self.report.donors_skipped += not changed
                continue
            staff = self._staff.get(fold(row.get("Personel"))) or self._staff.get(fold(row.get("Temsilci")))
            donor = Donor(organization_id=self.org_id, donor_type=DonorType.INDIVIDUAL, external_ref=ref,
                          country="Türkiye", total_donations=0, total_donated_cents=0, tags=["STK PRO"],
                          allow_sms=bool(values["phone"]), assigned_user_id=staff.id if staff else None, **values)
            try:
                donor.created_at = _when(row.get("Üyelik Tarihi"))
            except ValueError:
                pass
            self.db.add(donor)
            self._donors[ref] = donor
            self.report.donors_created += 1
            if self.report.donors_created % 1000 == 0:
                await self.db.flush()
        await self.db.flush()

    # --- campaigns ----------------------------------------------------------------------------

    async def _campaign(self, key: CampaignKey) -> Optional[Campaign]:
        found = self._campaigns.get(fold(key.title))
        if found or not self.create_campaigns:
            return found
        slug_base = re.sub(r"[^a-z0-9]+", "-", fold(key.title)).strip("-")[:180] or "kampanya"
        slug, n = slug_base, 2
        taken = set((await self.db.execute(select(Campaign.slug).where(Campaign.organization_id == self.org_id))).scalars())
        while slug in taken:
            slug, n = f"{slug_base}-{n}", n + 1
        campaign = Campaign(organization_id=self.org_id, slug=slug, title=key.title, summary=key.title,
                            category=key.category, status=self.campaign_status, target_cents=0, collected_cents=0,
                            currency="TRY")
        self.db.add(campaign)
        await self.db.flush()
        if key.category == CampaignCategory.KURBAN:
            self.db.add(KurbanCampaign(organization_id=self.org_id, title=key.title, price_per_share_cents=0,
                                       donation_campaign_id=campaign.id, animal_type=key.animal or KurbanAnimalType.SHEEP,
                                       season_year=self.season_year))
            await self.db.flush()
        self._campaigns[fold(key.title)] = campaign
        self.report.campaigns_created.append(key.title)
        return campaign

    # --- donations ----------------------------------------------------------------------------

    async def _donor_for_donation(self, row: dict) -> Donor:
        ref = _text(row.get("Bağışçı No"), 64)
        donor = self._donors.get(ref) if ref else None
        if donor:
            return donor
        values = self._donor_values({"Ad Soyad": row.get("Bağışçı"), "Kod": row.get("Kod"),
                                     "Cep Telefon": row.get("Cep Telefon"), "Eposta": row.get("Eposta"),
                                     "T.C. Kimlik": row.get("TC/Vergi No"), "İlçe": row.get("İlçe")})
        donor = Donor(organization_id=self.org_id, donor_type=DonorType.INDIVIDUAL, external_ref=ref, country="Türkiye",
                      total_donations=0, total_donated_cents=0, tags=["STK PRO"], allow_sms=bool(values["phone"]), **values)
        self.db.add(donor)
        await self.db.flush()
        if ref:
            self._donors[ref] = donor
        self.report.donors_created_from_donations += 1
        return donor

    async def import_donations(self, rows: list[dict]) -> None:
        from app.services.offline_donation import record_offline_donation

        await self._prepare()
        prefix = f"stkpro:{str(self.org_id)[:8]}:"
        existing = set((await self.db.execute(select(Donation.idempotency_key).where(
            Donation.organization_id == self.org_id, Donation.idempotency_key.like(f"{prefix}%")))).scalars())
        used_receipts = set((await self.db.execute(select(Donation.official_receipt_no).where(
            Donation.organization_id == self.org_id, Donation.official_receipt_no.isnot(None)))).scalars())
        senders: dict[str, Counter] = defaultdict(Counter)
        sender_names: dict[str, str] = {}
        staff_names = set(self._staff)

        # Oldest first, so donor first/last donation dates and kurban share order follow reality.
        def sort_key(r):
            try:
                return (_when(r.get("Bağış Tarihi")), int(_text(r.get("Bağış No")) or 0))
            except ValueError:
                return (datetime.max.replace(tzinfo=TZ), 0)

        for row in sorted(rows, key=sort_key):
            number = _text(row.get("Bağış No"), 40)
            key = f"{prefix}{number}"
            if not number:
                self.report.errors.append({"file": "tum_bagislar", "row": None, "message": "Bağış no boş"})
                continue
            if key in existing:
                self.report.donations_skipped += 1
                continue
            try:
                if fold(row.get("Durum")) not in ("odendi", ""):
                    raise ValueError(f"Ödenmemiş bağış ({row.get('Durum')})")
                amount = _cents(row.get("Toplam Tutar") if row.get("Toplam Tutar") is not None else row.get("Tutar"))
                if amount <= 0:
                    raise ValueError("Tutar sıfır")
                paid_at = _when(row.get("Bağış Tarihi"))
                currency = "TRY" if _text(row.get("Toplam Tutar Birimi")) in (None, "₺", "TL", "TRY") else {
                    "$": "USD", "€": "EUR"}.get(_text(row.get("Toplam Tutar Birimi")), "")
                if currency not in ("TRY", "USD", "EUR"):
                    raise ValueError(f"Para birimi: {row.get('Toplam Tutar Birimi')}")
            except ValueError as exc:
                self.report.errors.append({"file": "tum_bagislar", "bagis_no": number, "message": str(exc)})
                continue
            ckey = campaign_key(row.get("Kampanya Adı"), row.get("Tür"))
            campaign = await self._campaign(ckey)
            if not campaign:
                self.report.errors.append({"file": "tum_bagislar", "bagis_no": number,
                                           "message": f"Kampanya yok: {row.get('Kampanya Adı')}"})
                continue
            self.report.campaign_map[_text(row.get("Kampanya Adı")) or "-"] = (
                f"{ckey.title} ({ckey.kurban_type})" if ckey.kurban_type else ckey.title)
            donor = await self._donor_for_donation(row)
            method_label = _text(row.get("Ödeme Şekli")) or "Nakit"
            method = method_of(method_label)
            staff = self._staff.get(fold(row.get("Personel")))
            receipt_no = _text(row.get("Makbuz No"), 40)
            note = _text(row.get("Açıklama (Makbuz)"), 1000)
            quantity = int(_text(row.get("Adet")) or 1) if (_text(row.get("Adet")) or "1").isdigit() else 1
            donation, effects = await record_offline_donation(
                self.db, organization_id=self.org_id, campaign=campaign, donor=donor, amount_cents=amount,
                currency=currency, method=method, paid_at=paid_at, issued_by_id=(staff or self.actor).id,
                provider="stkpro", idempotency_key=key, send_receipt=False, quantity=quantity,
                note=note, on_behalf_of=_text(row.get("Kimin Adına"), 200),
                details={"stkpro_bagis_no": number, "stkpro_makbuz_no": receipt_no, "payment_channel": method_label,
                         "stkpro_campaign": _text(row.get("Kampanya Adı")), "stkpro_type": _text(row.get("Tipi")),
                         "staff": _text(row.get("Personel")), "country": _text(row.get("Kampanya Ülkesi"))},
                metadata={"kurban_type": ckey.kurban_type} if ckey.kurban_type else {},
            )
            if receipt_no and receipt_no not in used_receipts:
                donation.official_receipt_no = receipt_no  # one receipt can hold several donations: first one carries it
                used_receipts.add(receipt_no)
            if receipt_no and receipt_no.isdigit():
                self.report.last_receipt_no = max(self.report.last_receipt_no or 0, int(receipt_no))
            existing.add(key)
            self.report.donations_created += 1
            self.report.kurban_shares += effects.get("kurban_shares", 0)
            self.report.totals[method_label] += amount
            if method == PaymentMethod.BANK_TRANSFER and note:
                sender = parse_description(note).sender
                folded = fold(sender)
                if folded and folded not in staff_names:
                    senders[folded][donor.id] += 1
                    sender_names[folded] = sender
            if self.report.donations_created % 200 == 0:
                await self.db.flush()

        # Matcher memory: a sender seen for exactly one donor (or clearly mostly one) is learnt.
        for folded, counts in senders.items():
            (donor_id, top), *rest = counts.most_common()
            if rest and rest[0][1] * 2 > top:
                continue  # the same sender paid for different people evenly: leave it to a person
            await learn_sender(self.db, self.org_id, sender_names[folded], donor_id, source="import")
            self.report.sender_rules += 1
        await self.db.flush()


async def run(db: AsyncSession, organization_id: UUID, *, actor: User, donor_files: list[str],
              donation_files: list[str], commit: bool, create_campaigns: bool = True,
              campaign_status: CampaignStatus = CampaignStatus.ACTIVE) -> dict:
    importer = StkProImporter(db, organization_id, actor=actor, create_campaigns=create_campaigns,
                              campaign_status=campaign_status)
    try:
        for path in donor_files:
            await importer.import_donors(read_xlsx(path))
        for path in donation_files:
            await importer.import_donations(read_xlsx(path))
        if commit:
            await db.commit()
        else:
            await db.rollback()
    except Exception:
        await db.rollback()
        raise
    return {"committed": commit, **importer.report.as_dict()}
