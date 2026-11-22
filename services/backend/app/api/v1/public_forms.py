from typing import Optional

from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from app.core.config import settings
from app.core.db import get_db
from app.models.contact_message import ContactMessage
from app.models.student_preregistration import StudentPreregistration
from app.models.zakat_setting import ZakatSetting
from app.models.donation_category import DonationCategory
from app.models.organization_settings import OrganizationSettings
from app.models.content_post import ContentPost
from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus
from sqlalchemy.orm import selectinload
from app.schemas.contact import ContactMessageCreate, ContactMessageResponse
from app.schemas.preregistration import PreRegistrationCreate, PreRegistrationResponse
from app.core.rate_limit import rate_limit
from app.utils.i18n import request_language

router = APIRouter(prefix="/public", tags=["public-forms"])


def _verify_base_url(organization) -> str:
    if settings.ENVIRONMENT == "production" and getattr(organization, "primary_domain", None):
        return f"https://{organization.primary_domain}"
    return settings.PUBLIC_WEB_URL


@router.get("/receipts/{receipt_number}")
async def verify_public_receipt(
    request: Request,
    receipt_number: str,
    k: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("receipt-verify", limit=30)),
):
    result = await db.execute(
        select(Donation)
        .options(selectinload(Donation.donor), selectinload(Donation.campaign))
        .where(
            Donation.organization_id == request.state.organization_id,
            Donation.receipt_number == receipt_number,
            Donation.status.in_([DonationStatus.CONFIRMED, DonationStatus.REFUNDED, DonationStatus.CANCELLED]),
        ).limit(1)
    )
    donation = result.scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Makbuz bulunamadı")
    from app.models.channels import DonationVideo
    from app.services import videos as vs
    from app.utils.receipt_pdf import code_matches

    # Receipt numbers can be sequential (receipt books); without the code printed on the receipt
    # only validity, amount and date are shown, not who gave.
    verified = code_matches(donation.receipt_number, donation.amount_cents, k)
    donor_name = None
    video_url = None
    if verified:
        donor_name = "Anonim Bağışçı"
        if donation.donor and not donation.is_anonymous:
            last_initial = f"{donation.donor.last_name[0]}." if donation.donor.last_name else ""
            donor_name = f"{donation.donor.first_name} {last_initial}".strip()
        vid = (await db.execute(
            select(DonationVideo).where(
                DonationVideo.organization_id == donation.organization_id,
                DonationVideo.donation_id == donation.id,
                DonationVideo.status == "ready",
            ).order_by(DonationVideo.created_at.desc()).limit(1)
        )).scalar_one_or_none()
        if vid:
            video_url = await vs.watch_url(db, donation.organization_id, vid.id, donation.donor_id)
    code_qs = f"?k={k}" if k else ""
    return {
        "status": {DonationStatus.REFUNDED: "refunded", DonationStatus.CANCELLED: "cancelled"}.get(donation.status, "valid"),
        "receipt_number": donation.receipt_number,
        "code_verified": verified,
        "donor_name": donor_name,
        "campaign_title": donation.campaign.title if donation.campaign else "Genel Bağış",
        "currency": donation.currency or "TRY",
        "amount_lira": donation.amount_cents / 100,
        "created_at": donation.paid_at or donation.created_at,
        "payment_method": "Kredi Kartı" if donation.payment_method == "credit_card" else "Havale / EFT",
        "video_url": video_url,
        "pdf_url": f"/api/v1/public/receipts/{donation.receipt_number}/pdf{code_qs}" if verified else None,
        "certificate_url": f"/api/v1/public/receipts/{donation.receipt_number}/certificate{code_qs}" if verified else None,
    }


@router.get("/receipts/{receipt_number}/certificate")
async def download_public_receipt_certificate(
    request: Request,
    receipt_number: str,
    k: str | None = None,
    honoree: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("receipt-certificate", limit=20)),
):
    """Doğrulanmış bağış için yazdırılabilir / paylaşılabilir Teşekkür ve Hediye Sertifikası."""
    import html as _html
    from app.utils.receipt_pdf import code_matches

    result = await db.execute(
        select(Donation)
        .options(selectinload(Donation.donor), selectinload(Donation.campaign))
        .where(
            Donation.organization_id == request.state.organization_id,
            Donation.receipt_number == receipt_number,
            Donation.status == DonationStatus.CONFIRMED,
        ).limit(1)
    )
    donation = result.scalar_one_or_none()
    if not donation or not code_matches(donation.receipt_number, donation.amount_cents, k):
        raise HTTPException(status_code=404, detail="Sertifika için geçerli makbuz ve doğrulama kodu gereklidir")

    org = getattr(request.state, "organization", None)
    org_name = _html.escape(getattr(org, "name", None) or "e-İnfak")
    primary = _html.escape(getattr(org, "theme_primary_color", None) or "#047857")
    donor_display = "Değerli Bağışçımız"
    if donation.donor and not donation.is_anonymous:
        donor_display = f"{donation.donor.first_name} {donation.donor.last_name or ''}".strip() or donor_display
    recipient = _html.escape((honoree or "").strip()[:120] or donor_display)
    campaign_title = _html.escape(donation.campaign.title if donation.campaign else "İyilik ve Yardım Faaliyetleri")
    dt = donation.paid_at or donation.created_at
    date_str = dt.strftime("%d.%m.%Y") if dt else ""
    amount_str = f"{donation.amount_cents / 100:,.2f} {donation.currency or 'TRY'}".replace(",", "X").replace(".", ",").replace("X", ".")
    honoree_line = (
        f"<p class='sub'><strong>{_html.escape(donor_display)}</strong> tarafından adınıza gerçekleştirilen</p>"
        if (honoree or "").strip()
        else "<p class='sub'>İhtiyaç sahiplerine umut olmak üzere gerçekleştirdiğiniz</p>"
    )
    page = f"""<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Teşekkür Sertifikası · {_html.escape(donation.receipt_number)}</title>
<style>
  @page {{ size: A4 landscape; margin: 0; }}
  body {{ margin:0; font-family: Georgia, 'Times New Roman', serif; background:#f8fafc; color:#0f172a; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; box-sizing:border-box; }}
  .cert {{ width:100%; max-width:960px; background:#fff; border:12px double {primary}; border-radius:16px; padding:56px 48px; text-align:center; box-shadow:0 20px 50px rgba(15,23,42,.12); position:relative; }}
  .org {{ font-family: system-ui, sans-serif; font-size:14px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:{primary}; }}
  h1 {{ font-size:40px; margin:16px 0 8px; color:#0f172a; font-weight:700; }}
  .line {{ width:96px; height:3px; background:{primary}; margin:18px auto 28px; border-radius:99px; }}
  .name {{ font-size:32px; font-weight:700; color:{primary}; margin:10px 0 18px; }}
  .sub {{ font-size:17px; color:#475569; margin:8px 0; }}
  .camp {{ font-size:22px; font-weight:700; color:#0f172a; margin:14px 0; }}
  .meta {{ margin-top:36px; display:flex; justify-content:space-between; font-family:system-ui,sans-serif; font-size:13px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:18px; }}
  .actions {{ margin-top:24px; }}
  .btn {{ font-family:system-ui,sans-serif; background:{primary}; color:#fff; border:none; padding:10px 22px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; }}
  @media print {{ body {{ background:#fff; padding:0; }} .cert {{ box-shadow:none; }} .actions {{ display:none; }} }}
</style></head><body>
<div class="cert">
  <div class="org">{org_name}</div>
  <h1>TEŞEKKÜR SERTİFİKASI</h1>
  <div class="line"></div>
  <div class="name">{recipient}</div>
  {honoree_line}
  <div class="camp">“{campaign_title}”</div>
  <p class="sub">bağışınız için en kalbi duygularımızla teşekkür ederiz. İyiliğiniz ihtiyaç sahiplerine emanetle ulaştırılmaktadır.</p>
  <div class="meta">
    <span>Makbuz No: <strong>{_html.escape(donation.receipt_number)}</strong></span>
    <span>Tutar: <strong>{amount_str}</strong></span>
    <span>Tarih: <strong>{date_str}</strong></span>
  </div>
  <div class="actions"><button class="btn" onclick="window.print()">Yazdır / PDF Kaydet</button></div>
</div></body></html>"""
    return Response(content=page, media_type="text/html; charset=utf-8", headers={"Cache-Control": "no-store"})


@router.get("/receipts/{receipt_number}/pdf")
async def download_public_receipt_pdf(
    request: Request,
    receipt_number: str,
    k: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("receipt-pdf", limit=15)),
):
    """Doğrulanmış bağış makbuzunu indirilebilir resmi PDF olarak döner."""
    from app.utils.receipt_pdf import build_receipt_pdf

    result = await db.execute(
        select(Donation)
        .options(selectinload(Donation.donor), selectinload(Donation.campaign))
        .where(
            Donation.organization_id == request.state.organization_id,
            Donation.receipt_number == receipt_number,
            Donation.status.in_([DonationStatus.CONFIRMED, DonationStatus.REFUNDED, DonationStatus.CANCELLED]),
        ).limit(1)
    )
    donation = result.scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Makbuz bulunamadı")
    from app.utils.receipt_pdf import code_matches

    if not code_matches(donation.receipt_number, donation.amount_cents, k):
        raise HTTPException(status_code=403, detail="Makbuzu indirmek için makbuzdaki doğrulama kodu gerekir")

    donor_name = "Anonim Bağışçı"
    if donation.donor and not donation.is_anonymous:
        last_initial = f"{donation.donor.last_name[0]}." if donation.donor.last_name else ""
        donor_name = f"{donation.donor.first_name} {last_initial}".strip()

    pdf_bytes = build_receipt_pdf(
        organization=request.state.organization,
        campaign=donation.campaign,
        donor_name=donor_name,
        receipt_number=donation.receipt_number,
        amount_cents=donation.amount_cents,
        currency=donation.currency or "TRY",
        payment_method=donation.payment_method.value if hasattr(donation.payment_method, "value") else str(donation.payment_method),
        paid_at=donation.paid_at or donation.created_at,
        status={DonationStatus.REFUNDED: "refunded", DonationStatus.CANCELLED: "cancelled"}.get(donation.status, "valid"),
        on_behalf_of=donation.on_behalf_of,
        official_receipt_no=donation.official_receipt_no,
        verify_base_url=_verify_base_url(request.state.organization),
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="makbuz-{receipt_number}.pdf"',
            "Cache-Control": "private, max-age=0, no-store",
        },
    )


@router.post("/contact-messages", response_model=ContactMessageResponse, status_code=201)
async def create_contact_message(
    request: Request,
    payload: ContactMessageCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("contact", limit=5, window_seconds=300)),
):
    """Public İletişim formu gönderimi (kimlik doğrulama gerekmez)"""
    organization_id = request.state.organization_id

    message = ContactMessage(organization_id=organization_id, **payload.model_dump())
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


@router.post("/pre-registrations", response_model=PreRegistrationResponse, status_code=201)
async def create_pre_registration(
    request: Request,
    payload: PreRegistrationCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("pre-registration", limit=5, window_seconds=300)),
):
    """Public Ön Kayıt formu gönderimi (kimlik doğrulama gerekmez)"""
    organization_id = request.state.organization_id

    registration = StudentPreregistration(organization_id=organization_id, **payload.model_dump())
    db.add(registration)
    await db.commit()
    await db.refresh(registration)
    return registration


@router.get("/zakat-info")
async def get_public_zakat_info(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Zekât hesaplama sayfası için güncel gram altın fiyatı ve nisab tutarı"""
    organization_id = request.state.organization_id

    result = await db.execute(
        select(ZakatSetting).where(ZakatSetting.organization_id == organization_id)
    )
    setting = result.scalar_one_or_none()

    from app.utils.tcmb import fetch_tcmb_rates
    tcmb_data = fetch_tcmb_rates()
    live = not tcmb_data.get("stale")
    if setting and not setting.is_auto_sync:
        gold, nisap = setting.gold_price_per_gram, setting.nisap_amount_lira
    elif live and tcmb_data.get("GOLD_GRAM"):
        gold, nisap = tcmb_data["GOLD_GRAM"], tcmb_data["NISAP_LIRA"]
    elif setting:
        # Last price written by the hourly sync.
        gold, nisap = setting.gold_price_per_gram, setting.nisap_amount_lira
    else:
        gold, nisap = tcmb_data.get("GOLD_GRAM"), tcmb_data.get("NISAP_LIRA")
    return {
        "gold_price_per_gram": gold,
        "nisap_amount_lira": nisap,
        "usd_rate": tcmb_data.get("USD"),
        "eur_rate": tcmb_data.get("EUR"),
        "updated_at": setting.updated_at if setting else None,
        "stale": not live,
    }


@router.get("/donation-categories")
async def get_public_donation_categories(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Ana sayfadaki 'Bağış Kategorileri' / hızlı bağış kalemleri grid'i"""
    organization_id = request.state.organization_id
    lang = request_language(request)

    result = await db.execute(
        select(DonationCategory)
        .where(DonationCategory.organization_id == organization_id, DonationCategory.is_active == True)
        .order_by(DonationCategory.display_order)
    )
    rows = result.scalars().all()
    items = []
    for c in rows:
        overlay = (c.translations or {}).get(lang) if lang else None
        items.append({
            "id": str(c.id),
            "icon": c.icon,
            "image_url": c.image_url,
            "title": (overlay or {}).get("title") or c.title,
            "description": (overlay or {}).get("description") or c.description,
            "campaign_id": str(c.campaign_id) if c.campaign_id else None,
            "donation_type": c.donation_type,
            "target_url": c.target_url,
            "suggested_amounts_cents": c.suggested_amounts_cents or [],
            "display_order": c.display_order,
            "is_active": c.is_active,
        })
    return items


@router.get("/org-settings")
async def get_public_org_settings(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """İletişim/banka bilgileri (İletişim sayfası ve footer için)"""
    organization_id = request.state.organization_id

    result = await db.execute(
        select(OrganizationSettings).where(OrganizationSettings.organization_id == organization_id)
    )
    org_settings = result.scalar_one_or_none()

    # Etkin tahsilat para birimleri kurumun banka ayarındadır (Organization.settings JSON)
    org = request.state.organization
    enabled_currencies = (getattr(org, "settings", None) or {}).get(
        "enabled_payment_currencies", ["TRY"]
    )
    if not isinstance(enabled_currencies, list) or not enabled_currencies:
        enabled_currencies = ["TRY"]

    from app.api.v1.site import card_payments_available
    from app.models.cms import SitePage
    from app.services.site import legal_of

    bank_page_slug = (await db.execute(
        select(SitePage.slug).where(
            SitePage.organization_id == organization_id,
            SitePage.kind == "page",
            SitePage.is_published.is_(True),
            SitePage.slug.in_(["hesap-numaralarimiz", "hesap-numaralari", "banka-hesaplari", "iban"]),
        ).limit(1)
    )).scalar_one_or_none()
    iban_page_url = f"/{bank_page_slug}" if bank_page_slug else "/hesap-numaralarimiz"

    checkout_info = {
        "legal": legal_of(org, org_settings),
        "card_payments": await card_payments_available(db, org),
        "iban_page_url": iban_page_url,
    }
    if not org_settings:
        return {"enabled_payment_currencies": enabled_currencies, "languages": ["tr"], **checkout_info}

    return {
        **checkout_info,
        "contact_phone": org_settings.contact_phone,
        "contact_email": org_settings.contact_email,
        "contact_address": org_settings.contact_address,
        "bank1_name": org_settings.bank1_name,
        "bank1_iban": org_settings.bank1_iban,
        "bank2_name": org_settings.bank2_name,
        "bank2_iban": org_settings.bank2_iban,
        "about_text": org_settings.about_text,
        "mission_text": org_settings.mission_text,
        "vision_text": org_settings.vision_text,
        "bylaws_url": org_settings.bylaws_url,
        "board_url": org_settings.board_url,
        "audit_report_url": org_settings.audit_report_url,
        "activity_report_url": org_settings.activity_report_url,
        "fundraising_permit_url": org_settings.fundraising_permit_url,
        "whatsapp_number": org_settings.whatsapp_number,
        "whatsapp_message": org_settings.whatsapp_message,
        "instagram_url": org_settings.instagram_url,
        "live_chat_provider": org_settings.live_chat_provider if org_settings.live_chat_id else None,
        "live_chat_id": org_settings.live_chat_id,
        "seo_title": org_settings.seo_title,
        "seo_description": org_settings.seo_description,
        "seo_keywords": org_settings.seo_keywords,
        "languages": org_settings.languages or ["tr"],
        "enabled_payment_currencies": enabled_currencies,
    }




@router.get("/fx-rates")
async def public_fx_rates(db: AsyncSession = Depends(get_db)):
    """Güncel TCMB kurları (sitede yaklaşık karşılık göstermek için). Bayatsa boş döner."""
    from datetime import datetime, timezone
    from app.services.fx import MAX_RATE_AGE, current_rates

    now = datetime.now(timezone.utc)
    rates = {
        code: {"rate_try": float(rate), "fetched_at": fetched}
        for code, (rate, fetched) in (await current_rates(db)).items()
        if now - fetched <= MAX_RATE_AGE
    }
    return {"base": "TRY", "source": "TCMB döviz satış", "rates": rates}


class TrialSignupIn(BaseModel):
    organization_name: str = Field(min_length=2, max_length=200)
    subdomain: str = Field(min_length=2, max_length=63)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=32)
    first_name: str = Field(min_length=2, max_length=100)
    last_name: Optional[str] = Field(default="", max_length=100)


@router.post("/trial-signup", status_code=201, dependencies=[Depends(rate_limit("trial-signup", limit=5, window_seconds=3600))])
async def public_trial_signup(payload: TrialSignupIn, db: AsyncSession = Depends(get_db)):
    """Self-service 14-day free trial organisation provisioning from e-infak.org."""
    from datetime import datetime, timedelta, timezone
    from app.core.config import settings
    from app.core.security import get_password_hash
    from app.models.organization import Organization
    from app.models.user import User, UserRole
    from app.services import passwords
    from app.services.site import DEFAULT_SECTIONS
    from app.services.tenancy import RESERVED_SUBDOMAINS, valid_subdomain

    sub = payload.subdomain.strip().lower()
    if sub in RESERVED_SUBDOMAINS or not valid_subdomain(sub):
        raise HTTPException(status_code=422, detail="Geçersiz veya ayrılmış alt alan adı")

    exists = (await db.execute(select(Organization.id).where(Organization.subdomain == sub))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Bu alt alan adı zaten kullanımda")

    admin_email = str(payload.email).strip().lower()
    email_exists = (await db.execute(select(User.id).where(func.lower(User.email) == admin_email))).scalar_one_or_none()
    if email_exists:
        raise HTTPException(status_code=409, detail="Bu e-posta adresiyle kayıtlı bir hesap zaten var")

    org = Organization(
        slug=sub,
        name=payload.organization_name.strip(),
        legal_name=payload.organization_name.strip(),
        email=admin_email,
        phone=payload.phone.strip() if payload.phone else None,
        primary_domain=f"{sub}.{settings.PLATFORM_BASE_DOMAIN}",
        subdomain=sub,
        template="sade",
        plan="baslangic",
        subscription_status="trial",
        subscription_ends_at=datetime.now(timezone.utc) + timedelta(days=14),
        is_active=True,
        site=DEFAULT_SECTIONS,
    )
    db.add(org)
    await db.flush()

    temp_pwd = passwords.temporary_password()
    admin = User(
        organization_id=org.id,
        email=admin_email,
        first_name=payload.first_name.strip(),
        last_name=(payload.last_name or "").strip(),
        hashed_password=get_password_hash(temp_pwd),
        role=UserRole.STK_ADMIN,
        is_active=True,
        must_change_password=True,
    )
    db.add(admin)
    await db.commit()

    login_url = f"https://{org.primary_domain}/giris"
    await passwords.send_credentials_email(admin, login_url, temp_pwd, organization=org.name, welcome=True)
    return {
        "ok": True,
        "organization_name": org.name,
        "url": f"https://{org.primary_domain}",
        "login_url": login_url,
        "trial_ends_at": org.subscription_ends_at.isoformat(),
    }


class FundraiserCreateIn(BaseModel):
    parent_campaign_id: Optional[str] = None
    title: str = Field(min_length=5, max_length=160)
    story: str = Field(min_length=10, max_length=2000)
    target_lira: int = Field(ge=500, le=50_000_000)
    organizer_name: str = Field(min_length=2, max_length=120)
    organizer_phone: Optional[str] = Field(default=None, max_length=30)
    organizer_email: Optional[EmailStr] = None


@router.post("/fundraisers")
async def create_peer_fundraiser(
    request: Request,
    payload: FundraiserCreateIn,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("p2p-fundraiser", limit=5, window_seconds=3600)),
):
    """Peer-to-Peer ('Kendi İyilik Kampanyanı Başlat'): onay bekleyen alt kampanya oluşturur."""
    import re
    import secrets as _secrets
    from uuid import UUID as _UUID
    from app.models.campaign import CampaignStatus

    org_id = _UUID(str(request.state.organization_id))
    base_slug = re.sub(r"[^a-z0-9]+", "-", payload.title.lower().translate(str.maketrans("çğıöşü", "cgiosu"))).strip("-")[:48] or "iyilik"
    slug = f"p2p-{base_slug}-{_secrets.token_hex(3)}"
    tags = ["p2p", f"organizer:{payload.organizer_name.strip()[:80]}"]
    if payload.parent_campaign_id:
        tags.append(f"parent:{payload.parent_campaign_id}")

    camp = Campaign(
        organization_id=org_id,
        title=payload.title.strip(),
        slug=slug,
        short_description=f"{payload.organizer_name.strip()} tarafından başlatılan iyilik kampanyası.",
        description=payload.story.strip(),
        target_cents=payload.target_lira * 100,
        currency="TRY",
        status=CampaignStatus.DRAFT,
        tags=tags,
    )
    db.add(camp)
    await db.commit()
    return {
        "ok": True,
        "id": str(camp.id),
        "slug": camp.slug,
        "status": "draft",
        "message": "İyilik kampanyanız alındı; kurum onayının ardından yayına alınacaktır.",
    }
