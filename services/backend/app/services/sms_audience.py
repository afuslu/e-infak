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
from app.sms import normalize_tr_phone

AUDIENCE_KINDS = {
    "all_donors": "Tüm bağışçılar",
    "active_donors": "Son {months} ayda bağış yapanlar",
    "lapsed_donors": "{months} aydır bağış yapmayanlar",
    "tag": "Etiket: {tag}",
    "city": "Şehir: {city}",
    "campaign": "Kampanyaya bağış yapanlar: {campaign}",
    "members": "Aktif üyeler",
    "dues_overdue": "Aidatı geciken üyeler",
    "kurban": "{year} kurban bağışçıları",
    "numbers": "Numara listesi",
}


class Audience(BaseModel):
    kind: Literal["all_donors", "active_donors", "lapsed_donors", "tag", "city", "campaign", "members",
                  "dues_overdue", "kurban", "numbers"]
    months: int = Field(default=6, ge=1, le=120)
    tag: Optional[str] = Field(default=None, max_length=60)
    city: Optional[str] = Field(default=None, max_length=100)
    campaign_id: Optional[UUID] = None
    year: Optional[int] = Field(default=None, ge=2000, le=2100)
    numbers: Optional[str] = Field(default=None, max_length=400_000)
    # Informational messages only: also reach donors who have not given SMS permission.
    include_without_consent: bool = False


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
    return AUDIENCE_KINDS[audience.kind].format(
        months=audience.months, tag=audience.tag or "", city=audience.city or "", campaign=campaign,
        year=audience.year or "",
    )


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
        for part in re.split(r"[\n,;\t]+", audience.numbers or ""):
            if part.strip():
                add(part, True)  # the sender vouches for a pasted list
        return recipients, stats

    if audience.kind == "kurban":
        year = audience.year or datetime.now(timezone.utc).year
        rows = (await db.execute(
            select(KurbanShare.donor_phone, KurbanShare.donor_name, KurbanShare.donor_id, Donor.allow_sms)
            .join(KurbanCampaign, KurbanCampaign.id == KurbanShare.campaign_id)
            .outerjoin(Donor, Donor.id == KurbanShare.donor_id)
            .where(KurbanShare.organization_id == org_id, KurbanCampaign.season_year == year)
            .order_by(KurbanShare.created_at)
        )).all()
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
    elif audience.kind == "dues_overdue":
        query = query.where(exists().where(
            Member.donor_id == Donor.id, MemberDue.member_id == Member.id, MemberDue.status == "open",
            MemberDue.due_date < date.today()))
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
    return {
        "kinds": [{"key": key, "label": label.split(":")[0].replace("{months} ", "N ").replace("{year} ", "")
                   .replace("{months}", "N")} for key, label in AUDIENCE_KINDS.items()],
        "tags": sorted(t for t in tags if t), "cities": [c for c, _n in cities],
        "campaigns": [{"id": str(i), "title": t} for i, t in campaigns], "kurban_years": sorted(years, reverse=True),
    }
