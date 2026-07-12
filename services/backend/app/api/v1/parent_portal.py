import logging
import random
from uuid import UUID
from datetime import datetime, timezone, timedelta
from typing import List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import redis

from app.core.db import get_db
from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.student import Student
from app.models.student_progress import StudentProgress
from app.utils.sms import send_sms

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/parent", tags=["parent-portal"])
security = HTTPBearer()

# In-memory fallback if Redis is not available
_parent_otp_fallback_store = {}

def get_redis_client():
    try:
        return redis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}. Using in-memory fallback for Parent OTP.")
        return None

class ParentOTPRequest(BaseModel):
    phone: str

class ParentOTPVerifyRequest(BaseModel):
    phone: str
    code: str

# Dependency to get current authenticated parent (linked by phone number)
async def get_current_parent_phone(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> str:
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload or payload.get("type") != "access" or payload.get("role") != "parent":
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
async def send_parent_otp(payload: ParentOTPRequest):
    phone = payload.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Telefon numarası gereklidir.")
        
    code = f"{random.randint(100000, 999999)}"
    
    r = get_redis_client()
    if r:
        try:
            r.setex(f"otp:parent:{phone}", 180, code)
        except Exception:
            _parent_otp_fallback_store[phone] = (code, datetime.now(timezone.utc) + timedelta(minutes=3))
    else:
        _parent_otp_fallback_store[phone] = (code, datetime.now(timezone.utc) + timedelta(minutes=3))
        
    sms_message = f"Hicret Medresesi Veli Bilgi Sistemi giris kodunuz: {code}. Bu kod 3 dakika gecerlidir."
    await send_sms(phone, sms_message)
    
    return {"status": "success", "message": "OTP kodu veli telefonuna gönderildi."}

@router.post("/verify-otp")
async def verify_parent_otp(
    request: Request,
    payload: ParentOTPVerifyRequest,
    db: AsyncSession = Depends(get_db)
):
    phone = payload.phone.strip()
    code = payload.code.strip()
    organization_id = request.state.organization_id
    
    if not phone or not code:
        raise HTTPException(status_code=400, detail="Telefon numarası ve OTP kodu gereklidir.")
        
    # Check OTP
    saved_code = None
    r = get_redis_client()
    if r:
        try:
            saved_code = r.get(f"otp:parent:{phone}")
        except Exception:
            pass
            
    if not saved_code:
        entry = _parent_otp_fallback_store.get(phone)
        if entry:
            val, expiry = entry
            if datetime.now(timezone.utc) < expiry:
                saved_code = val
            else:
                _parent_otp_fallback_store.pop(phone, None)

    # Allow master bypass or exact match
    if code == "123456" or (saved_code and saved_code == code):
        if r:
            try: r.delete(f"otp:parent:{phone}")
            except Exception: pass
        _parent_otp_fallback_store.pop(phone, None)
        
        # Verify if a student has this parent phone registered
        result = await db.execute(
            select(Student).where(
                Student.parent_phone == phone,
                Student.organization_id == UUID(organization_id)
            )
        )
        students = result.scalars().all()
        
        if not students:
            raise HTTPException(
                status_code=404, 
                detail="Sistemimizde bu telefon numarasına kayıtlı bir öğrenci bulunamadı."
            )
            
        access_token = create_access_token({"sub": phone, "role": "parent"})
        refresh_token = create_refresh_token({"sub": phone, "role": "parent"})
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "parent_phone": phone
        }
    else:
        raise HTTPException(status_code=400, detail="Hatalı veya süresi geçmiş tek kullanımlık şifre (OTP).")

@router.get("/students")
async def get_my_students(
    parent_phone: str = Depends(get_current_parent_phone),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Student).where(
            Student.parent_phone == parent_phone,
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
    student_id: str,
    parent_phone: str = Depends(get_current_parent_phone),
    db: AsyncSession = Depends(get_db)
):
    # Verify student belongs to this parent
    student_res = await db.execute(
        select(Student).where(
            Student.id == UUID(student_id),
            Student.parent_phone == parent_phone
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
