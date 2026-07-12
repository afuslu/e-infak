from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from uuid import UUID
from app.core.db import get_db
from app.models.orphan import Orphan, OrphanSponsorship, OrphanStatus
from app.schemas.orphan import (
    OrphanCreate, OrphanResponse,
    OrphanSponsorshipCreate, OrphanSponsorshipResponse
)

router = APIRouter(prefix="/orphans", tags=["orphans"])

@router.post("", response_model=OrphanResponse, status_code=201)
async def create_orphan(
    request: Request,
    orphan_in: OrphanCreate,
    db: AsyncSession = Depends(get_db)
):
    organization_id = request.state.organization_id
    orphan = Orphan(
        organization_id=organization_id,
        **orphan_in.model_dump()
    )
    db.add(orphan)
    await db.commit()
    await db.refresh(orphan)
    return orphan

@router.get("", response_model=List[OrphanResponse])
async def list_orphans(
    request: Request,
    gender: Optional[str] = None,
    country: Optional[str] = None,
    status: Optional[OrphanStatus] = None,
    db: AsyncSession = Depends(get_db)
):
    organization_id = request.state.organization_id
    query = select(Orphan).where(Orphan.organization_id == organization_id)
    if gender:
        query = query.where(Orphan.gender == gender)
    if country:
        query = query.where(Orphan.country == country)
    if status:
        query = query.where(Orphan.status == status)
        
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/{orphan_id}/sponsor", response_model=OrphanSponsorshipResponse, status_code=201)
async def sponsor_orphan(
    request: Request,
    orphan_id: UUID,
    sponsorship_in: OrphanSponsorshipCreate,
    db: AsyncSession = Depends(get_db)
):
    organization_id = request.state.organization_id
    # Fetch orphan
    orphan = await db.get(Orphan, orphan_id)
    if not orphan or orphan.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Orphan not found")
        
    if orphan.status == OrphanStatus.SPONSORED:
        raise HTTPException(status_code=400, detail="Orphan is already sponsored")
        
    # Update orphan status to SPONSORED
    orphan.status = OrphanStatus.SPONSORED
    
    sponsorship = OrphanSponsorship(
        organization_id=organization_id,
        orphan_id=orphan.id,
        **sponsorship_in.model_dump()
    )
    db.add(sponsorship)
    await db.commit()
    await db.refresh(sponsorship)
    return sponsorship
