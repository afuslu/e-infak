import logging
from uuid import UUID
from datetime import datetime, timezone, timedelta
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.db import get_db
from app.core.config import settings
from app.core.rate_limit import rate_limit
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.student import Student
from app.models.student_progress import StudentProgress
from app.services import otp
from app.utils.phone import phone_matches
from app.utils.sms import send_sms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/parent", tags=["parent-portal"])
security = HTTPBearer()

class ParentOTPRequest(BaseModel):
    phone: str

class ParentOTPVerifyRequest(BaseModel):
    phone: str
    code: str

# Dependency to get current authenticated parent (linked by phone number)
async def get_current_parent_phone(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> str:
    token = credentials.credentials
    payload = decode_token(token)
    
    if (
        not payload
        or payload.get("type") != "access"
        or payload.get("role") != "parent"
        or payload.get("organization_id") != request.state.organization_id
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Veli portalı için geçersiz kimlik doğrulama",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    parent_phone = payload.get("sub")
    if not parent_phone:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz token payload",
        )
    return parent_phone

@router.post("/send-otp")
async def send_parent_otp(
    request: Request,
    payload: ParentOTPRequest,
    _: None = Depends(rate_limit("parent-otp-send", limit=5, window_seconds=300)),
):
    tenant = str(request.state.organization_id)
    client_ip = request.client.host if request.client else "unknown"
    code = otp.issue("parent", tenant, payload.phone, client_ip)
    org_name = getattr(getattr(request.state, "organization", None), "name", "") or "Veli Bilgi Sistemi"
    org_name = org_name.translate(str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU"))
    sms_message = f"{org_name} veli bilgi sistemi giris kodunuz: {code}. Bu kod 3 dakika gecerlidir."
    await send_sms(payload.phone.strip(), sms_message, tenant, log_text=sms_message.replace(code, "******"))
    return {"status": "success", "message": "OTP kodu veli telefonuna gönderildi."}


@router.post("/verify-otp")
async def verify_parent_otp(
    request: Request,
    payload: ParentOTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit("parent-otp-verify", limit=10, window_seconds=300)),
):
    organization_id = str(request.state.organization_id)
    phone = otp.verify("parent", organization_id, payload.phone, payload.code)
    students = (await db.execute(
        select(Student).where(phone_matches(Student.parent_phone, phone), Student.organization_id == UUID(organization_id))
    )).scalars().all()
    if not students:
        raise HTTPException(status_code=404, detail="Sistemimizde bu telefon numarasına kayıtlı bir öğrenci bulunamadı.")
    token_claims = {"sub": phone, "role": "parent", "organization_id": organization_id}
    return {
        "access_token": create_access_token(token_claims),
        "refresh_token": create_refresh_token(token_claims),
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "parent_phone": phone,
    }


@router.get("/students")
async def get_my_students(
    request: Request,
    parent_phone: str = Depends(get_current_parent_phone),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Student).where(
            phone_matches(Student.parent_phone, parent_phone),
            Student.organization_id == UUID(request.state.organization_id),
            Student.is_active == True
        )
    )
    students = result.scalars().all()
    return [
        {
            "id": s.id,
            "first_name": s.first_name,
            "last_name": s.last_name,
            "full_name": s.full_name,
            "parent_name": s.parent_name
        }
        for s in students
    ]

@router.get("/students/{student_id}/progress")
async def get_student_progress(
    request: Request,
    student_id: str,
    parent_phone: str = Depends(get_current_parent_phone),
    db: AsyncSession = Depends(get_db)
):
    # Verify student belongs to this parent
    student_res = await db.execute(
        select(Student).where(
            Student.id == UUID(student_id),
            phone_matches(Student.parent_phone, parent_phone),
            Student.organization_id == UUID(request.state.organization_id),
        )
    )
    student = student_res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı veya yetkisiz erişim.")
        
    # Get student progress
    progress_res = await db.execute(
        select(StudentProgress)
        .where(StudentProgress.student_id == student.id)
        .order_by(StudentProgress.check_date.asc())
    )
    progress_list = progress_res.scalars().all()
    
    return [
        {
            "id": p.id,
            "check_date": p.check_date,
            "memorized_pages": p.memorized_pages,
            "current_surah": p.current_surah,
            "instructor_notes": p.instructor_notes
        }
        for p in progress_list
    ]
