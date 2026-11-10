"""Side effects of a confirmed donation on the Orta-package modules.

Called once per donation, inside the same transaction that confirms it (online
checkout finalisation and staff-entered receipts), so a donation and its kurban
shares / installment payments / well funding are committed together.
"""
from datetime import date, datetime, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.donation import Donation, Donor
from app.models.kurban import KURBAN_TYPES, KurbanCampaign, KurbanShare
from app.models.membership import Member, MemberDue
from app.services.ledger import post_donation, remove_source
from app.models.sponsorship import Pledge, PledgeInstallment, WellShare
from app.models.water_well import WaterWell

MAX_SHARES_PER_DONATION = 700


def normalize_kurban_type(value: Any) -> str:
    text = str(value or "").strip().lower()
    for key, label in KURBAN_TYPES.items():
        if text in {key, label.lower(), label.lower().replace("ü", "u").replace("ş", "s")}:
            return key
    return "vacip"


def _names(value: Any) -> list[str]:
    if isinstance(value, str):
        value = value.splitlines()
    if not isinstance(value, list):
        return []
    return [str(v).strip()[:200] for v in value if str(v).strip()]


async def create_kurban_shares(db: AsyncSession, donation: Donation, donor: Donor, quantity: int,
                               metadata: dict) -> list[KurbanShare]:
    campaign = (await db.execute(
        select(KurbanCampaign).where(
            KurbanCampaign.organization_id == donation.organization_id,
            KurbanCampaign.donation_campaign_id == donation.campaign_id,
        )
    )).scalar_one_or_none()
    if not campaign:
        return []
    if donation.currency == "TRY" and campaign.price_per_share_cents:
        count = donation.amount_cents // campaign.price_per_share_cents
    else:
        count = max(1, quantity)
    count = min(count, MAX_SHARES_PER_DONATION)
    if count <= 0:
        # Amount below one share: keep the donation, record why no share was created.
        donation.payment_details = {**(donation.payment_details or {}), "kurban_note": "Tutar bir hisse bedelinin altında"}
        return []
    names = _names(metadata.get("kurban_names"))
    kurban_type = normalize_kurban_type(metadata.get("kurban_type"))
    fallback_name = donation.on_behalf_of or donor.full_name
    shares = []
    for i in range(count):
        share = KurbanShare(
            organization_id=donation.organization_id,
            campaign_id=campaign.id,
            donation_id=donation.id,
            donor_id=donor.id,
            donor_name=donor.full_name or "Bağışçı",
            donor_phone=donor.phone or "",
            on_behalf_of=names[i] if i < len(names) else fallback_name,
            kurban_type=kurban_type,
        )
        db.add(share)
        shares.append(share)
    return shares


async def pay_installments(db: AsyncSession, donation: Donation, metadata: dict) -> list[PledgeInstallment]:
    """Mark pledge installments paid: the one named in metadata, else oldest pending ones it fully covers."""
    now = datetime.now(timezone.utc)
    paid: list[PledgeInstallment] = []
    explicit = metadata.get("pledge_installment_id")
    if explicit:
        try:
            installment_id = UUID(str(explicit))
        except ValueError:
            installment_id = None
        if installment_id:
            row = (await db.execute(
                select(PledgeInstallment).join(Pledge)
                .where(
                    PledgeInstallment.id == installment_id,
                    PledgeInstallment.status == "pending",
                    Pledge.organization_id == donation.organization_id,
                    Pledge.donor_id == donation.donor_id,
                )
            )).scalar_one_or_none()
            if row and donation.amount_cents >= row.amount_cents:
                row.status, row.donation_id, row.paid_at = "paid", donation.id, now
                paid.append(row)
                await db.flush()
                pledge = (await db.execute(
                    select(Pledge).options(selectinload(Pledge.installments)).where(Pledge.id == row.pledge_id)
                )).scalar_one()
                if all(i.status != "pending" for i in pledge.installments):
                    pledge.status = "completed"
        return paid

    pledges = (await db.execute(
        select(Pledge).options(selectinload(Pledge.installments))
        .where(
            Pledge.organization_id == donation.organization_id,
            Pledge.donor_id == donation.donor_id,
            Pledge.campaign_id == donation.campaign_id,
            Pledge.currency == donation.currency,
            Pledge.status == "active",
        )
        .order_by(Pledge.created_at)
    )).scalars().all()
    remaining = donation.amount_cents
    for pledge in pledges:
        for installment in pledge.installments:
            if installment.status != "pending":
                continue
            if remaining < installment.amount_cents:
                break
            installment.status, installment.donation_id, installment.paid_at = "paid", donation.id, now
            remaining -= installment.amount_cents
            paid.append(installment)
        if all(i.status != "pending" for i in pledge.installments):
            pledge.status = "completed"
        if remaining <= 0:
            break
    return paid


async def fund_water_well(db: AsyncSession, donation: Donation, donor: Donor) -> Optional[WaterWell]:
    well = (await db.execute(
        select(WaterWell).where(
            WaterWell.organization_id == donation.organization_id,
            WaterWell.donation_campaign_id == donation.campaign_id,
        ).with_for_update()
    )).scalar_one_or_none()
    if not well:
        return None
    if donation.currency == "TRY":
        well.collected_cents = (well.collected_cents or 0) + donation.amount_cents
    if well.funding_model == "hisseli" and well.share_price_cents and donation.currency == "TRY":
        count = donation.amount_cents // well.share_price_cents
        if count > 0:
            db.add(WellShare(
                organization_id=donation.organization_id, water_well_id=well.id, donor_id=donor.id,
                donation_id=donation.id, share_count=count, on_behalf_of=donation.on_behalf_of,
            ))
    if well.status in {"planned", "funding"} and well.target_cents and well.collected_cents >= well.target_cents:
        well.status = "drilling"
    return well


async def pay_member_dues(db: AsyncSession, donation: Donation, metadata: dict) -> list[MemberDue]:
    """Ödemede adı geçen açık aidatları kapatır; tutar hepsini karşılamıyorsa hiçbirini kapatmaz."""
    raw = metadata.get("member_due_ids") or []
    ids = []
    for value in raw if isinstance(raw, list) else [raw]:
        try:
            ids.append(UUID(str(value)))
        except ValueError:
            continue
    if not ids:
        return []
    dues = (await db.execute(
        select(MemberDue).join(Member, Member.id == MemberDue.member_id)
        .where(MemberDue.id.in_(ids), MemberDue.organization_id == donation.organization_id, MemberDue.status == "open")
        .order_by(MemberDue.due_date).with_for_update(of=MemberDue)
    )).scalars().all()
    if not dues or donation.currency != "TRY" or donation.amount_cents < sum(d.amount_cents for d in dues):
        donation.payment_details = {**(donation.payment_details or {}), "member_dues_note": "Aidat kapatılamadı (tutar / durum)"}
        return []
    now = datetime.now(timezone.utc)
    for due in dues:
        due.status, due.donation_id, due.paid_at = "paid", donation.id, now
    return list(dues)


async def on_donation_confirmed(db: AsyncSession, donation: Donation, donor: Donor, *,
                                quantity: int = 1, metadata: Optional[dict] = None) -> dict:
    metadata = metadata or {}
    shares = await create_kurban_shares(db, donation, donor, quantity, metadata)
    installments = await pay_installments(db, donation, metadata)
    well = await fund_water_well(db, donation, donor)
    dues = await pay_member_dues(db, donation, metadata)
    entry = await post_donation(db, donation)
    await db.flush()
    return {
        "kurban_shares": len(shares),
        "installments_paid": len(installments),
        "member_dues_paid": len(dues),
        "ledger_account_id": str(entry.account_id) if entry else None,
        "water_well_id": str(well.id) if well else None,
    }


def schedule_installments(pledge: Pledge) -> list[PledgeInstallment]:
    """Monthly installments starting at pledge.start_date (day clamped to month length)."""
    import calendar

    rows = []
    start: date = pledge.start_date
    for seq in range(pledge.installment_count):
        month_index = start.month - 1 + seq
        year, month = start.year + month_index // 12, month_index % 12 + 1
        day = min(start.day, calendar.monthrange(year, month)[1])
        rows.append(PledgeInstallment(seq=seq + 1, due_date=date(year, month, day), amount_cents=pledge.installment_amount_cents))
    return rows


class DonationEffectsLocked(Exception):
    """The donation already produced an irreversible effect (e.g. a slaughtered kurban)."""


async def on_donation_cancelled(db: AsyncSession, donation: Donation) -> dict:
    """Undo on_donation_confirmed for a cancelled/refunded donation."""
    from app.models.kurban import KurbanStatus

    shares = (await db.execute(select(KurbanShare).where(KurbanShare.donation_id == donation.id))).scalars().all()
    if any(s.status == KurbanStatus.SLAUGHTERED for s in shares):
        raise DonationEffectsLocked("Bu bağışa ait kurban kesilmiş; makbuz iptal edilemez")
    for share in shares:
        await db.delete(share)

    installments = (await db.execute(
        select(PledgeInstallment).options(selectinload(PledgeInstallment.pledge))
        .where(PledgeInstallment.donation_id == donation.id)
    )).scalars().all()
    for installment in installments:
        installment.status, installment.donation_id, installment.paid_at = "pending", None, None
        if installment.pledge.status == "completed":
            installment.pledge.status = "active"

    well = (await db.execute(
        select(WaterWell).where(
            WaterWell.organization_id == donation.organization_id,
            WaterWell.donation_campaign_id == donation.campaign_id,
        ).with_for_update()
    )).scalar_one_or_none()
    if well and donation.currency == "TRY":
        well.collected_cents = max(0, (well.collected_cents or 0) - donation.amount_cents)
    well_shares = (await db.execute(select(WellShare).where(WellShare.donation_id == donation.id))).scalars().all()
    for ws in well_shares:
        await db.delete(ws)
    dues = (await db.execute(select(MemberDue).where(MemberDue.donation_id == donation.id))).scalars().all()
    for due in dues:
        due.status, due.donation_id, due.paid_at = "open", None, None
    await remove_source(db, donation.organization_id, "donation", donation.id)
    await db.flush()
    return {"kurban_shares_removed": len(shares), "installments_reopened": len(installments), "member_dues_reopened": len(dues)}
