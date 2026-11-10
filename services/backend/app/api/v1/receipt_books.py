"""Matbu makbuz koçanları: tanım, yaprak iptali, yaprak dökümü ve şube / online makbuz ayrımı."""
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin_route_feature, require_admin_route_permission
from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.donation import Donation, DonationStatus, Donor
from app.models.receipt_book import ReceiptBook
from app.models.user import User
from app.services.receipt_books import advance, voided_numbers
from app.utils.content import sanitize_public_text

router = APIRouter(
    prefix="/admin-features",
    tags=["receipt-books"],
    dependencies=[Depends(require_admin_route_permission), Depends(require_admin_route_feature)],
)

TZ = ZoneInfo("Europe/Istanbul")
MAX_BOOK_SIZE = 10_000
OFFLINE_PROVIDERS = ("manual", "money_box", "import")


def _org_id(request: Request) -> UUID:
    return UUID(str(request.state.organization_id))


def _clean(value):
    return sanitize_public_text(value) if value else value


async def _book(db: AsyncSession, org_id: UUID, book_id: UUID, lock: bool = False) -> ReceiptBook:
    query = select(ReceiptBook).where(ReceiptBook.id == book_id, ReceiptBook.organization_id == org_id)
    if lock:
        query = query.with_for_update()
    book = (await db.execute(query)).scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Makbuz koçanı bulunamadı")
    return book


async def _check_holder(db: AsyncSession, org_id: UUID, user_id: Optional[UUID]) -> None:
    if user_id and not (await db.execute(select(User.id).where(User.id == user_id, User.organization_id == org_id))).first():
        raise HTTPException(status_code=404, detail="Personel bulunamadı")


def _book_out(b: ReceiptBook, used: int = 0, holder: Optional[str] = None) -> dict:
    size = b.end_no - b.start_no + 1
    voided = len(b.voided or [])
    return {
        "id": str(b.id), "series": b.series, "start_no": b.start_no, "end_no": b.end_no, "next_no": b.next_no,
        "branch": b.branch, "holder_user_id": str(b.holder_user_id) if b.holder_user_id else None, "holder_name": holder,
        "status": b.status, "note": b.note, "size": size, "used": used, "voided": voided,
        "remaining": max(0, size - used - voided), "voided_sheets": b.voided or [],
        "next_label": b.label(b.next_no) if b.status == "active" and b.next_no <= b.end_no else None,
    }


async def _names(db: AsyncSession, org_id: UUID) -> dict:
    rows = (await db.execute(select(User.id, User.first_name, User.last_name).where(User.organization_id == org_id))).all()
    return {r[0]: f"{r[1]} {r[2]}".strip() for r in rows}


class BookIn(BaseModel):
    series: str = Field(min_length=1, max_length=20)
    start_no: int = Field(ge=1, le=99_999_999)
    end_no: int = Field(ge=1, le=99_999_999)
    branch: Optional[str] = Field(default=None, max_length=100)
    holder_user_id: Optional[UUID] = None
    note: Optional[str] = Field(default=None, max_length=1000)

    clean_text = field_validator("series", "branch", "note", mode="before")(lambda cls, v: _clean(v.strip() if isinstance(v, str) else v))
    empty_to_none = field_validator("holder_user_id", mode="before")(lambda cls, v: v or None)

    @model_validator(mode="after")
    def check_range(self):
        if self.end_no < self.start_no:
            raise ValueError("Bitiş numarası başlangıçtan küçük olamaz")
        if self.end_no - self.start_no + 1 > MAX_BOOK_SIZE:
            raise ValueError(f"Bir koçan en fazla {MAX_BOOK_SIZE} yaprak olabilir")
        return self


class BookUpdate(BaseModel):
    branch: Optional[str] = Field(default=None, max_length=100)
    holder_user_id: Optional[UUID] = None
    status: Literal["active", "closed"] = "active"
    note: Optional[str] = Field(default=None, max_length=1000)

    clean_text = field_validator("branch", "note", mode="before")(lambda cls, v: _clean(v))
    empty_to_none = field_validator("holder_user_id", mode="before")(lambda cls, v: v or None)


@router.get("/receipt-books")
async def list_books(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    books = (await db.execute(select(ReceiptBook).where(ReceiptBook.organization_id == org_id)
                              .order_by(ReceiptBook.status, ReceiptBook.series, ReceiptBook.start_no))).scalars().all()
    used = dict((await db.execute(
        select(Donation.receipt_book_id, func.count(Donation.id))
        .where(Donation.organization_id == org_id, Donation.receipt_book_id.isnot(None))
        .group_by(Donation.receipt_book_id))).all())
    names = await _names(db, org_id)
    return [_book_out(b, int(used.get(b.id, 0)), names.get(b.holder_user_id)) for b in books]


@router.post("/receipt-books", status_code=status.HTTP_201_CREATED)
async def create_book(request: Request, payload: BookIn, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    await _check_holder(db, org_id, payload.holder_user_id)
    overlap = (await db.execute(select(ReceiptBook.id).where(
        ReceiptBook.organization_id == org_id, func.lower(ReceiptBook.series) == payload.series.lower(),
        ReceiptBook.start_no <= payload.end_no, ReceiptBook.end_no >= payload.start_no))).first()
    if overlap:
        raise HTTPException(status_code=409, detail=f"{payload.series} serisinde bu numaralarla çakışan bir koçan var")
    book = ReceiptBook(organization_id=org_id, next_no=payload.start_no, status="active", voided=[], **payload.model_dump())
    db.add(book)
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="makbuz_kocani_ekle",
                    details={"series": book.series, "start_no": book.start_no, "end_no": book.end_no}))
    await db.commit()
    return _book_out(book, 0, (await _names(db, org_id)).get(book.holder_user_id))


@router.put("/receipt-books/{book_id}")
async def update_book(request: Request, book_id: UUID, payload: BookUpdate, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    org_id = _org_id(request)
    book = await _book(db, org_id, book_id, lock=True)
    await _check_holder(db, org_id, payload.holder_user_id)
    if payload.status == "active" and book.next_no > book.end_no:
        raise HTTPException(status_code=409, detail="Koçanda boş yaprak kalmadığı için açılamaz")
    for key, value in payload.model_dump().items():
        setattr(book, key, value)
    await db.commit()
    used = (await db.execute(select(func.count(Donation.id)).where(Donation.receipt_book_id == book.id))).scalar_one()
    return _book_out(book, int(used), (await _names(db, org_id)).get(book.holder_user_id))


class VoidIn(BaseModel):
    number: int = Field(ge=1)
    reason: str = Field(min_length=3, max_length=300)

    clean_text = field_validator("reason", mode="before")(lambda cls, v: _clean(v))


@router.post("/receipt-books/{book_id}/void")
async def void_sheet(request: Request, book_id: UUID, payload: VoidIn, db: AsyncSession = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    """Yırtılan / hatalı yazılan boş yaprağı iptal eder; bu numara bir daha verilmez."""
    org_id = _org_id(request)
    book = await _book(db, org_id, book_id, lock=True)
    if not book.start_no <= payload.number <= book.end_no:
        raise HTTPException(status_code=422, detail=f"Numara koçan aralığında değil ({book.start_no}-{book.end_no})")
    if payload.number in voided_numbers(book):
        raise HTTPException(status_code=409, detail="Bu yaprak zaten iptal edilmiş")
    label = book.label(payload.number)
    if (await db.execute(select(Donation.id).where(Donation.organization_id == org_id, Donation.official_receipt_no == label))).first():
        raise HTTPException(status_code=409, detail=f"{label} numaralı makbuz kesilmiş; makbuz iptali bağış ekranından yapılır")
    book.voided = [*(book.voided or []), {
        "no": payload.number, "reason": payload.reason, "by": str(current_user.id),
        "at": datetime.now(timezone.utc).isoformat(),
    }]
    advance(book)
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="makbuz_yapragi_iptal",
                    details={"book_id": str(book.id), "number": label, "reason": payload.reason}))
    await db.commit()
    used = (await db.execute(select(func.count(Donation.id)).where(Donation.receipt_book_id == book.id))).scalar_one()
    return _book_out(book, int(used))


@router.get("/receipt-books/{book_id}/sheets")
async def book_sheets(request: Request, book_id: UUID, db: AsyncSession = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Yaprak dökümü: kesilen, iptal edilen ve atlanan (boşluk) numaralar."""
    org_id = _org_id(request)
    book = await _book(db, org_id, book_id)
    rows = (await db.execute(
        select(Donation, Donor.first_name, Donor.last_name, Donor.company_name)
        .join(Donor, Donor.id == Donation.donor_id)
        .where(Donation.organization_id == org_id, Donation.receipt_book_id == book.id)
    )).all()
    prefix = f"{book.series}-"
    by_no = {}
    for d, first, last, company in rows:
        try:
            by_no[int(d.official_receipt_no.removeprefix(prefix))] = (d, company or f"{first} {last or ''}".strip())
        except (AttributeError, ValueError):
            continue
    voided = {int(v["no"]): v for v in (book.voided or [])}
    last = max([book.next_no - 1, *by_no, *voided])
    sheets = []
    for number in range(book.start_no, min(last, book.end_no) + 1):
        if number in by_no:
            d, donor_name = by_no[number]
            sheets.append({
                "no": number, "label": book.label(number), "state": "cancelled" if d.status == DonationStatus.CANCELLED else "used",
                "donation_id": str(d.id), "receipt_number": d.receipt_number, "donor_name": donor_name,
                "amount_cents": d.amount_cents, "currency": d.currency, "paid_at": d.paid_at,
            })
        elif number in voided:
            sheets.append({"no": number, "label": book.label(number), "state": "voided", "reason": voided[number].get("reason")})
        else:
            sheets.append({"no": number, "label": book.label(number), "state": "gap"})
    return {"book": _book_out(book, len(by_no)), "sheets": sheets}


@router.get("/receipt-books-summary")
async def receipt_channel_summary(
    request: Request, start: Optional[date] = None, end: Optional[date] = None,
    currency: Literal["TRY", "USD", "EUR"] = "TRY",
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Online, şube (koçan) ve koçansız elle kesilen makbuzları ayrı ayrı toplar."""
    org_id = _org_id(request)
    end = end or datetime.now(TZ).date()
    start = start or end.replace(day=1)
    lower = datetime.combine(start, time.min, TZ)
    upper = datetime.combine(end + timedelta(days=1), time.min, TZ)
    paid = func.coalesce(Donation.paid_at, Donation.created_at)
    channel = case(
        (Donation.receipt_book_id.isnot(None), func.coalesce(ReceiptBook.branch, "Merkez")),
        (Donation.payment_provider.in_(OFFLINE_PROVIDERS), "Elle (koçansız)"),
        else_="Online",
    )
    kind = case(
        (Donation.receipt_book_id.isnot(None), "branch"),
        (Donation.payment_provider.in_(OFFLINE_PROVIDERS), "manual"),
        else_="online",
    )
    rows = (await db.execute(
        select(kind, channel, func.count(Donation.id), func.coalesce(func.sum(Donation.amount_cents), 0))
        .select_from(Donation).outerjoin(ReceiptBook, ReceiptBook.id == Donation.receipt_book_id)
        .where(Donation.organization_id == org_id, Donation.status == DonationStatus.CONFIRMED,
               Donation.currency == currency, paid >= lower, paid < upper)
        .group_by(kind, channel).order_by(func.sum(Donation.amount_cents).desc())
    )).all()
    return {
        "start": start.isoformat(), "end": end.isoformat(), "currency": currency,
        "channels": [{"kind": r[0], "label": r[1], "count": int(r[2]), "total_cents": int(r[3])} for r in rows],
    }
