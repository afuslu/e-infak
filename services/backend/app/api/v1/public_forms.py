from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.models.contact_message import ContactMessage
from app.models.student_preregistration import StudentPreregistration
from app.models.zakat_setting import ZakatSetting
from app.models.donation_category import DonationCategory
from app.models.organization_settings import OrganizationSettings
from app.models.content_post import ContentPost
from app.schemas.contact import ContactMessageCreate, ContactMessageResponse
from app.schemas.preregistration import PreRegistrationCreate, PreRegistrationResponse

router = APIRouter(prefix="/public", tags=["public-forms"])


@router.post("/contact-messages", response_model=ContactMessageResponse, status_code=201)
async def create_contact_message(
    request: Request,
    payload: ContactMessageCreate,
    db: AsyncSession = Depends(get_db),
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

    if not setting:
        return {"gold_price_per_gram": 3000.0, "nisap_amount_lira": 255000.0}

    return {
        "gold_price_per_gram": setting.gold_price_per_gram,
        "nisap_amount_lira": setting.nisap_amount_lira,
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
    settings = result.scalar_one_or_none()

    if not settings:
        return {}

    return {
        "contact_phone": settings.contact_phone,
        "contact_email": settings.contact_email,
        "contact_address": settings.contact_address,
        "bank1_name": settings.bank1_name,
        "bank1_iban": settings.bank1_iban,
        "bank2_name": settings.bank2_name,
        "bank2_iban": settings.bank2_iban,
    }


@router.get("/content-posts")
async def get_public_content_posts(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Ana sayfadaki 'Sahadan haberler' / Faaliyetler bölümü"""
    organization_id = request.state.organization_id

    result = await db.execute(
        select(ContentPost)
        .where(ContentPost.organization_id == organization_id, ContentPost.is_active == True)
        .order_by(ContentPost.display_order)
    )
    return result.scalars().all()
