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
async def send_parent_otp(request: Request, payload: ParentOTPRequest):
    phone = payload.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Telefon numarası gereklidir.")
        
    code = f"{random.randint(100000, 999999)}"
    
    tenant = request.state.organization_id
    client_ip = request.client.host if request.client else "unknown"
    otp_key = f"{tenant}:{phone}"
    r = get_redis_client()
    if r:
        try:
            ip_limit_key = f"otp-parent-ip:{tenant}:{client_ip}"
            ip_count = r.incr(ip_limit_key)
            r.expire(ip_limit_key, 3600)
            if ip_count > 20:
                raise HTTPException(status_code=429, detail="Bu bağlantıdan çok fazla kod istendi.")
            if not r.set(f"otp-parent-cooldown:{otp_key}", "1", ex=60, nx=True):
                raise HTTPException(status_code=429, detail="Yeni kod istemeden önce 60 saniye bekleyin.")
            r.setex(f"otp:parent:{otp_key}", 180, code)
            r.delete(f"otp-parent-attempts:{otp_key}")
        except HTTPException:
            raise
        except Exception:
            _parent_otp_fallback_store[otp_key] = (code, datetime.now(timezone.utc) + timedelta(minutes=3), 0)
    else:
        existing = _parent_otp_fallback_store.get(otp_key)
        if existing and datetime.now(timezone.utc) < existing[1] - timedelta(minutes=2):
            raise HTTPException(status_code=429, detail="Yeni kod istemeden önce 60 saniye bekleyin.")
        _parent_otp_fallback_store[otp_key] = (code, datetime.now(timezone.utc) + timedelta(minutes=3), 0)
        
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
    otp_key = f"{organization_id}:{phone}"
    
    if not phone or not code:
        raise HTTPException(status_code=400, detail="Telefon numarası ve OTP kodu gereklidir.")
        
    # Check OTP
    saved_code = None
    r = get_redis_client()
    if r:
        try:
            saved_code = r.get(f"otp:parent:{otp_key}")
        except Exception:
            pass
            
    if not saved_code:
        entry = _parent_otp_fallback_store.get(otp_key)
        if entry:
            val, expiry, attempts = entry
            if datetime.now(timezone.utc) < expiry:
                saved_code = val
                attempts += 1
                _parent_otp_fallback_store[otp_key] = (val, expiry, attempts)
                if attempts > 5:
                    raise HTTPException(status_code=429, detail="Çok fazla hatalı deneme. Yeni kod isteyin.")
            else:
                _parent_otp_fallback_store.pop(otp_key, None)

    if r:
        attempts = r.incr(f"otp-parent-attempts:{otp_key}")
        r.expire(f"otp-parent-attempts:{otp_key}", 180)
        if attempts > 5:
            raise HTTPException(status_code=429, detail="Çok fazla hatalı deneme. Yeni kod isteyin.")

    if saved_code and saved_code == code:
        if r:
            try:
                r.delete(f"otp:parent:{otp_key}")
                r.delete(f"otp-parent-attempts:{otp_key}")
            except Exception: pass
        _parent_otp_fallback_store.pop(otp_key, None)
        
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
            
        token_claims = {"sub": phone, "role": "parent", "organization_id": organization_id}
        access_token = create_access_token(token_claims)
        refresh_token = create_refresh_token(token_claims)
        
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
    request: Request,
    parent_phone: str = Depends(get_current_parent_phone),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Student).where(
            Student.parent_phone == parent_phone,
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
            Student.parent_phone == parent_phone,
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
