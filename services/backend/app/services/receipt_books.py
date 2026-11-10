"""Matbu makbuz koçanından numara verme.

Kurallar: yaprak numarası koçanın aralığında olmalı, iptal edilmiş (yırtılmış) ya da daha önce
kesilmiş bir numara tekrar verilmez — makbuz sonradan iptal edilse bile numara kullanılmış sayılır.
"""
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.donation import Donation
from app.models.receipt_book import ReceiptBook


def voided_numbers(book: ReceiptBook) -> set[int]:
    return {int(v["no"]) for v in (book.voided or [])}


def advance(book: ReceiptBook, used: Optional[set[int]] = None) -> None:
    """next_no'yu ilk boş yaprağa taşır; yaprak kalmadıysa koçanı kapatır."""
    skip = voided_numbers(book) | (used or set())
    while book.next_no <= book.end_no and book.next_no in skip:
        book.next_no += 1
    if book.next_no > book.end_no:
        book.status = "closed"


async def is_used(db: AsyncSession, org_id: UUID, label: str) -> bool:
    return (await db.execute(select(Donation.id).where(
        Donation.organization_id == org_id, Donation.official_receipt_no == label))).first() is not None


async def take_number(db: AsyncSession, org_id: UUID, book_id: UUID, number: Optional[int] = None) -> tuple[ReceiptBook, str]:
    """Koçanı kilitleyip bir yaprak numarası ayırır; çağıran commit eder."""
    book = (await db.execute(select(ReceiptBook).where(
        ReceiptBook.id == book_id, ReceiptBook.organization_id == org_id).with_for_update())).scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Makbuz koçanı bulunamadı")
    if book.status != "active":
        raise HTTPException(status_code=409, detail=f"{book.series} koçanı kapalı")
    if number is None:
        while True:
            advance(book)
            if book.status != "active":
                raise HTTPException(status_code=409, detail=f"{book.series} koçanında boş yaprak kalmadı")
            if not await is_used(db, org_id, book.label(book.next_no)):
                break
            book.next_no += 1  # elle ileri bir numara kesilmiş; onu atla
        number = book.next_no
    elif not book.start_no <= number <= book.end_no:
        raise HTTPException(status_code=422, detail=f"Numara koçan aralığında değil ({book.start_no}-{book.end_no})")
    elif number in voided_numbers(book):
        raise HTTPException(status_code=409, detail=f"{book.label(number)} numaralı yaprak iptal edilmiş")
    label = book.label(number)
    if await is_used(db, org_id, label):
        raise HTTPException(status_code=409, detail=f"{label} numaralı makbuz zaten kesilmiş")
    if number == book.next_no:
        book.next_no += 1
        advance(book)
    return book, label
