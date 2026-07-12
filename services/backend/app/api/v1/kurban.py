from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from uuid import UUID
from app.core.db import get_db
from app.models.kurban import KurbanCampaign, KurbanAnimal, KurbanShare, KurbanStatus, KurbanCampaignStatus
from app.schemas.kurban import (
    KurbanCampaignCreate, KurbanCampaignResponse,
    KurbanAnimalCreate, KurbanAnimalResponse,
    KurbanShareCreate, KurbanShareResponse,
    KurbanSlaughterRequest
)
from app.tasks import send_sms_task

router = APIRouter(prefix="/kurban", tags=["kurban"])

# Campaign endpoints
@router.post("/campaigns", response_model=KurbanCampaignResponse, status_code=201)
async def create_kurban_campaign(
    request: Request,
    campaign_in: KurbanCampaignCreate,
    db: AsyncSession = Depends(get_db)
):
    organization_id = request.state.organization_id
    campaign = KurbanCampaign(
        organization_id=organization_id,
        **campaign_in.model_dump()
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign

@router.get("/campaigns", response_model=List[KurbanCampaignResponse])
async def list_kurban_campaigns(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    organization_id = request.state.organization_id
    query = select(KurbanCampaign).where(KurbanCampaign.organization_id == organization_id)
    result = await db.execute(query)
    return result.scalars().all()

# Animal endpoints
@router.post("/animals", response_model=KurbanAnimalResponse, status_code=201)
async def create_kurban_animal(
    request: Request,
    animal_in: KurbanAnimalCreate,
    db: AsyncSession = Depends(get_db)
):
    organization_id = request.state.organization_id
    # Verify campaign exists
    campaign = await db.get(KurbanCampaign, animal_in.campaign_id)
    if not campaign or campaign.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Kurban Campaign not found")
        
    animal = KurbanAnimal(
        organization_id=organization_id,
        **animal_in.model_dump()
    )
    db.add(animal)
    await db.commit()
    await db.refresh(animal)
    return animal

@router.get("/animals", response_model=List[KurbanAnimalResponse])
async def list_kurban_animals(
    request: Request,
    campaign_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(KurbanAnimal)
    if campaign_id:
        query = query.where(KurbanAnimal.campaign_id == campaign_id)
    result = await db.execute(query)
    return result.scalars().all()

# Share endpoints
@router.post("/shares", response_model=KurbanShareResponse, status_code=201)
async def create_kurban_share(
    request: Request,
    share_in: KurbanShareCreate,
    db: AsyncSession = Depends(get_db)
):
    organization_id = request.state.organization_id
    # Verify animal exists
    animal = await db.get(KurbanAnimal, share_in.animal_id)
    if not animal or animal.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Kurban Animal not found")
        
    # Check cow shares count
    if animal.type == "cow":
        existing_shares_query = select(KurbanShare).where(KurbanShare.animal_id == animal.id)
        existing_shares_result = await db.execute(existing_shares_query)
        existing_shares_count = len(existing_shares_result.scalars().all())
        if existing_shares_count >= 7:
            raise HTTPException(status_code=400, detail="This cow already has maximum 7 shares allocated")

    share = KurbanShare(
        organization_id=organization_id,
        **share_in.model_dump()
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)
    return share

# Slaughter endpoint (Mark animal as slaughtered and notify via SMS)
@router.post("/animals/{animal_id}/slaughter", response_model=KurbanAnimalResponse)
async def slaughter_kurban_animal(
    request: Request,
    animal_id: UUID,
    slaughter_in: KurbanSlaughterRequest,
    db: AsyncSession = Depends(get_db)
):
    organization_id = request.state.organization_id
    # Fetch animal
    animal = await db.get(KurbanAnimal, animal_id)
    if not animal or animal.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Kurban Animal not found")
        
    if animal.status == KurbanStatus.SLAUGHTERED:
        raise HTTPException(status_code=400, detail="Animal is already marked as slaughtered")
        
    # Update animal status
    animal.status = KurbanStatus.SLAUGHTERED
    if slaughter_in.video_url:
        animal.video_url = slaughter_in.video_url
        
    # Fetch shares to update status and send SMS
    shares_query = select(KurbanShare).where(KurbanShare.animal_id == animal.id)
    shares_result = await db.execute(shares_query)
    shares = shares_result.scalars().all()
    
    for share in shares:
        share.status = KurbanStatus.SLAUGHTERED
        # Trigger async Celery SMS notification task
        sms_message = (
            f"Sayin {share.donor_name}, kurbaniniz kesilmistir. Allah kabul etsin. "
            f"Takip video adresi: {animal.video_url or 'Videomuz yuklenecektir.'}"
        )
        send_sms_task.delay(share.donor_phone, sms_message)
        
    await db.commit()
    await db.refresh(animal)
    return animal
