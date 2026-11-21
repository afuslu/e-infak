"""Who a bulk SMS goes to: audiences resolved to unique, valid phone numbers."""
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor, DonorType
from app.models.kurban import KurbanCampaign, KurbanShare
from app.models.membership import Member, MemberDue
from app.models.sms_message import SmsMessage
from app.sms import normalize_tr_phone

AUDIENCE_KINDS = {
    "all_donors": "Tüm bağışçılar",
    "active_donors": "Son {months} ayda bağış yapanlar",
    "lapsed_donors": "{months} aydır bağış yapmayanlar",
    "never_donated": "Henüz bağış yapmamış kişiler",
    "tag": "Etiket: {tag}",
    "city": "Şehir: {city}",
    "campaign": "Kampanyaya bağış yapanlar: {campaign}",
    "members": "Aktif üyeler",
    "dues_overdue": "Aidatı geciken üyeler",
    "kurban": "{year} kurban bağışçıları",
    "numbers": "Numara listesi",
    "list": "Liste: {list_name}",
}


class Audience(BaseModel):
    kind: Literal["all_donors", "active_donors", "lapsed_donors", "never_donated", "tag", "city", "campaign", "members",
                  "dues_overdue", "kurban", "numbers", "list"]
    months: int = Field(default=6, ge=1, le=120)
    tag: Optional[str] = Field(default=None, max_length=60)
    city: Optional[str] = Field(default=None, max_length=100)
    campaign_id: Optional[UUID] = None
    year: Optional[int] = Field(default=None, ge=2000, le=2100)
    numbers: Optional[str] = Field(default=None, max_length=400_000)
    list_id: Optional[UUID] = None  # "SMS Listeleri": a saved recipient list
    # Informational messages only: also reach donors who have not given SMS permission.
    include_without_consent: bool = False
    # Optional combined segment refinements (ignored for raw pasted numbers).
    filter_city: Optional[str] = Field(default=None, max_length=100)
    filter_tag: Optional[str] = Field(default=None, max_length=60)
    filter_donor_type: Optional[Literal["individual", "corporate"]] = None
    min_total_lira: Optional[float] = Field(default=None, ge=0, le=100_000_000)
    exclude_recent_sms_days: Optional[int] = Field(default=None, ge=1, le=90)


@dataclass
class Recipient:
    phone: str
    donor_id: Optional[UUID] = None
    name: str = ""
    first_name: str = ""


def _valid(phone: Optional[str]) -> Optional[str]:
    number = normalize_tr_phone(phone or "")
    return number if 10 <= len(number) <= 15 else None


async def audience_label(db: AsyncSession, org_id: UUID, audience: Audience) -> str:
    campaign = ""
    if audience.kind == "campaign" and audience.campaign_id:
        campaign = (await db.execute(select(Campaign.title).where(
            Campaign.id == audience.campaign_id, Campaign.organization_id == org_id))).scalar() or ""
    list_name = ""
    if audience.kind == "list" and audience.list_id:
        from app.models.mailing import RecipientList

        list_name = (await db.execute(select(RecipientList.name).where(
            RecipientList.id == audience.list_id, RecipientList.organization_id == org_id))).scalar() or ""
    base = AUDIENCE_KINDS[audience.kind].format(
        months=audience.months, tag=audience.tag or "", city=audience.city or "", campaign=campaign,
        year=audience.year or "", list_name=list_name,
    )
    if audience.kind == "numbers":
        return base
    extras = []
    if audience.filter_city and audience.filter_city.strip():
        extras.append(f"Şehir: {audience.filter_city.strip()}")
    if audience.filter_tag and audience.filter_tag.strip():
        extras.append(f"Etiket: {audience.filter_tag.strip()}")
    if audience.filter_donor_type == "individual":
        extras.append("Bireysel")
    elif audience.filter_donor_type == "corporate":
        extras.append("Kurumsal")
    if audience.min_total_lira and audience.min_total_lira > 0:
        extras.append(f"Min {int(audience.min_total_lira):,} TL".replace(",", "."))
    if audience.exclude_recent_sms_days:
        extras.append(f"Son {audience.exclude_recent_sms_days}g hariç")
    return " · ".join([base, *extras]) if extras else base


def _apply_refinements(query, org_id: UUID, audience: Audience, now: datetime):
    if audience.filter_city and audience.filter_city.strip():
        query = query.where(func.lower(Donor.city) == audience.filter_city.strip().lower())
    if audience.filter_tag and audience.filter_tag.strip():
        query = query.where(Donor.tags.contains([audience.filter_tag.strip()]))
    if audience.filter_donor_type == "individual":
        query = query.where(Donor.donor_type == DonorType.INDIVIDUAL)
    elif audience.filter_donor_type == "corporate":
        query = query.where(Donor.donor_type == DonorType.CORPORATE)
    if audience.min_total_lira and audience.min_total_lira > 0:
        query = query.where(Donor.total_donated_cents >= int(audience.min_total_lira * 100))
    if audience.exclude_recent_sms_days:
        cutoff = now - timedelta(days=audience.exclude_recent_sms_days)
        query = query.where(~exists().where(
            SmsMessage.organization_id == org_id,
            SmsMessage.donor_id == Donor.id,
            SmsMessage.status.in_(("queued", "scheduled", "sent", "delivered")),
            SmsMessage.created_at >= cutoff,
        ))
    return query


async def resolve(db: AsyncSession, org_id: UUID, audience: Audience, *, commercial: bool = False,
                  ) -> tuple[list[Recipient], dict]:
    """Recipients (one per phone number) and how many people were left out, and why."""
    need_consent = commercial or not audience.include_without_consent
    stats = {"matched": 0, "no_phone": 0, "no_consent": 0, "invalid": 0, "duplicate": 0}
    seen: set[str] = set()
    recipients: list[Recipient] = []

    def add(phone, consent: bool, donor_id=None, name="", first_name="") -> None:
        stats["matched"] += 1
        if not phone or not str(phone).strip():
            stats["no_phone"] += 1
            return
        number = _valid(phone)
        if not number:
            stats["invalid"] += 1
        elif need_consent and not consent:
            stats["no_consent"] += 1
        elif number in seen:
            stats["duplicate"] += 1
        else:
            seen.add(number)
            recipients.append(Recipient(number, donor_id, name or "", first_name or ""))

    if audience.kind == "numbers":
        for line in re.split(r"[\r\n]+", audience.numbers or ""):
            raw_line = line.strip()
            if not raw_line:
                continue
            cols = [c.strip().strip('"').strip("'") for c in re.split(r"[,;\t]+", raw_line) if c.strip()]
            if len(cols) == 2 and bool(_valid(cols[0])) != bool(_valid(cols[1])):
                phone_col, name_col = (cols[0], cols[1]) if _valid(cols[0]) else (cols[1], cols[0])
                # Skip common CSV header lines like "telefon,ad_soyad"
                if any(ch.isdigit() for ch in phone_col):
                    add(phone_col, True, name=name_col, first_name=name_col.split(" ")[0])
                continue
            for part in cols:
                # Skip obvious CSV header words without any digits
                if not any(ch.isdigit() for ch in part):
                    continue
                add(part, True)  # the sender vouches for a pasted list
        return recipients, stats

    if audience.kind == "kurban":
        year = audience.year or datetime.now(timezone.utc).year
        now = datetime.now(timezone.utc)
        q_kurban = (
            select(KurbanShare.donor_phone, KurbanShare.donor_name, KurbanShare.donor_id, Donor.allow_sms)
            .join(KurbanCampaign, KurbanCampaign.id == KurbanShare.campaign_id)
            .outerjoin(Donor, Donor.id == KurbanShare.donor_id)
            .where(KurbanShare.organization_id == org_id, KurbanCampaign.season_year == year)
        )
        q_kurban = _apply_refinements(q_kurban, org_id, audience, now).order_by(KurbanShare.created_at)
        rows = (await db.execute(q_kurban)).all()
        for phone, name, donor_id, allow in rows:
            add(phone, bool(allow), donor_id, name, (name or "").split(" ")[0])
        return recipients, stats

    query = select(Donor.id, Donor.phone, Donor.allow_sms, Donor.first_name, Donor.last_name, Donor.company_name,
                   Donor.donor_type).where(Donor.organization_id == org_id)
    now = datetime.now(timezone.utc)
    if audience.kind == "active_donors":
        query = query.where(Donor.last_donation_at >= now - timedelta(days=30 * audience.months))
    elif audience.kind == "lapsed_donors":
        query = query.where(Donor.last_donation_at.is_not(None),
                            Donor.last_donation_at < now - timedelta(days=30 * audience.months))
    elif audience.kind == "never_donated":
        query = query.where(Donor.last_donation_at.is_(None))
    elif audience.kind == "tag":
        query = query.where(Donor.tags.contains([(audience.tag or "").strip()]))
    elif audience.kind == "city":
        query = query.where(func.lower(Donor.city) == (audience.city or "").strip().lower())
    elif audience.kind == "campaign":
        query = query.where(exists().where(
            Donation.donor_id == Donor.id, Donation.campaign_id == audience.campaign_id,
            Donation.status == DonationStatus.CONFIRMED))
    elif audience.kind == "members":
        query = query.where(exists().where(Member.donor_id == Donor.id, Member.status == "active"))
    elif audience.kind == "list":
        from app.models.mailing import RecipientList, RecipientListMember

        query = query.where(exists().where(
            RecipientListMember.donor_id == Donor.id, RecipientListMember.list_id == audience.list_id,
            RecipientList.id == RecipientListMember.list_id, RecipientList.organization_id == org_id))
    elif audience.kind == "dues_overdue":
        query = query.where(exists().where(
            Member.donor_id == Donor.id, MemberDue.member_id == Member.id, MemberDue.status == "open",
            MemberDue.due_date < date.today()))
    query = _apply_refinements(query, org_id, audience, now)
    for donor_id, phone, allow, first, last, company, donor_type in (await db.execute(query.order_by(Donor.created_at))).all():
        name = company if donor_type == DonorType.CORPORATE and company else f"{first} {last or ''}".strip()
        add(phone, bool(allow), donor_id, name, first)
    return recipients, stats


async def audience_options(db: AsyncSession, org_id: UUID) -> dict:
    """Choices for the audience form: tags, cities, campaigns and kurban years that exist."""
    tags = (await db.execute(
        select(func.jsonb_array_elements_text(Donor.tags)).where(
            Donor.organization_id == org_id, func.jsonb_typeof(Donor.tags) == "array").distinct()
    )).scalars().all()
    cities = (await db.execute(
        select(Donor.city, func.count(Donor.id)).where(Donor.organization_id == org_id, Donor.city.is_not(None),
                                                       Donor.city != "")
        .group_by(Donor.city).order_by(func.count(Donor.id).desc()).limit(100)
    )).all()
    campaigns = (await db.execute(
        select(Campaign.id, Campaign.title).where(Campaign.organization_id == org_id).order_by(Campaign.title)
    )).all()
    years = (await db.execute(
        select(KurbanCampaign.season_year).where(KurbanCampaign.organization_id == org_id,
                                                 KurbanCampaign.season_year.is_not(None)).distinct()
    )).scalars().all()
    from app.models.mailing import RecipientList

    lists = (await db.execute(
        select(RecipientList.id, RecipientList.name, RecipientList.member_count)
        .where(RecipientList.organization_id == org_id, RecipientList.channel == "sms").order_by(RecipientList.created_at.desc())
    )).all()
    return {
        "lists": [{"id": str(i), "name": n, "count": c} for i, n, c in lists],
        "kinds": [{"key": key, "label": label.split(":")[0].replace("{months} ", "N ").replace("{year} ", "")
                   .replace("{months}", "N")} for key, label in AUDIENCE_KINDS.items()],
        "tags": sorted(t for t in tags if t), "cities": [c for c, _n in cities],
        "campaigns": [{"id": str(i), "title": t} for i, t in campaigns], "kurban_years": sorted(years, reverse=True),
    }
