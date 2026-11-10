from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
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

router = APIRouter(prefix="/public", tags=["public-forms"])


def _verify_base_url(organization) -> str:
    if settings.ENVIRONMENT == "production" and getattr(organization, "primary_domain", None):
        return f"https://{organization.primary_domain}"
    return settings.PUBLIC_WEB_URL


@router.get("/receipts/{receipt_number}")
async def verify_public_receipt(
    request: Request,
    receipt_number: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("receipt-verify", limit=30)),
):
    result = await db.execute(
        select(Donation)
        .options(selectinload(Donation.donor))
        .where(
            Donation.organization_id == request.state.organization_id,
            Donation.receipt_number == receipt_number,
            Donation.status.in_([DonationStatus.CONFIRMED, DonationStatus.REFUNDED, DonationStatus.CANCELLED]),
        )
    )
    donation = result.scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Makbuz bulunamadı")
    donor_name = "Anonim Bağışçı"
    if donation.donor and not donation.is_anonymous:
        last_initial = f"{donation.donor.last_name[0]}." if donation.donor.last_name else ""
        donor_name = f"{donation.donor.first_name} {last_initial}".strip()
    return {
        "status": {DonationStatus.REFUNDED: "refunded", DonationStatus.CANCELLED: "cancelled"}.get(donation.status, "valid"),
        "receipt_number": donation.receipt_number,
        "donor_name": donor_name,
        "amount_lira": donation.amount_cents / 100,
        "created_at": donation.paid_at or donation.created_at,
        "payment_method": "Kredi Kartı" if donation.payment_method == "credit_card" else "Havale / EFT",
    }


@router.get("/receipts/{receipt_number}/pdf")
async def download_public_receipt_pdf(
    request: Request,
    receipt_number: str,
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
        )
    )
    donation = result.scalar_one_or_none()
    if not donation:
        raise HTTPException(status_code=404, detail="Makbuz bulunamadı")

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

    if not setting:
        return {
            "gold_price_per_gram": tcmb_data.get("GOLD_GRAM", 3000.0),
            "nisap_amount_lira": tcmb_data.get("NISAP_LIRA", 255000.0),
            "usd_rate": tcmb_data.get("USD", 33.0),
            "eur_rate": tcmb_data.get("EUR", 36.0),
        }

    gold = tcmb_data.get("GOLD_GRAM") if setting.is_auto_sync else setting.gold_price_per_gram
    nisap = tcmb_data.get("NISAP_LIRA") if setting.is_auto_sync else setting.nisap_amount_lira

    return {
        "gold_price_per_gram": gold,
        "nisap_amount_lira": nisap,
        "usd_rate": tcmb_data.get("USD", 33.0),
        "eur_rate": tcmb_data.get("EUR", 36.0),
    }


@router.get("/donation-categories")
async def get_public_donation_categories(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Ana sayfadaki 'Bağış Kategorileri' / hızlı bağış kalemleri grid'i"""
    organization_id = request.state.organization_id

    result = await db.execute(
        select(DonationCategory)
        .where(DonationCategory.organization_id == organization_id, DonationCategory.is_active == True)
        .order_by(DonationCategory.display_order)
    )
    return result.scalars().all()


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

    if not org_settings:
        return {"enabled_payment_currencies": enabled_currencies, "languages": ["tr"]}

    return {
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
