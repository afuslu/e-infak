"""Bağış raporları.

Tüm raporlar yalnız onaylanmış (CONFIRMED) bağışları sayar; iade edilenler
hariçtir. Tarihler Türkiye saatine göre gruplanır ve tutarlar seçilen para
biriminde, kuruş cinsinden döner.
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import Date, Integer, String, and_, case, cast, distinct, extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission, require_feature
from app.core.db import get_db
from app.core.plans import Feature
from app.models.campaign import Campaign, CampaignCategory, CampaignStatus
from app.models.donation import Donation, DonationStatus, Donor, PaymentMethod
from app.models.subscription import Subscription
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
    if value not in {"TRY", "USD", "EUR", "GBP", "SAR", "CHF"}:
        raise HTTPException(status_code=422, detail="Desteklenmeyen para birimi")
    return value


def _pct_delta(curr: int, prev: int) -> Optional[float]:
    if not prev:
        return None
    return round((curr - prev) * 100 / prev, 1)


async def _period_total(db: AsyncSession, org_id: UUID, start: date, end: date, currency: str) -> int:
    val = (await db.execute(
        select(func.coalesce(func.sum(Donation.amount_cents), 0))
        .where(*_confirmed(org_id, currency), _local_day.between(start, end))
    )).scalar_one()
    return int(val or 0)


async def _status_summary(db: AsyncSession, org_id: UUID, start: date, end: date, currency: str) -> dict:
    rows = (await db.execute(
        select(Donation.status, func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0))
        .where(Donation.organization_id == org_id, Donation.currency == currency, _local_day.between(start, end))
        .group_by(Donation.status)
    )).all()
    by_status = {r[0].value if hasattr(r[0], "value") else r[0]: (int(r[1]), int(r[2])) for r in rows}
    confirmed = by_status.get("confirmed", (0, 0))
    pending = by_status.get("pending", (0, 0))
    refunded = by_status.get("refunded", (0, 0))
    cancelled = by_status.get("cancelled", (0, 0))
    failed = by_status.get("failed", (0, 0))
    attempts = sum(v[0] for v in by_status.values())
    return {
        "confirmed_count": confirmed[0], "confirmed_cents": confirmed[1],
        "pending_count": pending[0], "pending_cents": pending[1],
        "refunded_count": refunded[0], "refunded_cents": refunded[1],
        "cancelled_count": cancelled[0], "cancelled_cents": cancelled[1],
        "failed_count": failed[0], "failed_cents": failed[1],
        "collection_rate_pct": round(confirmed[0] * 100 / attempts, 1) if attempts else 0.0,
    }


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

    sums_row = (await db.execute(
        select(
            func.coalesce(func.sum(case((_local_day == today, Donation.amount_cents), else_=0)), 0),
            func.coalesce(func.sum(case((_local_day == yesterday, Donation.amount_cents), else_=0)), 0),
            func.coalesce(func.sum(case((_local_day.between(month_start, today), Donation.amount_cents), else_=0)), 0),
            func.coalesce(func.sum(case((_local_day.between(last_month_start, last_month_same_day), Donation.amount_cents), else_=0)), 0),
        ).where(*_confirmed(org_id, currency), _local_day >= min(last_month_start, yesterday))
    )).one()

    first_gift = (
        select(func.min(_local_day).label("first_day"))
        .where(*_confirmed(org_id, currency))
        .group_by(Donation.donor_id)
        .subquery()
    )
    donor_counts = (await db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(case((first_gift.c.first_day >= month_start, 1), else_=0)), 0),
        ).select_from(first_gift)
    )).one()
    active_campaigns = (await db.execute(
        select(func.count(Campaign.id)).where(Campaign.organization_id == org_id, Campaign.status == CampaignStatus.ACTIVE)
    )).scalar_one()
    return {
        "currency": currency,
        "today_cents": int(sums_row[0] or 0),
        "yesterday_cents": int(sums_row[1] or 0),
        "month_cents": int(sums_row[2] or 0),
        "last_month_to_date_cents": int(sums_row[3] or 0),
        "donor_count": int(donor_counts[0] or 0),
        "new_donors_this_month": int(donor_counts[1] or 0),
        "active_campaigns": int(active_campaigns),
    }


@router.get("/monthly")
async def monthly_report(
    request: Request,
    year: Annotated[Optional[int], Query(ge=2000, le=2100)] = None,
    currency: str = "TRY",
    db: AsyncSession = Depends(get_db),
):
    """Aylık bazda bağış raporu (tüm paketlerde)."""
    org_id = _org_id(request)
    year = year or today_local().year
    currency = _currency(currency)
    months = await monthly_totals(db, org_id, year, currency)
    total_cents = sum(m["total_cents"] for m in months)
    prev_total = await _period_total(db, org_id, date(year - 1, 1, 1), date(year - 1, 12, 31), currency)
    return {
        "year": year,
        "currency": currency,
        "months": months,
        "total_cents": total_cents,
        "previous_year_total_cents": prev_total,
        "change_pct": _pct_delta(total_cents, prev_total),
        "count": sum(m["count"] for m in months),
        "payment_methods": await payment_method_totals(db, org_id, date(year, 1, 1), date(year, 12, 31), currency),
        "status_summary": await _status_summary(db, org_id, date(year, 1, 1), date(year, 12, 31), currency),
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
    total_cents = sum(d["total_cents"] for d in days)
    span = (end - start).days + 1
    prev_total = await _period_total(db, org_id, start - timedelta(days=span), start - timedelta(days=1), currency)
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "currency": currency,
        "days": days,
        "total_cents": total_cents,
        "previous_period_total_cents": prev_total,
        "change_pct": _pct_delta(total_cents, prev_total),
        "count": sum(d["count"] for d in days),
        "status_summary": await _status_summary(db, org_id, start, end, currency),
    }


@router.get("/yearly-comparison", dependencies=ADVANCED)
async def yearly_comparison(
    request: Request,
    years: Annotated[int, Query(ge=2, le=10)] = 5,
    ytd: bool = False,
    currency: str = "TRY",
    db: AsyncSession = Depends(get_db),
):
    """Son N yılın ay ay karşılaştırması."""
    org_id = _org_id(request)
    currency = _currency(currency)
    today = today_local()
    this_year = today.year
    first_year = this_year - years + 1
    year_col = cast(extract("year", _local_ts), Integer)
    month_col = cast(extract("month", _local_ts), Integer)
    day_col = cast(extract("day", _local_ts), Integer)
    conditions = [*_confirmed(org_id, currency), year_col >= first_year]
    if ytd:
        conditions.append(or_(month_col < today.month, and_(month_col == today.month, day_col <= today.day)))
    rows = (await db.execute(
        select(year_col, month_col, func.coalesce(func.sum(Donation.amount_cents), 0), func.count(Donation.id))
        .where(*conditions)
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
    return {"currency": currency, "ytd": ytd, "month_labels": MONTH_LABELS, "years": result}


@router.get("/campaigns", dependencies=ADVANCED)
async def campaign_report(
    request: Request,
    start: Optional[date] = None,
    end: Optional[date] = None,
    currency: str = "TRY",
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
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
    span = (end - start).days + 1
    prev_total = await _period_total(db, org_id, start - timedelta(days=span), start - timedelta(days=1), currency)
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "currency": currency,
        "total_cents": grand_total,
        "previous_period_total_cents": prev_total,
        "change_pct": _pct_delta(grand_total, prev_total),
        "status_summary": await _status_summary(db, org_id, start, end, currency),
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

    Bağışçısında temsilci/personel tanımlı olan online kart bağışları o personele yazılır;
    diğer online bağışlar "Online (otomatik)" satırında toplanır.
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

    span = (end - start).days + 1
    prev_start, prev_end = start - timedelta(days=span), start - timedelta(days=1)
    prev_active = (await db.execute(
        select(func.count(distinct(Donation.donor_id)))
        .where(*_confirmed(org_id, currency), _local_day.between(prev_start, prev_end))
    )).scalar_one()

    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "currency": currency,
        "total_donors": int(total_donors),
        "active_donors": int(active),
        "previous_active_donors": int(prev_active or 0),
        "active_change_pct": _pct_delta(int(active), int(prev_active or 0)),
        "new_donors": int(new),
        "returning_donors": int(active) - int(new),
        "retention_rate_pct": round((int(active) - int(new)) * 100 / int(active), 1) if active else 0.0,
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


@router.get("/recurring", dependencies=ADVANCED)
async def recurring_report(
    request: Request,
    currency: str = "TRY",
    db: AsyncSession = Depends(get_db),
):
    """Düzenli (abone) bağışlar: MRR, tahsilat modu, riskli/iptal analizi."""
    org_id = _org_id(request)
    currency = _currency(currency)
    rows = (await db.execute(
        select(
            Subscription.status,
            func.count(Subscription.id),
            func.coalesce(func.sum(Subscription.amount_cents), 0),
        )
        .where(Subscription.organization_id == org_id, Subscription.currency == currency)
        .group_by(Subscription.status)
    )).all()
    by_status = {r[0]: (int(r[1]), int(r[2])) for r in rows}
    active_cnt, mrr_cents = by_status.get("active", (0, 0))
    paused_cnt, _ = by_status.get("paused", (0, 0))
    cancelled_cnt, _ = by_status.get("cancelled", (0, 0))
    total_cnt = active_cnt + paused_cnt + cancelled_cnt

    at_risk = (await db.execute(
        select(func.count(Subscription.id))
        .where(
            Subscription.organization_id == org_id,
            Subscription.currency == currency,
            Subscription.status == "active",
            Subscription.failed_attempts > 0,
        )
    )).scalar_one()

    mode_rows = (await db.execute(
        select(
            Subscription.mode,
            func.count(Subscription.id),
            func.coalesce(func.sum(Subscription.amount_cents), 0),
        )
        .where(
            Subscription.organization_id == org_id,
            Subscription.currency == currency,
            Subscription.status == "active",
        )
        .group_by(Subscription.mode)
    )).all()
    mode_labels = {"card": "Otomatik Kart", "reminder": "SMS Hatırlatma"}

    camp_rows = (await db.execute(
        select(
            Campaign.id,
            Campaign.title,
            func.count(Subscription.id),
            func.coalesce(func.sum(Subscription.amount_cents), 0),
        )
        .join(Campaign, Campaign.id == Subscription.campaign_id)
        .where(
            Subscription.organization_id == org_id,
            Subscription.currency == currency,
            Subscription.status == "active",
        )
        .group_by(Campaign.id, Campaign.title)
        .order_by(func.sum(Subscription.amount_cents).desc())
        .limit(15)
    )).all()

    six_months_ago = today_local().replace(day=1)
    for _ in range(5):
        six_months_ago = (six_months_ago - timedelta(days=1)).replace(day=1)
    sub_bucket = func.date_trunc("month", func.timezone(TZ, Subscription.created_at))
    new_rows = (await db.execute(
        select(sub_bucket, func.count(Subscription.id), func.coalesce(func.sum(Subscription.amount_cents), 0))
        .where(
            Subscription.organization_id == org_id,
            Subscription.currency == currency,
            Subscription.created_at >= six_months_ago,
        )
        .group_by(sub_bucket)
        .order_by(sub_bucket)
    )).all()

    return {
        "currency": currency,
        "active_count": active_cnt,
        "paused_count": paused_cnt,
        "cancelled_count": cancelled_cnt,
        "total_count": total_cnt,
        "mrr_cents": mrr_cents,
        "arr_cents": mrr_cents * 12,
        "avg_amount_cents": (mrr_cents // active_cnt) if active_cnt else 0,
        "at_risk_count": int(at_risk or 0),
        "churn_rate_pct": round(cancelled_cnt * 100 / total_cnt, 1) if total_cnt else 0.0,
        "by_mode": [
            {
                "mode": r[0],
                "label": mode_labels.get(r[0], r[0]),
                "count": int(r[1]),
                "mrr_cents": int(r[2]),
            }
            for r in mode_rows
        ],
        "by_campaign": [
            {
                "campaign_id": str(r[0]),
                "title": r[1],
                "count": int(r[2]),
                "mrr_cents": int(r[3]),
            }
            for r in camp_rows
        ],
        "new_by_month": [
            {
                "label": f"{MONTH_LABELS[r[0].month - 1]} {r[0].year}",
                "count": int(r[1]),
                "mrr_cents": int(r[2]),
            }
            for r in new_rows
        ],
    }


async def _compute_derbis(db: AsyncSession, org_id: UUID, year: int) -> dict:
    from datetime import datetime, timezone
    from app.models.donation import Donation, DonationStatus
    from app.models.expense import Expense
    from app.models.receipt_book import ReceiptBook

    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

    income_rows = (
        await db.execute(
            select(Donation.payment_method, func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0))
            .where(
                Donation.organization_id == org_id,
                Donation.status == DonationStatus.CONFIRMED,
                Donation.paid_at >= start,
                Donation.paid_at < end,
            )
            .group_by(Donation.payment_method)
        )
    ).all()

    method_labels = {
        "cash": "Nakit / Makbuzlu Bağışlar",
        "bank_transfer": "Banka Havale / EFT Gelirleri",
        "credit_card": "Online Sanal POS Bağışları",
        "pos": "Fiziki POS Bağışları",
        "sms": "SMS Bağış Gelirleri",
    }
    incomes = [
        {
            "method": str(r[0].value if hasattr(r[0], "value") else r[0]),
            "label": method_labels.get(str(r[0].value if hasattr(r[0], "value") else r[0]), str(r[0])),
            "count": int(r[1]),
            "total_cents": int(r[2] or 0),
        }
        for r in income_rows
    ]
    total_income_cents = sum(x["total_cents"] for x in incomes)

    expense_rows = (
        await db.execute(
            select(Expense.category, func.count(Expense.id), func.coalesce(func.sum(Expense.amount_cents), 0))
            .where(
                Expense.organization_id == org_id,
                Expense.expense_date >= start.date(),
                Expense.expense_date < end.date(),
            )
            .group_by(Expense.category)
        )
    ).all()
    expenses = [
        {"category": str(r[0] or "Genel Gider"), "count": int(r[1]), "total_cents": int(r[2] or 0)}
        for r in expense_rows
    ]
    total_expense_cents = sum(x["total_cents"] for x in expenses)

    books = (
        await db.execute(select(ReceiptBook).where(ReceiptBook.organization_id == org_id))
    ).scalars().all()
    voided_sheets = sum(len(b.voided or []) for b in books)
    used_sheets = sum(max(0, (b.next_no - b.start_no)) for b in books)

    return {
        "year": year,
        "incomes": incomes,
        "total_income_cents": total_income_cents,
        "expenses": expenses,
        "total_expense_cents": total_expense_cents,
        "net_cents": total_income_cents - total_expense_cents,
        "receipt_books_count": len(books),
        "used_sheets": used_sheets,
        "voided_sheets": voided_sheets,
    }


def _optional_range(start: Optional[date], end: Optional[date]):
    """STK PRO reports: an empty range means "all time"."""
    if start and end and end < start:
        raise HTTPException(status_code=422, detail="Bitiş tarihi başlangıçtan önce olamaz")
    conditions = []
    if start:
        conditions.append(_local_day >= start)
    if end:
        conditions.append(_local_day <= end)
    return conditions


@router.get("/channels", dependencies=ADVANCED)
async def channel_report(request: Request, start: Optional[date] = None, end: Optional[date] = None,
                         currency: str = "TRY", db: AsyncSession = Depends(get_db)):
    """Bağış Kanalı Dağılımı: totals by payment method, and online vs staff-entered."""
    org_id = _org_id(request)
    currency = _currency(currency)
    where = [*_confirmed(org_id, currency), *_optional_range(start, end)]
    by_method = (await db.execute(
        select(Donation.payment_method, func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0))
        .where(*where).group_by(Donation.payment_method)
    )).all()
    channel = case(
        (Donation.payment_provider.like("bank:%"), "Banka eşleşmesi"),
        (Donation.payment_provider.in_(["manual", "stkpro"]), "Personel (makbuz)"),
        (Donation.payment_provider == "money_box", "Kumbara"),
        (Donation.payment_provider == "sms_donation", "SMS bağışı"),
        (Donation.payment_provider == "import", "Aktarım"),
        (or_(Donation.issued_by_id.is_(None),
             and_(Donation.payment_order_item_id.is_not(None), Donation.payment_method == PaymentMethod.CREDIT_CARD)),
         "Web (online)"),
        else_="Diğer",
    )
    by_channel = (await db.execute(
        select(channel, func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0)).where(*where).group_by(channel)
    )).all()
    return {
        "currency": currency,
        "methods": [{"label": PAYMENT_METHOD_LABELS.get(m, m.value), "count": int(c), "total_cents": int(t)}
                    for m, c, t in sorted(by_method, key=lambda r: r[2], reverse=True)],
        "channels": [{"label": l, "count": int(c), "total_cents": int(t)} for l, c, t in sorted(by_channel, key=lambda r: r[2], reverse=True)],
    }


@router.get("/sources", dependencies=ADVANCED)
async def source_report(request: Request, start: Optional[date] = None, end: Optional[date] = None,
                        db: AsyncSession = Depends(get_db)):
    """Bağışçı Kaynağı: donors by referral source (and membership type); the range applies to the join date."""
    from app.models.donation import Donor

    org_id = _org_id(request)
    joined = cast(func.timezone(TZ, Donor.created_at), Date)
    where = [Donor.organization_id == org_id]
    if start:
        where.append(joined >= start)
    if end:
        where.append(joined <= end)
    out = {}
    for key, column in (("sources", Donor.referral_source), ("membership_types", Donor.membership_type)):
        rows = (await db.execute(
            select(func.coalesce(column, "Belirtilmemiş"), func.count(Donor.id), func.coalesce(func.sum(Donor.total_donated_cents), 0))
            .where(*where).group_by(func.coalesce(column, "Belirtilmemiş")).order_by(func.count(Donor.id).desc())
        )).all()
        out[key] = [{"label": l, "count": int(c), "total_cents": int(t)} for l, c, t in rows]
    return out


TYPE_LABELS = {"standard": "Standart", "sponsorship": "Sponsorluk", "kurban": "Kurban", "water_well": "Su Kuyusu",
               "project": "Proje", "food_package": "Kumanya"}


@router.get("/types", dependencies=ADVANCED)
async def type_report(request: Request, start: Optional[date] = None, end: Optional[date] = None,
                      currency: str = "TRY", db: AsyncSession = Depends(get_db)):
    """Türlere Göre Bağış: by campaign type (Standart, Kurban, Su Kuyusu…) and by donation category."""
    org_id = _org_id(request)
    currency = _currency(currency)
    where = [*_confirmed(org_id, currency), *_optional_range(start, end)]
    by_type = (await db.execute(
        select(Campaign.campaign_type, func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0))
        .join(Campaign, Campaign.id == Donation.campaign_id).where(*where).group_by(Campaign.campaign_type)
    )).all()
    by_category = (await db.execute(
        select(Campaign.category, func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0))
        .join(Campaign, Campaign.id == Donation.campaign_id).where(*where).group_by(Campaign.category)
    )).all()
    return {
        "currency": currency,
        "types": [{"label": TYPE_LABELS.get(t, t), "count": int(c), "total_cents": int(v)} for t, c, v in sorted(by_type, key=lambda r: r[2], reverse=True)],
        "categories": [{"label": CATEGORY_LABELS.get(k, str(k)), "count": int(c), "total_cents": int(v)} for k, c, v in sorted(by_category, key=lambda r: r[2], reverse=True)],
    }


@router.get("/stk-dashboard")
async def stk_dashboard(request: Request, year: Optional[int] = None, month: Optional[int] = None,
                        db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """STK PRO Anasayfa cards and the "Günlere Göre Yapılan Bağışlar" chart of one month."""
    from app.models.automation import BankTransaction, ReconciliationStatus
    from app.models.donation import Donor
    from app.models.kurban import KurbanShare, KurbanStatus
    from app.models.payment import PaymentOrder, PaymentOrderStatus

    org_id = _org_id(request)
    today = today_local()
    now = datetime.now(ZoneInfo(TZ))
    since = now - timedelta(days=30)
    receipt_key = func.coalesce(cast(Donation.receipt_seq, String), Donation.payment_details["receipt_group"].astext,
                                cast(Donation.id, String))
    today_row = (await db.execute(
        select(func.count(distinct(receipt_key)), func.coalesce(func.sum(Donation.amount_cents), 0))
        .where(*_confirmed(org_id, "TRY"), _local_day == today)
    )).one()
    donors_today = (await db.execute(select(func.count(Donor.id)).where(
        Donor.organization_id == org_id, cast(func.timezone(TZ, Donor.created_at), Date) == today))).scalar_one()
    donors_total = (await db.execute(select(func.count(Donor.id)).where(Donor.organization_id == org_id))).scalar_one()
    # Paid online but no donation written yet (the payment callback did not finish).
    stuck_online = (await db.execute(select(func.count(PaymentOrder.id)).where(
        PaymentOrder.organization_id == org_id, PaymentOrder.created_at >= since,
        PaymentOrder.status == PaymentOrderStatus.PROCESSING,
        PaymentOrder.created_at < now - timedelta(minutes=15),
    ))).scalar_one()
    unmatched_bank = (await db.execute(select(func.count(BankTransaction.id)).where(
        BankTransaction.organization_id == org_id, BankTransaction.booked_at >= since, BankTransaction.amount_cents > 0,
        BankTransaction.status.in_([ReconciliationStatus.UNMATCHED, ReconciliationStatus.AMBIGUOUS]),
    ))).scalar_one()
    unassigned_kurban = (await db.execute(select(func.count(KurbanShare.id)).where(
        KurbanShare.organization_id == org_id, KurbanShare.animal_id.is_(None), KurbanShare.status == KurbanStatus.WAITING,
    ))).scalar_one()

    year = year or today.year
    month = month or today.month
    if not (2000 <= year <= 2100 and 1 <= month <= 12):
        raise HTTPException(status_code=422, detail="Geçersiz ay")
    first = date(year, month, 1)
    last = (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    rows = dict((await db.execute(
        select(_local_day, func.coalesce(func.sum(Donation.amount_cents), 0))
        .where(*_confirmed(org_id, "TRY"), _local_day.between(first, last)).group_by(_local_day)
    )).all())
    days = [{"day": d, "total_cents": int(rows.get(first + timedelta(days=d - 1), 0))} for d in range(1, last.day + 1)]
    return {
        "today_receipts": int(today_row[0] or 0), "today_cents": int(today_row[1] or 0),
        "donors_today": int(donors_today), "donors_total": int(donors_total),
        "unmatched_online_30d": int(stuck_online), "unmatched_bank_30d": int(unmatched_bank),
        "unassigned_kurban": int(unassigned_kurban),
        "year": year, "month": month, "days": days,
    }


@router.get("/derbis-summary")
async def derbis_summary(
    request: Request,
    year: int = 2026,
    db: AsyncSession = Depends(get_db),
):
    org_id = UUID(request.state.organization_id)
    return await _compute_derbis(db, org_id, year)


@router.get("/derbis-summary.pdf")
async def derbis_summary_pdf(
    request: Request,
    year: int = 2026,
    db: AsyncSession = Depends(get_db),
):
    from fastapi.responses import Response
    from app.models.organization import Organization
    from app.utils.report_pdf import build_report_pdf

    org_id = UUID(request.state.organization_id)
    org = await db.get(Organization, org_id)
    data = await _compute_derbis(db, org_id, year)

    rows = [
        ["GELİR", x["label"], str(x["count"]), f"{x['total_cents'] / 100:,.2f} TL"]
        for x in data["incomes"]
    ] + [
        ["GİDER", x["category"], str(x["count"]), f"{x['total_cents'] / 100:,.2f} TL"]
        for x in data["expenses"]
    ]
    if not rows:
        rows = [["—", f"{year} yılı için kayıt bulunamadı", "0", "0,00 TL"]]

    pdf_bytes = build_report_pdf(
        title=f"{year} Yılı DERBİS & Yardım Toplama İcmal Raporu",
        subtitle=f"Kurum: {org.legal_name if org else ''} · Makbuz Koçanı: {data['receipt_books_count']} adet ({data['used_sheets']} kesilen, {data['voided_sheets']} iptal/zayi)",
        headers=["Tür", "Kalem / Hesap", "Adet", "Tutar"],
        rows=rows,
        org_name=org.name if org else "E-İnfak",
        organization=org,
        summary={
            "Toplam Gelir": f"{data['total_income_cents'] / 100:,.2f} TL",
            "Toplam Gider": f"{data['total_expense_cents'] / 100:,.2f} TL",
            "Dönem Net Bakiye": f"{data['net_cents'] / 100:,.2f} TL",
        },
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="derbis-icmal-{year}.pdf"'},
    )


@router.get("/derbis-export", dependencies=ADVANCED)
async def derbis_csv_export(
    request: Request,
    kind: str = Query("receipts", pattern="^(members|receipts|aid)$"),
    year: int = Query(default_factory=lambda: datetime.now(timezone.utc).year, ge=2000, le=2100),
    db: AsyncSession = Depends(get_db),
):
    """DERBİS / Excel uyumlu UTF-8 BOM CSV dışa aktarımı (üyeler, makbuzlar, yardımlar)."""
    import csv
    import io
    from app.models.donation import Donor
    from app.models.field_ops import AidDistribution, AidRecipient

    org_id = _org_id(request)
    buf = io.StringIO()
    buf.write("\ufeff")  # UTF-8 BOM for Turkish Excel / DERBİS import
    writer = csv.writer(buf, delimiter=";")

    if kind == "members":
        from app.models.membership import Member
        writer.writerow(["Üye No", "Ad", "Soyad", "TCKN", "Telefon", "E-posta", "Üyelik Tarihi", "Durum"])
        rows = (await db.execute(
            select(Member).where(Member.organization_id == org_id).order_by(Member.created_at.desc())
        )).scalars().all()
        for m in rows:
            writer.writerow([
                getattr(m, "member_number", "") or "",
                getattr(m, "first_name", "") or "",
                getattr(m, "last_name", "") or "",
                getattr(m, "national_id", "") or "",
                getattr(m, "phone", "") or "",
                getattr(m, "email", "") or "",
                m.joined_at.strftime("%d.%m.%Y") if getattr(m, "joined_at", None) else "",
                getattr(m, "status", "") or "",
            ])
    elif kind == "aid":
        writer.writerow(["Tarih", "İhtiyaç Sahibi", "Telefon", "Bölge", "Tutar (TL)", "Not"])
        rows = (await db.execute(
            select(AidDistribution, AidRecipient)
            .join(AidRecipient, AidRecipient.id == AidDistribution.recipient_id)
            .where(
                AidDistribution.organization_id == org_id,
                extract("year", func.timezone(TZ, AidDistribution.distributed_at)) == year,
            )
            .order_by(AidDistribution.distributed_at.desc())
        )).all()
        for dist, rec in rows:
            writer.writerow([
                dist.distributed_at.strftime("%d.%m.%Y") if dist.distributed_at else "",
                rec.full_name or "",
                rec.phone or "",
                getattr(rec, "address", "") or "",
                f"{(getattr(dist, 'amount_cents', 0) or 0) / 100:.2f}",
                getattr(dist, "notes", "") or "",
            ])
    else:
        writer.writerow(["Makbuz No", "Tarih", "Bağışçı", "Telefon", "Kampanya", "Ödeme Yöntemi", "Tutar", "Para Birimi"])
        rows = (await db.execute(
            select(Donation, Donor, Campaign)
            .outerjoin(Donor, Donor.id == Donation.donor_id)
            .outerjoin(Campaign, Campaign.id == Donation.campaign_id)
            .where(
                Donation.organization_id == org_id,
                Donation.status == DonationStatus.CONFIRMED,
                extract("year", func.timezone(TZ, func.coalesce(Donation.paid_at, Donation.created_at))) == year,
            )
            .order_by(func.coalesce(Donation.paid_at, Donation.created_at).desc())
        )).all()
        for d, donor, camp in rows:
            dt = d.paid_at or d.created_at
            writer.writerow([
                d.receipt_number or "",
                dt.strftime("%d.%m.%Y") if dt else "",
                donor.full_name if donor else "Anonim",
                donor.phone if donor else "",
                camp.title if camp else "Genel Bağış",
                PAYMENT_METHOD_LABELS.get(d.payment_method, str(d.payment_method or "")),
                f"{(d.amount_cents or 0) / 100:.2f}",
                d.currency or "TRY",
            ])

    return Response(
        content=buf.getvalue().encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="derbis-{kind}-{year}.csv"'},
    )


@router.get("/donor-segments", dependencies=ADVANCED)
async def donor_segments(request: Request, db: AsyncSession = Depends(get_db)):
    """Akıllı bağışçı segmentasyonu: pasifleşenler, yüksek tutarlılar, düzenli/tekrarlı ve yeni bağışçılar."""
    from app.models.donation import Donor

    org_id = _org_id(request)
    now = datetime.now(timezone.utc)
    cutoff_90 = now - timedelta(days=90)
    cutoff_30 = now - timedelta(days=30)

    dormant = int((await db.execute(select(func.count(Donor.id)).where(
        Donor.organization_id == org_id, Donor.donation_count > 0, Donor.last_donation_at < cutoff_90
    ))).scalar() or 0)
    high_value = int((await db.execute(select(func.count(Donor.id)).where(
        Donor.organization_id == org_id, Donor.total_donated_cents >= 1_000_000  # 10.000+ TL
    ))).scalar() or 0)
    repeat_donors = int((await db.execute(select(func.count(Donor.id)).where(
        Donor.organization_id == org_id, Donor.donation_count >= 2
    ))).scalar() or 0)
    recent_30 = int((await db.execute(select(func.count(Donor.id)).where(
        Donor.organization_id == org_id, Donor.created_at >= cutoff_30
    ))).scalar() or 0)

    return {
        "segments": [
            {"key": "dormant_90d", "label": "90+ Gündür Pasif Bağışçılar", "count": dormant, "description": "Daha önce bağış yapmış ancak son 90 günde bağış yapmamış kişiler"},
            {"key": "high_value", "label": "Yüksek Tutarlı Bağışçılar (10.000+ ₺)", "count": high_value, "description": "Toplam bağış tutarı 10.000 TL ve üzerinde olan bağışçılar"},
            {"key": "repeat_donors", "label": "Sadık / Tekrarlı Bağışçılar (2+)", "count": repeat_donors, "description": "En az 2 kez bağış yapmış bağışçılar"},
            {"key": "recent_30d", "label": "Son 30 Gün Yeni Bağışçılar", "count": recent_30, "description": "Son 30 gün içinde sisteme dahil olan bağışçılar"},
        ]
    }
