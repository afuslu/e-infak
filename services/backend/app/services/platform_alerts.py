"""Platform console alerts: what needs an operator's attention in each organisation.

Each check is cheap (grouped counts), so the whole list is computed on request."""
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.plans import FEATURE_LABELS, Feature, org_bank_account_limit, org_features, org_user_limit
from app.models.automation import BankAccount
from app.models.kurban import KurbanShare
from app.models.membership import Member
from app.models.organization import Organization, OrganizationDomain
from app.models.sms_message import SmsMessage
from app.models.subscription import Subscription
from app.models.user import User, UserRole
from app.payments import build_provider
from app.services.tenant_credentials import CredentialsUnavailable, get_credentials

DANGER, WARNING, INFO = "danger", "warning", "info"
_ORDER = {DANGER: 0, WARNING: 1, INFO: 2}

# Data the organisation already holds for a module its package does not include: the module's
# pages are closed to its staff although the records are there (typical after a migration).
_DATA_FEATURES = [
    (Feature.KURBAN, KurbanShare, "kurban hissesi"),
    (Feature.BANK_TRANSACTIONS, BankAccount, "banka hesabı"),
    (Feature.MEMBERSHIP, Member, "üye"),
    (Feature.RECURRING, Subscription, "düzenli ödeme"),
]
NEVER_LOGGED_IN_AFTER = timedelta(days=3)


async def _counts(db: AsyncSession, model, *where) -> dict:
    query = select(model.organization_id, func.count()).group_by(model.organization_id)
    for clause in where:
        query = query.where(clause)
    return dict((await db.execute(query)).all())


def _alert(org: Organization, level: str, kind: str, message: str, hint: Optional[str] = None) -> dict:
    return {"organization_id": str(org.id), "organization_name": org.name, "level": level,
            "kind": kind, "message": message, "hint": hint}


async def collect(db: AsyncSession, org_id: Optional[UUID] = None) -> list[dict]:
    query = select(Organization).where(Organization.is_active.is_(True)).order_by(Organization.name)
    if org_id:
        query = query.where(Organization.id == org_id)
    orgs = (await db.execute(query)).scalars().all()
    if not orgs:
        return []

    seats = await _counts(db, User, User.is_active.is_(True), User.role != UserRole.PLATFORM_ADMIN)
    admins = await _counts(db, User, User.is_active.is_(True), User.role == UserRole.STK_ADMIN)
    stale_cutoff = datetime.now(timezone.utc) - NEVER_LOGGED_IN_AFTER
    never = await _counts(db, User, User.is_active.is_(True), User.last_login_at.is_(None),
                          User.created_at < stale_cutoff)
    bank_errors = await _counts(db, BankAccount, BankAccount.enabled.is_(True), BankAccount.last_error.is_not(None))
    data = {feature: await _counts(db, model) for feature, model, _ in _DATA_FEATURES}
    pending = {}
    for row in (await db.execute(select(OrganizationDomain).where(OrganizationDomain.status != "active"))).scalars():
        pending.setdefault(row.organization_id, []).append(row)

    now = datetime.now(timezone.utc)
    sms_stuck = await _counts(db, SmsMessage, SmsMessage.status == "queued",
                              SmsMessage.send_after < now - timedelta(minutes=15))
    sms_recent = await _counts(db, SmsMessage, SmsMessage.created_at > now - timedelta(days=7),
                               SmsMessage.status.in_(("sent", "delivered", "failed")))
    sms_failed = await _counts(db, SmsMessage, SmsMessage.created_at > now - timedelta(days=7),
                               SmsMessage.status == "failed")

    alerts: list[dict] = []
    for org in orgs:
        if sms_stuck.get(org.id):
            alerts.append(_alert(org, DANGER, "sms_stuck", f"{sms_stuck[org.id]} SMS 15 dakikadır kuyrukta bekliyor",
                                 "SMS işçisi (worker / beat) çalışmıyor olabilir."))
        if sms_recent.get(org.id, 0) >= 10 and sms_failed.get(org.id, 0) / sms_recent[org.id] >= 0.2:
            alerts.append(_alert(org, WARNING, "sms_failing",
                                 f"Son 7 günde SMS'lerin {round(100 * sms_failed[org.id] / sms_recent[org.id])}%'i başarısız "
                                 f"({sms_failed[org.id]} / {sms_recent[org.id]})",
                                 "Kurumun SMS Gönderimleri ekranındaki hata nedenlerine bakın (başlık, bakiye, IP izni)."))

        if not admins.get(org.id):
            alerts.append(_alert(org, DANGER, "no_admin", "Aktif kurum yöneticisi yok",
                                 "Kullanıcılar bölümünden bir hesabı Dernek Yöneticisi yapın."))

        used, limit = seats.get(org.id, 0), org_user_limit(org)
        if used > limit:
            alerts.append(_alert(org, DANGER, "seats_over", f"Kullanıcı sınırı aşılmış ({used} / {limit})",
                                 "Paketi yükseltin veya ek kullanıcı hakkı tanımlayın."))
        elif used >= limit:
            alerts.append(_alert(org, WARNING, "seats_full", f"Kullanıcı sınırı dolu ({used} / {limit}); yeni personel açılamaz",
                                 "Paketi yükseltin veya ek kullanıcı hakkı tanımlayın."))

        features = org_features(org)
        missing = [(f, data[f][org.id], label) for f, _, label in _DATA_FEATURES
                   if data[f].get(org.id) and f not in features]
        if missing:
            listed = ", ".join(f"{FEATURE_LABELS.get(f, f.value)} ({n} {label})" for f, n, label in missing)
            alerts.append(_alert(org, DANGER, "data_outside_plan", f"Verisi olan modüller pakette kapalı: {listed}",
                                 "Paketi yükseltin ya da ek modül olarak açın; personel bu sayfalara giremiyor."))
        banks = data[Feature.BANK_TRANSACTIONS].get(org.id, 0)
        bank_limit = org_bank_account_limit(org)
        if Feature.BANK_TRANSACTIONS in features and banks > bank_limit:
            alerts.append(_alert(org, WARNING, "bank_accounts_over", f"Banka hesabı sınırı aşılmış ({banks} / {bank_limit})"))
        if bank_errors.get(org.id):
            alerts.append(_alert(org, WARNING, "bank_sync_error",
                                 f"{bank_errors[org.id]} banka hesabında son senkronizasyon hata verdi"))

        for row in pending.get(org.id, []):
            detail = f" — {row.last_check_error}" if row.last_check_error else ""
            alerts.append(_alert(org, WARNING, "domain_pending", f"{row.domain} alan adı bekliyor{detail}",
                                 "Kurum DNS kayıtlarını girince “Doğrula”ya basın."))

        provider = (org.settings or {}).get("payment_provider") or "ziraatpay"
        try:
            stored = await get_credentials(db, org.id, provider)
            configured = build_provider(provider, stored, tenant_slug=org.slug).configured
        except (CredentialsUnavailable, KeyError, ValueError):
            configured = False
        if not configured:
            alerts.append(_alert(org, DANGER, "payment_missing", "Ödeme hesabı girilmemiş; sitede kartla bağış alınamaz",
                                 "Ödeme ve SMS hesapları bölümünden bilgileri girin."))

        if never.get(org.id):
            alerts.append(_alert(org, INFO, "never_logged_in", f"{never[org.id]} kullanıcı hesabı açıldığından beri hiç giriş yapmadı",
                                 "Şifresini sıfırlayıp kişiye yeniden iletin."))

    if not org_id and not settings.PLATFORM_PUBLIC_IP:
        alerts.insert(0, {"organization_id": None, "organization_name": "Platform", "level": WARNING,
                          "kind": "public_ip_missing", "message": "PLATFORM_PUBLIC_IP tanımlı değil; alan adı doğrulama ve SSL hazırlığı çalışmaz",
                          "hint": "Sunucudaki .env dosyasına ekleyip yeniden dağıtın."})
    alerts.sort(key=lambda a: _ORDER[a["level"]])
    return alerts
