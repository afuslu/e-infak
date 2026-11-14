"""Settings › security and records: IP allow/block lists, sign-in records, activity log, exchange rates.

Paths have no module word the route gate recognises, so writes need "Kurum ayarları" (settings_manage);
the lists check it (or personnel management) here as well, since they show staff activity.
"""
import asyncio
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Literal, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import String, cast, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Permission, get_current_user, has_permission, require_admin_route_feature, require_admin_route_permission
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.fx import FxRate
from app.models.ip_rule import OrgIpRule
from app.models.user import Session as UserSession
from app.models.user import User
from app.models.zakat_setting import ZakatSetting
from app.services.ip_rules import matches, normalise

router = APIRouter(
    prefix="/admin-features",
    tags=["security"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)
TZ = ZoneInfo("Europe/Istanbul")


def _org_id(request: Request) -> UUID:
    org_id = getattr(request.state, "organization_id", None)
    if not org_id:
        raise HTTPException(status_code=400, detail="Kurum bilgisi bulunamadı")
    return UUID(org_id)


def _ensure_supervisor(user: User) -> None:
    if not (has_permission(user, Permission.SETTINGS_MANAGE) or has_permission(user, Permission.USER_MANAGE)):
        raise HTTPException(status_code=403, detail="Bu kayıtları görme yetkiniz yok")


def _audit(db: AsyncSession, org_id: UUID, user: User, action: str, details: dict) -> None:
    db.add(AuditLog(organization_id=org_id, user_id=user.id, action=action, details=details))


async def _staff_names(db: AsyncSession, org_id: UUID) -> dict:
    rows = (await db.execute(select(User.id, User.first_name, User.last_name).where(User.organization_id == org_id))).all()
    return {r[0]: f"{r[1]} {r[2]}".strip() for r in rows}


def _bounds(start: Optional[date], end: Optional[date]):
    return (datetime.combine(start, time.min, TZ) if start else None,
            datetime.combine(end + timedelta(days=1), time.min, TZ) if end else None)


# --- IP rules ------------------------------------------------------------------------

class IpRuleIn(BaseModel):
    kind: Literal["allow", "block"]
    network: str = Field(min_length=3, max_length=64)
    note: Optional[str] = Field(default=None, max_length=200)
    user_id: Optional[UUID] = None  # allow only


@router.get("/ip-rules")
async def list_ip_rules(request: Request, kind: Literal["allow", "block"], db: AsyncSession = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    _ensure_supervisor(current_user)
    org_id = _org_id(request)
    names = await _staff_names(db, org_id)
    rows = (await db.execute(select(OrgIpRule).where(OrgIpRule.organization_id == org_id, OrgIpRule.kind == kind)
                             .order_by(OrgIpRule.created_at.desc()))).scalars().all()
    return {
        "your_ip": request.client.host if request.client else None,
        "items": [{"id": str(r.id), "network": r.network, "note": r.note, "created_at": r.created_at,
                   "user_id": str(r.user_id) if r.user_id else None, "user_name": names.get(r.user_id),
                   "created_by": names.get(r.created_by)} for r in rows],
    }


@router.post("/ip-rules", status_code=201)
async def create_ip_rule(request: Request, payload: IpRuleIn, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    try:
        network = normalise(payload.network)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Geçerli bir IP adresi veya aralık (ör. 81.213.241.0/24) girin") from exc
    own_ip = request.client.host if request.client else None
    if payload.kind == "block" and matches(own_ip, network):
        raise HTTPException(status_code=409, detail="Şu an bağlı olduğunuz IP adresini engelleyemezsiniz")
    if payload.user_id:
        if payload.kind == "block":
            raise HTTPException(status_code=422, detail="Engelleme kişiye değil, adrese uygulanır")
        if not (await db.execute(select(User.id).where(User.id == payload.user_id, User.organization_id == org_id))).first():
            raise HTTPException(status_code=404, detail="Personel bulunamadı")
    rule = OrgIpRule(organization_id=org_id, kind=payload.kind, network=network, note=(payload.note or "").strip() or None,
                     user_id=payload.user_id, created_by=current_user.id)
    db.add(rule)
    _audit(db, org_id, current_user, "ip_izin_ekle" if payload.kind == "allow" else "ip_engelle",
           {"network": network, "user_id": str(payload.user_id) if payload.user_id else None})
    await db.commit()
    return {"id": str(rule.id), "network": network}


@router.delete("/ip-rules/{rule_id}")
async def delete_ip_rule(request: Request, rule_id: UUID, db: AsyncSession = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    rule = (await db.execute(select(OrgIpRule).where(OrgIpRule.id == rule_id, OrgIpRule.organization_id == org_id))).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    _audit(db, org_id, current_user, "ip_kural_sil", {"kind": rule.kind, "network": rule.network})
    await db.delete(rule)
    await db.commit()
    return {"status": "deleted"}


# --- Sign-in records -----------------------------------------------------------------

@router.get("/login-logs")
async def login_logs(
    request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
    user_id: Optional[UUID] = None, ip: Annotated[Optional[str], Query(max_length=64)] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
    page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=200)] = 50,
):
    _ensure_supervisor(current_user)
    org_id = _org_id(request)
    where = [User.organization_id == org_id]
    if user_id:
        where.append(UserSession.user_id == user_id)
    if ip and ip.strip():
        where.append(UserSession.ip_address.ilike(f"%{ip.strip()}%"))
    lower, upper = _bounds(date_from, date_to)
    if lower:
        where.append(UserSession.created_at >= lower)
    if upper:
        where.append(UserSession.created_at < upper)
    base = select(UserSession, User).join(User, User.id == UserSession.user_id).where(*where)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.order_by(UserSession.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    now = datetime.now(timezone.utc)
    open_sessions = (await db.execute(
        select(func.count()).select_from(UserSession).join(User, User.id == UserSession.user_id)
        .where(User.organization_id == org_id, UserSession.revoked_at.is_(None), UserSession.expires_at > now)
    )).scalar_one()
    return {
        "total": total, "open_sessions": open_sessions,
        "items": [{"id": str(s.id), "user_id": str(u.id), "name": f"{u.first_name} {u.last_name}".strip(), "email": u.email,
                   "ip": s.ip_address, "user_agent": s.user_agent, "created_at": s.created_at,
                   "active": s.revoked_at is None and s.expires_at > now} for s, u in rows],
    }


@router.post("/login-logs/end-sessions")
async def end_sessions(request: Request, user_id: Optional[UUID] = None, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """Ends saved sign-ins ("beni hatırla"): of one staff member, or everyone except the caller."""
    org_id = _org_id(request)
    staff = select(User.id).where(User.organization_id == org_id)
    if user_id:
        staff = staff.where(User.id == user_id)
    else:
        staff = staff.where(User.id != current_user.id)
    result = await db.execute(update(UserSession).where(
        UserSession.user_id.in_(staff), UserSession.revoked_at.is_(None)).values(revoked_at=datetime.now(timezone.utc)))
    _audit(db, org_id, current_user, "oturumlari_kapat", {"user_id": str(user_id) if user_id else "herkes", "count": result.rowcount})
    await db.commit()
    return {"ended": result.rowcount or 0}


# --- Activity log --------------------------------------------------------------------

ACTION_LABELS = {
    "makbuz_elle_kes": "Makbuz kesildi", "makbuz_iptal": "Makbuz iptal edildi", "makbuz_odendi": "Makbuz ödendi yapıldı",
    "bagisci_olustur": "Bağışçı eklendi", "bagisci_guncelle": "Bağışçı güncellendi", "bagisci_sil": "Bağışçı silindi",
    "bagisci_sms": "Bağışçıya SMS", "sms_gonder": "SMS gönderildi", "toplu_sms_gonder": "Toplu SMS başlatıldı",
    "toplu_sms_iptal": "Toplu SMS durduruldu", "sms_sablon_ekle": "SMS şablonu eklendi", "sms_sablon_guncelle": "SMS şablonu güncellendi",
    "sms_sablon_sil": "SMS şablonu silindi", "havale_eslesme_kaldir": "Havale eşleştirmesi kaldırıldı",
    "kurban_kesim": "Kurban kesildi", "rol_olustur": "Rol oluşturuldu", "rol_guncelle": "Rol güncellendi", "rol_sil": "Rol silindi",
    "ip_izin_ekle": "IP izni eklendi", "ip_engelle": "IP engellendi", "ip_kural_sil": "IP kuralı silindi",
    "oturumlari_kapat": "Oturumlar kapatıldı", "kurlari_guncelle": "Kurlar güncellendi",
}


REQUEST_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")


def action_label(action: str) -> str:
    return ACTION_LABELS.get(action) or action.replace("_", " ").capitalize()


@router.get("/activity-logs")
async def activity_logs(
    request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
    user_id: Optional[UUID] = None, action: Annotated[Optional[str], Query(max_length=100)] = None,
    q: Annotated[Optional[str], Query(max_length=100)] = None, donor_id: Optional[UUID] = None,
    date_from: Optional[date] = None, date_to: Optional[date] = None,
    page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=200)] = 50,
    requests: bool = False,
):
    _ensure_supervisor(current_user)
    org_id = _org_id(request)
    where = [AuditLog.organization_id == org_id]
    if not requests and not action:
        # Raw request records ("POST /api/v1/…") written by the audit middleware hide the real work.
        where += [AuditLog.action.notlike(f"{method} %") for method in REQUEST_METHODS]
    if user_id:
        where.append(AuditLog.user_id == user_id)
    if action:
        where.append(AuditLog.action == action)
    if donor_id:
        where.append(cast(AuditLog.details, String).ilike(f"%{donor_id}%"))
    if q and q.strip():
        where.append(or_(cast(AuditLog.details, String).ilike(f"%{q.strip()}%"), AuditLog.action.ilike(f"%{q.strip()}%")))
    lower, upper = _bounds(date_from, date_to)
    if lower:
        where.append(AuditLog.created_at >= lower)
    if upper:
        where.append(AuditLog.created_at < upper)
    total = (await db.execute(select(func.count()).select_from(AuditLog).where(*where))).scalar_one()
    rows = (await db.execute(select(AuditLog).where(*where).order_by(AuditLog.created_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).scalars().all()
    actions = [a for a in (await db.execute(select(AuditLog.action).where(AuditLog.organization_id == org_id).distinct())).scalars().all()
               if not a.startswith(tuple(f"{m} " for m in REQUEST_METHODS))]
    names = await _staff_names(db, org_id)
    return {
        "total": total,
        "actions": sorted(({"key": a, "label": action_label(a)} for a in actions), key=lambda a: a["label"]),
        "items": [{"id": str(r.id), "action": r.action, "label": action_label(r.action), "details": r.details or {},
                   "user": names.get(r.user_id) if r.user_id else "Sistem", "created_at": r.created_at,
                   "donor_id": (r.details or {}).get("donor_id"), "donation_id": (r.details or {}).get("donation_id")}
                  for r in rows],
    }


# --- Exchange and gold rates ---------------------------------------------------------

# Gold coins and bracelets by their fine-gold content in grams (22 carat = 0.916).
GOLD_ITEMS = [("Gram altın (24 ayar)", 1.0), ("Çeyrek altın", 1.75 * 0.916), ("Yarım altın", 3.5 * 0.916),
              ("Tam altın", 7.0 * 0.916), ("Cumhuriyet altını", 7.216 * 0.916), ("22 ayar bilezik (gram)", 0.916)]
CURRENCY_NAMES = {"USD": "ABD Doları", "EUR": "Euro", "GBP": "İngiliz Sterlini", "CHF": "İsviçre Frangı",
                  "SAR": "Suudi Riyali", "AUD": "Avustralya Doları", "CAD": "Kanada Doları"}


@router.get("/exchange-rates")
async def exchange_rates(request: Request, db: AsyncSession = Depends(get_db)):
    org_id = _org_id(request)
    fx = (await db.execute(select(FxRate).order_by(FxRate.currency))).scalars().all()
    zakat = (await db.execute(select(ZakatSetting).where(ZakatSetting.organization_id == org_id))).scalar_one_or_none()
    gram = float(zakat.gold_price_per_gram) if zakat and zakat.gold_price_per_gram else None
    return {
        "currencies": [{"code": r.currency, "name": CURRENCY_NAMES.get(r.currency, r.currency), "rate": float(r.rate_try),
                        "fetched_at": r.fetched_at} for r in fx],
        "gold": [{"name": name, "price": round(gram * grams, 2)} for name, grams in GOLD_ITEMS] if gram else [],
        "gold_updated_at": zakat.updated_at if zakat else None,
        "source": "TCMB",
    }


@router.post("/exchange-rates/refresh")
async def refresh_exchange_rates(request: Request, db: AsyncSession = Depends(get_db),
                                 current_user: User = Depends(get_current_user)):
    """Fetches TCMB rates now (normally every hour) for currencies and this organisation's gold price."""
    from sqlalchemy.dialects.postgresql import insert

    from app.utils.tcmb import fetch_tcmb_currency_rates, fetch_tcmb_rates

    org_id = _org_id(request)
    try:
        fx = await asyncio.to_thread(fetch_tcmb_currency_rates)
    except Exception as exc:  # noqa: BLE001 - TCMB unreachable: keep the stored rates
        raise HTTPException(status_code=502, detail="TCMB kurlarına şu an ulaşılamadı; kayıtlı kurlar geçerli") from exc
    now = datetime.now(timezone.utc)
    for code, rate in fx.items():
        stmt = insert(FxRate).values(currency=code, rate_try=Decimal(str(rate)), fetched_at=now)
        await db.execute(stmt.on_conflict_do_update(index_elements=[FxRate.currency],
                                                    set_={"rate_try": stmt.excluded.rate_try, "fetched_at": now}))
    rates = await asyncio.to_thread(fetch_tcmb_rates, True)
    zakat = (await db.execute(select(ZakatSetting).where(ZakatSetting.organization_id == org_id))).scalar_one_or_none()
    if zakat and zakat.is_auto_sync and rates.get("GOLD_GRAM"):
        zakat.gold_price_per_gram = rates["GOLD_GRAM"]
        zakat.nisap_amount_lira = rates.get("NISAP_LIRA", zakat.nisap_amount_lira)
    _audit(db, org_id, current_user, "kurlari_guncelle", {"currencies": sorted(fx)})
    await db.commit()
    return await exchange_rates(request, db)
