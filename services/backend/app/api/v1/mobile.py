"""Mobile app endpoints: push notification device token registration & test."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.device_token import DeviceToken
from app.models.user import User
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
