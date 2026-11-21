"""Mobile app endpoints: push device tokens, the staff notification inbox and its settings, and the
money-in overview the app's dashboard cards and home-screen widget read."""
from datetime import datetime, timedelta, timezone
from typing import Annotated, List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, has_capability
from app.core.db import get_db
from app.models.device_token import DeviceToken
from app.models.staff_notification import StaffNotification, StaffNotificationSetting
from app.models.user import User
from app.services import staff_notify
from app.services.push_service import notify_user_push

router = APIRouter(prefix="/mobile", tags=["mobile"])


class DeviceTokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=255)
    platform: Literal["ios", "android", "expo"] = "expo"


@router.post("/device-token", status_code=status.HTTP_201_CREATED)
async def register_device_token(
    request: Request,
    payload: DeviceTokenIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id_raw = getattr(request.state, "organization_id", None)
    org_id = UUID(org_id_raw) if org_id_raw else current_user.organization_id
    existing = (
        await db.execute(
            select(DeviceToken).where(
                DeviceToken.user_id == current_user.id,
                DeviceToken.token == payload.token,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.platform = payload.platform
        existing.organization_id = org_id
    else:
        db.add(
            DeviceToken(
                organization_id=org_id,
                user_id=current_user.id,
                token=payload.token,
                platform=payload.platform,
            )
        )
    await db.commit()
    return {"registered": True}


@router.delete("/device-token", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_device_token(
    payload: DeviceTokenIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        delete(DeviceToken).where(
            DeviceToken.user_id == current_user.id,
            DeviceToken.token == payload.token,
        )
    )
    await db.commit()


@router.post("/test-push")
async def test_push_notification(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sent = await notify_user_push(
        db,
        current_user.id,
        title="e-İnfak Bildirim Testi",
        body="Push bildirim altyapısı başarıyla çalışıyor.",
        data={"type": "test"},
    )
    if sent == 0:
        raise HTTPException(status_code=404, detail="Kayıtlı mobil cihaz token'ı bulunamadı")
    return {"sent": sent}


def _org(request: Request, user: User) -> UUID:
    raw = getattr(request.state, "organization_id", None)
    return UUID(raw) if raw else user.organization_id


# --- Notification inbox ---------------------------------------------------------------------------

def _note_out(n: StaffNotification) -> dict:
    return {
        "id": str(n.id), "kind": n.kind, "channel": n.channel, "title": n.title, "body": n.body,
        "amount_cents": n.amount_cents, "currency": n.currency, "data": n.data or {},
        "read": n.read_at is not None, "pushed": n.pushed > 0, "created_at": n.created_at,
    }


@router.get("/notifications")
async def list_notifications(
    request: Request,
    kind: Annotated[Optional[str], Query(max_length=32)] = None,
    unread_only: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org_id = _org(request, current_user)
    base = [StaffNotification.user_id == current_user.id, StaffNotification.organization_id == org_id]
    filters = list(base)
    if kind:
        filters.append(StaffNotification.kind.in_(kind.split(",")))
    if unread_only:
        filters.append(StaffNotification.read_at.is_(None))
    total = (await db.execute(select(func.count()).select_from(StaffNotification).where(*filters))).scalar() or 0
    unread = (await db.execute(select(func.count()).select_from(StaffNotification)
                               .where(*base, StaffNotification.read_at.is_(None)))).scalar() or 0
    rows = (await db.execute(select(StaffNotification).where(*filters)
                             .order_by(StaffNotification.created_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return {"items": [_note_out(n) for n in rows], "total": total, "unread": unread, "page": page, "page_size": page_size}


class ReadIn(BaseModel):
    ids: List[UUID] = Field(default_factory=list, max_length=500)
    all: bool = False


@router.post("/notifications/read")
async def mark_read(request: Request, payload: ReadIn, db: AsyncSession = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    org_id = _org(request, current_user)
    query = update(StaffNotification).where(
        StaffNotification.user_id == current_user.id, StaffNotification.organization_id == org_id,
        StaffNotification.read_at.is_(None))
    if not payload.all:
        if not payload.ids:
            return {"updated": 0}
        query = query.where(StaffNotification.id.in_(payload.ids))
    result = await db.execute(query.values(read_at=datetime.now(timezone.utc)))
    await db.commit()
    return {"updated": result.rowcount or 0}


# --- Notification settings ------------------------------------------------------------------------

class SettingsIn(BaseModel):
    online: Optional[bool] = None
    transfer: Optional[bool] = None
    transfer_waiting: Optional[bool] = None
    offline: Optional[bool] = None
    payment_failed: Optional[bool] = None
    refund: Optional[bool] = None
    digest: Optional[bool] = None
    quiet_hours: Optional[bool] = None
    min_amount_cents: Optional[int] = Field(default=None, ge=0, le=1_000_000_000)


def _settings_out(user: User, values: dict) -> dict:
    # Only the switches this person can actually receive are shown in the app.
    available = {
        "online": has_capability(user, "receipts.view_all"),
        "transfer": True,
        "offline": True,
        "transfer_waiting": has_capability(user, "bank.approve"),
        "payment_failed": has_capability(user, "receipts.view_all"),
        "refund": has_capability(user, "receipts.view_all"),
        "digest": has_capability(user, "receipts.view_all"),
    }
    return {"settings": values, "available": available}


async def _staff_user(db: AsyncSession, user: User) -> User:
    return (await db.execute(select(User).options(selectinload(User.staff_role)).where(User.id == user.id))).scalar_one()


@router.get("/notification-settings")
async def get_notification_settings(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = await _staff_user(db, current_user)
    return _settings_out(user, (await staff_notify.settings_for(db, [user.id]))[user.id])


@router.put("/notification-settings")
async def put_notification_settings(payload: SettingsIn, db: AsyncSession = Depends(get_db),
                                    current_user: User = Depends(get_current_user)):
    user = await _staff_user(db, current_user)
    row = await db.get(StaffNotificationSetting, user.id)
    current = staff_notify.merged(row.settings if row else None)
    current.update({k: v for k, v in payload.model_dump(exclude_none=True).items()})
    values = staff_notify.merged(current)
    if row:
        row.settings = values
    else:
        db.add(StaffNotificationSetting(user_id=user.id, settings=values))
    await db.commit()
    return _settings_out(user, values)


# --- Money-in overview (dashboard cards, home-screen widget) ---------------------------------------

@router.get("/inflow")
async def inflow_overview(
    request: Request,
    period: Literal["today", "week", "month"] = "today",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.automation import BankTransaction, ReconciliationStatus
    from app.models.donation import Donation, DonationStatus
    from app.models.payment import PaymentOrder, PaymentOrderStatus

    org_id = _org(request, current_user)
    user = await _staff_user(db, current_user)
    sees_all = has_capability(user, "receipts.view_all")
    mine = None if sees_all else user.id
    now = datetime.now(staff_notify.TZ)
    day_start, day_end = staff_notify.day_bounds(now)
    if period == "today":
        start, end = day_start, day_end
    elif period == "week":
        start, end = day_start - timedelta(days=now.weekday()), day_end
    else:
        start = staff_notify.day_bounds(now.replace(day=1))[0]
        end = day_end
    length = end - start
    current = await staff_notify.inflow_by_channel(db, org_id, start, end, mine)
    previous = await staff_notify.inflow_by_channel(db, org_id, start - length, start, mine)

    # Sparkline: hours for today, days otherwise (TRY only).
    bucket_hours = period == "today"
    query = select(Donation.paid_at, Donation.amount_cents).where(
        Donation.organization_id == org_id, Donation.status == DonationStatus.CONFIRMED, Donation.currency == "TRY",
        Donation.paid_at >= start, Donation.paid_at < end,
        Donation.payment_provider.not_in(list(staff_notify.SILENT_PROVIDERS)) | Donation.payment_provider.is_(None))
    if mine:
        query = query.where(Donation.issued_by_id == mine)
    size = 24 if bucket_hours else max(1, (end - start).days)
    series = [0] * size
    for paid_at, amount in (await db.execute(query)).all():
        local = paid_at.astimezone(staff_notify.TZ)
        index = local.hour if bucket_hours else (local.date() - start.astimezone(staff_notify.TZ).date()).days
        if 0 <= index < size:
            series[index] += amount

    recent_q = (select(Donation).options(selectinload(Donation.donor), selectinload(Donation.campaign))
                .where(Donation.organization_id == org_id, Donation.status == DonationStatus.CONFIRMED,
                       Donation.payment_provider.not_in(list(staff_notify.SILENT_PROVIDERS)) | Donation.payment_provider.is_(None))
                .order_by(Donation.paid_at.desc()).limit(15))
    if mine:
        recent_q = recent_q.where(Donation.issued_by_id == mine)
    recent = []
    for d in (await db.execute(recent_q)).scalars().all():
        channel = staff_notify.channel_of(d)
        recent.append({
            "id": str(d.id), "receipt_number": d.receipt_number, "amount_cents": d.amount_cents, "currency": d.currency,
            "channel": channel, "channel_label": staff_notify.CHANNEL_LABELS.get(channel, channel),
            "donor_id": str(d.donor_id), "donor_name": d.donor.full_name if d.donor else None, "is_anonymous": d.is_anonymous,
            "campaign_title": d.campaign.title if d.campaign else None, "paid_at": d.paid_at,
        })

    waiting = {"count": 0, "total_cents": 0}
    failed = 0
    if has_capability(user, "bank.approve") or sees_all:
        row = (await db.execute(select(func.count(), func.coalesce(func.sum(BankTransaction.amount_cents), 0)).where(
            BankTransaction.organization_id == org_id, BankTransaction.amount_cents > 0,
            BankTransaction.status.in_([ReconciliationStatus.UNMATCHED, ReconciliationStatus.AMBIGUOUS])))).one()
        waiting = {"count": int(row[0] or 0), "total_cents": int(row[1] or 0)}
    if sees_all:
        failed = int((await db.execute(select(func.count()).select_from(PaymentOrder).where(
            PaymentOrder.organization_id == org_id, PaymentOrder.created_at >= day_start,
            PaymentOrder.status.in_([PaymentOrderStatus.FAILED, PaymentOrderStatus.REVIEW])))).scalar() or 0)
    unread = (await db.execute(select(func.count()).select_from(StaffNotification).where(
        StaffNotification.user_id == user.id, StaffNotification.organization_id == org_id,
        StaffNotification.read_at.is_(None)))).scalar() or 0

    return {
        "period": period, "start": start, "end": end, "sees_all": sees_all, "currency": "TRY",
        **current, "previous_total_cents": previous["total_cents"], "previous_count": previous["count"],
        "series": series, "series_unit": "hour" if bucket_hours else "day",
        "recent": recent, "waiting_transfers": waiting, "failed_payments_today": failed, "unread_notifications": unread,
        "updated_at": datetime.now(timezone.utc),
    }
