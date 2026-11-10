"""Bağış raporları.

Tüm raporlar yalnız onaylanmış (CONFIRMED) bağışları sayar; iade edilenler
hariçtir. Tarihler Türkiye saatine göre gruplanır ve tutarlar seçilen para
biriminde, kuruş cinsinden döner.
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import Date, Integer, cast, distinct, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin_route_feature, require_admin_route_permission, require_feature
from app.core.db import get_db
from app.core.plans import Feature
from app.models.campaign import Campaign, CampaignCategory, CampaignStatus
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod
from app.models.user import User

router = APIRouter(
    prefix="/admin-features/reports",
    tags=["reports"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

ADVANCED = [Depends(require_feature(Feature.REPORTS_ADVANCED))]
TZ = "Europe/Istanbul"
MAX_RANGE_DAYS = 366
MONTH_LABELS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
CATEGORY_LABELS = {
    CampaignCategory.GENEL: "Genel", CampaignCategory.EGITIM: "Eğitim", CampaignCategory.SAGLIK: "Sağlık",
    CampaignCategory.GIDA: "Gıda", CampaignCategory.SU: "Su", CampaignCategory.YETIM: "Yetim",
    CampaignCategory.KURBAN: "Kurban", CampaignCategory.INSAAT: "İnşaat", CampaignCategory.ZEKAT: "Zekât",
    CampaignCategory.FITRE: "Fitre", CampaignCategory.FIDYE: "Fidye", CampaignCategory.SADAKA: "Sadaka",
    CampaignCategory.ADAK: "Adak", CampaignCategory.AKIKA: "Akika",
}
PAYMENT_METHOD_LABELS = {
    PaymentMethod.CREDIT_CARD: "Kredi Kartı",
    PaymentMethod.BANK_TRANSFER: "Havale / EFT",
    PaymentMethod.CASH: "Nakit",
}

_local_ts = func.timezone(TZ, func.coalesce(Donation.paid_at, Donation.created_at))
_local_day = cast(_local_ts, Date)


def today_local() -> date:
    return datetime.now(ZoneInfo(TZ)).date()


def _org_id(request: Request) -> UUID:
    org_id = getattr(request.state, "organization_id", None)
    if not org_id:
        raise HTTPException(status_code=400, detail="Kurum bilgisi bulunamadı")
    return UUID(org_id)


def _confirmed(org_id: UUID, currency: str):
    return (
        Donation.organization_id == org_id,
        Donation.status == DonationStatus.CONFIRMED,
        Donation.currency == currency,
    )


def _range(start: Optional[date], end: Optional[date]) -> tuple[date, date]:
    today = today_local()
    start = start or date(today.year, 1, 1)
    end = end or today
    if end < start:
        raise HTTPException(status_code=422, detail="Bitiş tarihi başlangıçtan önce olamaz")
    if (end - start).days >= MAX_RANGE_DAYS:
        raise HTTPException(status_code=422, detail=f"Tarih aralığı en fazla {MAX_RANGE_DAYS} gün olabilir")
    return start, end


def _currency(value: str) -> str:
    value = value.upper()
    if value not in {"TRY", "USD", "EUR"}:
        raise HTTPException(status_code=422, detail="Desteklenmeyen para birimi")
    return value


async def monthly_totals(db: AsyncSession, org_id: UUID, year: int, currency: str = "TRY") -> list[dict]:
    month = cast(extract("month", _local_ts), Integer)
    rows = (await db.execute(
        select(
            month.label("month"),
            func.coalesce(func.sum(Donation.amount_cents), 0),
            func.count(Donation.id),
            func.count(distinct(Donation.donor_id)),
        )
        .where(*_confirmed(org_id, currency), extract("year", _local_ts) == year)
        .group_by(month)
    )).all()
    by_month = {int(r[0]): r for r in rows}
    return [
        {
            "month": m,
            "label": MONTH_LABELS[m - 1],
            "total_cents": int(by_month[m][1]) if m in by_month else 0,
            "count": int(by_month[m][2]) if m in by_month else 0,
            "donor_count": int(by_month[m][3]) if m in by_month else 0,
        }
        for m in range(1, 13)
    ]


async def last_months_totals(db: AsyncSession, org_id: UUID, months: int = 6, currency: str = "TRY") -> list[dict]:
    today = today_local()
    first = date(today.year, today.month, 1)
    for _ in range(months - 1):
        first = (first - timedelta(days=1)).replace(day=1)
    bucket = func.date_trunc("month", _local_ts)
    rows = (await db.execute(
        select(bucket, func.coalesce(func.sum(Donation.amount_cents), 0), func.count(Donation.id))
        .where(*_confirmed(org_id, currency), _local_day >= first)
        .group_by(bucket)
    )).all()
    by_key = {(r[0].year, r[0].month): r for r in rows}
    result = []
    cursor = first
    for _ in range(months):
        row = by_key.get((cursor.year, cursor.month))
        result.append({
            "year": cursor.year,
            "month": cursor.month,
            "label": f"{MONTH_LABELS[cursor.month - 1]} {cursor.year}",
            "total_cents": int(row[1]) if row else 0,
            "count": int(row[2]) if row else 0,
        })
        cursor = (cursor + timedelta(days=32)).replace(day=1)
    return result


async def payment_method_totals(db: AsyncSession, org_id: UUID, start: date, end: date, currency: str = "TRY") -> list[dict]:
    rows = (await db.execute(
        select(Donation.payment_method, func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0))
        .where(*_confirmed(org_id, currency), _local_day.between(start, end))
        .group_by(Donation.payment_method)
    )).all()
    return [
        {
            "method": r[0].value,
            "label": PAYMENT_METHOD_LABELS.get(r[0], r[0].value),
            "count": int(r[1]),
            "total_cents": int(r[2]),
        }
        for r in sorted(rows, key=lambda r: r[2], reverse=True)
    ]


async def dashboard_kpis(db: AsyncSession, org_id: UUID, currency: str = "TRY") -> dict:
    today = today_local()
    yesterday = today - timedelta(days=1)
    month_start = today.replace(day=1)
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)
    # Same day-of-month window last month, for a fair month-to-date comparison.
    last_month_same_day = min(
        last_month_start + timedelta(days=today.day - 1),
        month_start - timedelta(days=1),
    )

    async def total(start: date, end: date) -> int:
        return int((await db.execute(
            select(func.coalesce(func.sum(Donation.amount_cents), 0))
            .where(*_confirmed(org_id, currency), _local_day.between(start, end))
        )).scalar_one())

    first_gift = (
        select(func.min(_local_day).label("first_day"))
        .where(*_confirmed(org_id, currency))
        .group_by(Donation.donor_id)
        .subquery()
    )
    donors_with_gift = (await db.execute(select(func.count()).select_from(first_gift))).scalar_one()
    new_this_month = (await db.execute(
        select(func.count()).select_from(first_gift).where(first_gift.c.first_day >= month_start)
    )).scalar_one()
    active_campaigns = (await db.execute(
        select(func.count(Campaign.id)).where(Campaign.organization_id == org_id, Campaign.status == CampaignStatus.ACTIVE)
    )).scalar_one()
    return {
        "currency": currency,
        "today_cents": await total(today, today),
        "yesterday_cents": await total(yesterday, yesterday),
        "month_cents": await total(month_start, today),
        "last_month_to_date_cents": await total(last_month_start, last_month_same_day),
        "donor_count": int(donors_with_gift),
        "new_donors_this_month": int(new_this_month),
        "active_campaigns": int(active_campaigns),
    }


@router.get("/monthly")
async def monthly_report(
    request: Request,
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    currency: str = "TRY",
    db: AsyncSession = Depends(get_db),
):
    """Aylık bazda bağış raporu (tüm paketlerde)."""
    org_id = _org_id(request)
    year = year or today_local().year
    currency = _currency(currency)
    months = await monthly_totals(db, org_id, year, currency)
    return {
        "year": year,
        "currency": currency,
        "months": months,
        "total_cents": sum(m["total_cents"] for m in months),
        "count": sum(m["count"] for m in months),
        "payment_methods": await payment_method_totals(db, org_id, date(year, 1, 1), date(year, 12, 31), currency),
    }


@router.get("/daily", dependencies=ADVANCED)
async def daily_report(
    request: Request,
    start: Optional[date] = None,
    end: Optional[date] = None,
    currency: str = "TRY",
    db: AsyncSession = Depends(get_db),
):
    """Günlere göre yapılan toplam bağış."""
    org_id = _org_id(request)
    currency = _currency(currency)
    today = today_local()
    start, end = _range(start or today - timedelta(days=29), end)
    rows = (await db.execute(
        select(_local_day, func.coalesce(func.sum(Donation.amount_cents), 0), func.count(Donation.id))
        .where(*_confirmed(org_id, currency), _local_day.between(start, end))
        .group_by(_local_day)
    )).all()
    by_day = {r[0]: r for r in rows}
    days = []
    cursor = start
    while cursor <= end:
        row = by_day.get(cursor)
        days.append({
            "date": cursor.isoformat(),
            "total_cents": int(row[1]) if row else 0,
            "count": int(row[2]) if row else 0,
        })
        cursor += timedelta(days=1)
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "currency": currency,
        "days": days,
        "total_cents": sum(d["total_cents"] for d in days),
        "count": sum(d["count"] for d in days),
    }


@router.get("/yearly-comparison", dependencies=ADVANCED)
async def yearly_comparison(
    request: Request,
    years: int = Query(default=5, ge=2, le=10),
    currency: str = "TRY",
    db: AsyncSession = Depends(get_db),
):
    """Son N yılın ay ay karşılaştırması."""
    org_id = _org_id(request)
    currency = _currency(currency)
    this_year = today_local().year
    first_year = this_year - years + 1
    year_col = cast(extract("year", _local_ts), Integer)
    month_col = cast(extract("month", _local_ts), Integer)
    rows = (await db.execute(
        select(year_col, month_col, func.coalesce(func.sum(Donation.amount_cents), 0), func.count(Donation.id))
        .where(*_confirmed(org_id, currency), year_col >= first_year)
        .group_by(year_col, month_col)
    )).all()
    data = {(int(r[0]), int(r[1])): (int(r[2]), int(r[3])) for r in rows}
    result = []
    for year in range(first_year, this_year + 1):
        months = [data.get((year, m), (0, 0))[0] for m in range(1, 13)]
        counts = [data.get((year, m), (0, 0))[1] for m in range(1, 13)]
        result.append({"year": year, "months": months, "total_cents": sum(months), "count": sum(counts)})
    for previous, current in zip(result, result[1:]):
        current["change_pct"] = (
            round((current["total_cents"] - previous["total_cents"]) * 100 / previous["total_cents"], 1)
            if previous["total_cents"] else None
        )
    if result:
        result[0]["change_pct"] = None
    return {"currency": currency, "month_labels": MONTH_LABELS, "years": result}


@router.get("/campaigns", dependencies=ADVANCED)
async def campaign_report(
    request: Request,
    start: Optional[date] = None,
    end: Optional[date] = None,
    currency: str = "TRY",
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Kampanya bağış raporu; en çok bağış alan kampanyalar üstte."""
    org_id = _org_id(request)
    currency = _currency(currency)
    start, end = _range(start, end)
    total = func.coalesce(func.sum(Donation.amount_cents), 0)
    rows = (await db.execute(
        select(
            Campaign.id, Campaign.title, Campaign.slug, Campaign.status,
            Campaign.target_cents, Campaign.collected_cents,
            total, func.count(Donation.id), func.count(distinct(Donation.donor_id)), Campaign.category,
        )
        .join(Donation, Donation.campaign_id == Campaign.id)
        .where(Campaign.organization_id == org_id, *_confirmed(org_id, currency), _local_day.between(start, end))
        .group_by(Campaign.id)
        .order_by(total.desc())
        .limit(limit)
    )).all()
    grand_total = sum(int(r[6]) for r in rows)
    by_category = (await db.execute(
        select(Campaign.category, total, func.count(Donation.id))
        .join(Donation, Donation.campaign_id == Campaign.id)
        .where(Campaign.organization_id == org_id, *_confirmed(org_id, currency), _local_day.between(start, end))
        .group_by(Campaign.category)
        .order_by(total.desc())
    )).all()
    category_total = sum(int(r[1]) for r in by_category)
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "currency": currency,
        "total_cents": grand_total,
        "categories": [
            {
                "category": r[0].value,
                "label": CATEGORY_LABELS.get(r[0], r[0].value),
                "total_cents": int(r[1]),
                "count": int(r[2]),
                "share_pct": round(int(r[1]) * 100 / category_total, 1) if category_total else 0,
            }
            for r in by_category
        ],
        "campaigns": [
            {
                "id": str(r[0]),
                "title": r[1],
                "slug": r[2],
                "status": r[3].value if hasattr(r[3], "value") else r[3],
                "category": r[9].value,
                "target_cents": int(r[4] or 0),
                "progress_pct": round(min(100, (r[5] or 0) * 100 / r[4]), 1) if r[4] else None,
                "total_cents": int(r[6]),
                "count": int(r[7]),
                "donor_count": int(r[8]),
                "average_cents": int(r[6]) // int(r[7]) if r[7] else 0,
                "share_pct": round(int(r[6]) * 100 / grand_total, 1) if grand_total else 0,
            }
            for r in rows
        ],
    }


@router.get("/staff-receipts", dependencies=ADVANCED)
async def staff_receipt_report(
    request: Request,
    start: Optional[date] = None,
    end: Optional[date] = None,
    currency: str = "TRY",
    db: AsyncSession = Depends(get_db),
):
    """Personel makbuz raporu: havale onayı / mutabakatla makbuz kesen personel.

    Kartla yapılan online bağışlar "Online (otomatik)" satırında toplanır.
    """
    org_id = _org_id(request)
    currency = _currency(currency)
    start, end = _range(start, end)
    rows = (await db.execute(
        select(
            Donation.issued_by_id, User.first_name, User.last_name, User.email,
            func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0),
            func.max(Donation.paid_at),
        )
        .outerjoin(User, User.id == Donation.issued_by_id)
        .where(*_confirmed(org_id, currency), _local_day.between(start, end))
        .group_by(Donation.issued_by_id, User.first_name, User.last_name, User.email)
        .order_by(func.count(Donation.id).desc())
    )).all()
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "currency": currency,
        "staff": [
            {
                "user_id": str(r[0]) if r[0] else None,
                "name": f"{r[1]} {r[2]}".strip() if r[0] else "Online (otomatik)",
                "email": r[3],
                "count": int(r[4]),
                "total_cents": int(r[5]),
                "last_receipt_at": r[6],
            }
            for r in rows
        ],
    }


@router.get("/donors", dependencies=ADVANCED)
async def donor_report(
    request: Request,
    start: Optional[date] = None,
    end: Optional[date] = None,
    currency: str = "TRY",
    db: AsyncSession = Depends(get_db),
):
    """Detaylı bağışçı sayısı raporu."""
    org_id = _org_id(request)
    currency = _currency(currency)
    start, end = _range(start, end)

    total_donors = (await db.execute(
        select(func.count(Donor.id)).where(Donor.organization_id == org_id)
    )).scalar_one()

    first_gift = (
        select(Donation.donor_id.label("donor_id"), func.min(_local_day).label("first_day"))
        .where(*_confirmed(org_id, currency))
        .group_by(Donation.donor_id)
        .subquery()
    )
    active_in_range = (
        select(distinct(Donation.donor_id).label("donor_id"))
        .where(*_confirmed(org_id, currency), _local_day.between(start, end))
        .subquery()
    )
    active = (await db.execute(select(func.count()).select_from(active_in_range))).scalar_one()
    new = (await db.execute(
        select(func.count()).select_from(first_gift).where(first_gift.c.first_day.between(start, end))
    )).scalar_one()

    month_bucket = func.date_trunc("month", first_gift.c.first_day)
    new_by_month = (await db.execute(
        select(month_bucket, func.count())
        .select_from(first_gift)
        .where(first_gift.c.first_day.between(start, end))
        .group_by(month_bucket)
        .order_by(month_bucket)
    )).all()

    async def breakdown(column, limit: int = 10):
        label = func.coalesce(func.nullif(func.trim(column), ""), "Belirtilmemiş")
        rows = (await db.execute(
            select(label, func.count(Donor.id))
            .join(active_in_range, active_in_range.c.donor_id == Donor.id)
            .group_by(label)
            .order_by(func.count(Donor.id).desc())
            .limit(limit)
        )).all()
        return [{"label": str(r[0]), "count": int(r[1])} for r in rows]

    type_rows = (await db.execute(
        select(Donor.donor_type, func.count(Donor.id))
        .join(active_in_range, active_in_range.c.donor_id == Donor.id)
        .group_by(Donor.donor_type)
    )).all()

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "currency": currency,
        "total_donors": int(total_donors),
        "active_donors": int(active),
        "new_donors": int(new),
        "returning_donors": int(active) - int(new),
        "new_by_month": [
            {"label": f"{MONTH_LABELS[r[0].month - 1]} {r[0].year}", "count": int(r[1])} for r in new_by_month
        ],
        "by_type": [
            {"label": "Kurumsal" if (r[0].value if hasattr(r[0], "value") else r[0]) == "corporate" else "Bireysel", "count": int(r[1])}
            for r in type_rows
        ],
        "by_country": await breakdown(Donor.country),
        "by_city": await breakdown(Donor.city),
    }
