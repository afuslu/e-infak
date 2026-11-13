"""Organisation's own payment and SMS accounts: provider choice and encrypted credentials."""
import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import Permission, require_admin_route_feature, require_permission
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import rate_limit
from app.models.audit_log import AuditLog
from app.models.organization import Organization
from app.models.user import User
from app.payments import DEFAULT_PROVIDER as DEFAULT_PAYMENT, PROVIDERS as PAYMENT_PROVIDERS, build_provider
from app.services.tenant_credentials import (
    CredentialsUnavailable, get_credentials, masked, provider_spec, save_credentials, sms_account,
)
from app.sms import DEFAULT_PROVIDER as DEFAULT_SMS, PROVIDERS as SMS_PROVIDERS, SmsError, deliver

router = APIRouter(
    prefix="/admin-features/provider-accounts",
    tags=["provider-accounts"],
    dependencies=[Depends(require_admin_route_feature)],
)
settings_manager = require_permission(Permission.SETTINGS_MANAGE)

NOTES = {
    "paytr": "PayTR mağaza panelinde Bildirim URL olarak aşağıdaki adresi girin.",
    "nestpay": "Bankanızın 3D Pay Hosting (ortak ödeme sayfası) üye işyeri bilgileri. API kullanıcısı iade ve sorgu için gerekir.",
    "vakifkatilim": ("Vakıf Katılım Güvenli Ödeme Sayfası. kurumsal.vakifkatilim.com.tr üzerinden yalnızca e-infak için "
                     "ayrı bir API kullanıcısı açın (şifresi ödeme formunda tarayıcıya hash'li olarak gider) ve "
                     "sanalposdestek@vakifkatilim.com.tr'den sunucu IP'sine izin isteyin. Test ortamı yoktur: "
                     "gerçek kartla deneyip aynı gün iptal edin."),
    "iyzico": "iyzico panelinde Ayarlar › Firma Ayarları › API Anahtarları.",
    "ziraatpay": "Ziraat Pay üye işyeri panelinden alınan API bilgileri.",
    "verimor": "Verimor panelinde SMS ayarlarından API şifresi oluşturun ve sunucu IP adresine izin verin.",
    "iletimerkezi": "İleti Merkezi panelinde Ayarlar › Güvenlik › API Erişimi; ‘API kullanımına izin ver’ açık olmalı.",
    "netgsm": ("NetGSM portalında Alt Kullanıcı Hesapları'ndan türü \"API Kullanıcısı\" olan bir alt kullanıcı açın; "
               "abone numaranızı (850…) ve bu alt kullanıcının şifresini girin. API IP kısıtı kullanıyorsanız "
               "31.97.159.228 adresini ekleyin. SMS başlığı NetGSM'de onaylı olmalıdır."),
}


def _describe(provider: str, stored: dict | None, configured: bool) -> dict:
    spec = provider_spec(provider)
    return {
        "key": provider,
        "label": spec["label"],
        "note": NOTES.get(provider),
        "fields": [
            {"key": key, "label": label, "secret": key in spec["secret_fields"], "optional": key in spec["optional_fields"],
             "choices": spec.get("choices", {}).get(key)}
            for key, label in spec["fields"].items()
        ],
        "values": masked(provider, stored or {}),
        "configured": configured,
    }


async def _org(request: Request, db: AsyncSession) -> Organization:
    return await db.get(Organization, UUID(request.state.organization_id))


@router.get("")
async def list_accounts(request: Request, db: AsyncSession = Depends(get_db), _: User = Depends(settings_manager)):
    org = await _org(request, db)
    org_settings = org.settings or {}
    try:
        payment, sms = [], []
        for key in PAYMENT_PROVIDERS:
            stored = await get_credentials(db, org.id, key)
            payment.append(_describe(key, stored, build_provider(key, stored, tenant_slug=org.slug).configured))
        for key, cls in SMS_PROVIDERS.items():
            stored = await get_credentials(db, org.id, key)
            sms.append(_describe(key, stored, bool(stored) and cls(stored).configured))
        encryption_ready = True
    except CredentialsUnavailable:
        payment, sms, encryption_ready = [], [], False
    base = settings.PAYMENT_CALLBACK_BASE_URL.rstrip("/") or str(request.base_url).rstrip("/")
    return {
        "encryption_ready": encryption_ready,
        "live_payments_enabled": settings.PAYMENTS_LIVE_ENABLED,
        "payment_provider": org_settings.get("payment_provider") or DEFAULT_PAYMENT,
        "sms_provider": org_settings.get("sms_provider") or DEFAULT_SMS,
        "sms_platform_fallback": org_settings.get("sms_platform_fallback") is not False,
        "payment_providers": payment,
        "sms_providers": sms,
        "urls": {"paytr_notify": f"{base}/api/v1/payments/paytr/notify",
                 "vakifkatilim_return": f"{base}/api/v1/payments/vakifkatilim/return"},
    }


class CredentialsIn(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)


@router.put("/{provider}")
async def save_account(provider: str, payload: CredentialsIn, request: Request, db: AsyncSession = Depends(get_db),
                       current_user: User = Depends(settings_manager)):
    if provider not in PAYMENT_PROVIDERS and provider not in SMS_PROVIDERS:
        raise HTTPException(status_code=404, detail="Bilinmeyen sağlayıcı")
    org = await _org(request, db)
    try:
        stored = await save_credentials(db, org.id, provider, payload.values, actor=current_user.email)
    except CredentialsUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    # Field names only: values never go to the audit log.
    db.add(AuditLog(organization_id=org.id, user_id=current_user.id, action="entegrasyon_hesabi_guncelle",
                    details={"provider": provider, "fields": sorted(stored)}))
    await db.commit()
    configured = (build_provider(provider, stored).configured if provider in PAYMENT_PROVIDERS
                  else SMS_PROVIDERS[provider](stored).configured)
    return _describe(provider, stored, configured)


class SelectionIn(BaseModel):
    payment_provider: str | None = None
    sms_provider: str | None = None


@router.post("/selection")
async def select_providers(payload: SelectionIn, request: Request, db: AsyncSession = Depends(get_db),
                           current_user: User = Depends(settings_manager)):
    org = await _org(request, db)
    org_settings = dict(org.settings or {})
    if payload.payment_provider is not None:
        key = payload.payment_provider
        if key not in PAYMENT_PROVIDERS:
            raise HTTPException(status_code=400, detail="Bilinmeyen ödeme sağlayıcısı")
        stored = await get_credentials(db, org.id, key)
        if not build_provider(key, stored, tenant_slug=org.slug).configured:
            raise HTTPException(status_code=400, detail="Önce bu sağlayıcının hesap bilgilerini kaydedin")
        org_settings["payment_provider"] = key
    if payload.sms_provider is not None:
        key = payload.sms_provider
        if key not in SMS_PROVIDERS:
            raise HTTPException(status_code=400, detail="Bilinmeyen SMS sağlayıcısı")
        org_settings["sms_provider"] = key
    org.settings = org_settings
    flag_modified(org, "settings")
    db.add(AuditLog(organization_id=org.id, user_id=current_user.id, action="entegrasyon_saglayici_sec",
                    details={"payment_provider": org_settings.get("payment_provider"),
                             "sms_provider": org_settings.get("sms_provider")}))
    await db.commit()
    return {"payment_provider": org_settings.get("payment_provider") or DEFAULT_PAYMENT,
            "sms_provider": org_settings.get("sms_provider") or DEFAULT_SMS}


class SmsTestIn(BaseModel):
    phone: str = Field(min_length=10, max_length=20)


@router.post("/sms-test", dependencies=[Depends(rate_limit("sms-test", limit=5, window_seconds=600))])
async def send_test_sms(payload: SmsTestIn, request: Request, db: AsyncSession = Depends(get_db),
                        _: User = Depends(settings_manager)):
    org = await _org(request, db)
    account = await sms_account(db, org.id)
    if account.get("platform") or account.get("disabled"):
        raise HTTPException(status_code=400, detail="Kurumun kendi SMS hesabı yapılandırılmadı")
    try:
        result = await asyncio.to_thread(deliver, payload.phone, f"{org.name}: SMS ayarlarınız çalışıyor.", account)
    except SmsError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"provider": result.provider, "reference": result.reference}
