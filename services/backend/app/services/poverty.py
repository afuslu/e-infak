"""Yoksulluk puanı: hanenin ihtiyaç düzeyini 0-100 arası tek bir sayıya indirger.

Puan yüksekse ihtiyaç yüksektir. Bileşenler (en fazla):
  - kişi başı net gelir (gelir - kira), kurumun eşiğine göre ..... 40
  - bakmakla yükümlü bireyler (çocuk, yaşlı, engelli, kronik hasta) 20
  - hanede çalışan kimse olmaması ............................. 10
  - konut ve ısınma ........................................... 14
  - borç (eşiğin 3 aylık hane toplamına oranla) ................. 6
  - yoksulluk sebepleri (her biri 2) ........................... 10
"""
from datetime import date
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.field_ops import AidRecipient, HouseholdMember
from app.models.organization_settings import OrganizationSettings

# Kişi başı aylık net gelir eşiği (kuruş). Kurum ayarı yoksa kullanılır.
DEFAULT_POVERTY_LINE_CENTS = 1_000_000

POVERTY_REASONS = {
    "unemployment": "İşsizlik",
    "illness": "Hastalık",
    "disability": "Engellilik",
    "orphan": "Yetimlik",
    "widow": "Dul / eşi yok",
    "elderly": "Yaşlılık",
    "refugee": "Göç / mülteci",
    "debt": "Borç",
    "disaster": "Afet",
    "imprisonment": "Hane reisi cezaevinde",
    "other": "Diğer",
}
HOUSING = {"owner": "Ev sahibi", "rent": "Kirada", "relative": "Akraba yanında", "free": "Ücretsiz / lojman", "other": "Diğer"}
HEATING = {"natural_gas": "Doğalgaz", "stove": "Soba", "electric": "Elektrik", "none": "Isınma yok", "other": "Diğer"}
RELATIONS = {"self": "Hane reisi", "spouse": "Eş", "child": "Çocuk", "parent": "Anne / baba", "sibling": "Kardeş", "other": "Diğer"}
DEGREES = {"critical": "Çok acil", "high": "Yüksek", "medium": "Orta", "low": "Düşük"}
REVIEW_STATUSES = {"applied": "Başvuru", "inspecting": "İncelemede", "approved": "Onaylı", "rejected": "Reddedildi"}

_HOUSING_POINTS = {"rent": 8, "relative": 4, "free": 2, "other": 4}
_HEATING_POINTS = {"none": 6, "stove": 3, "other": 2}


def _age(birth: Optional[date], today: date) -> Optional[int]:
    if not birth:
        return None
    return today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))


def poverty_score(household, members: Iterable, poverty_line_cents: Optional[int] = None,
                  today: Optional[date] = None) -> int:
    """household: AidRecipient benzeri; members: HouseholdMember benzerleri."""
    today = today or date.today()
    line = poverty_line_cents or DEFAULT_POVERTY_LINE_CENTS
    members = list(members)
    size = max(len(members), household.household_size or 0, 1)

    income = household.monthly_income_cents
    if income is None and members:
        income = sum(m.monthly_income_cents or 0 for m in members)
    score = 0.0
    if income is not None:
        net_per_capita = (income - (household.rent_cents or 0)) / size
        score += 40 * min(1.0, max(0.0, 1 - net_per_capita / line))
    # Gelir bilinmiyorsa bu bileşen 0 kalır; saha incelemesinde doldurulmalı.

    dependants = 0
    for m in members:
        age = _age(m.birth_date, today)
        if age is not None and (age < 18 or age >= 65):
            dependants += 1
        if m.is_disabled:
            dependants += 1
        if m.has_chronic_illness:
            dependants += 1
    score += min(20, dependants * 4)

    if members and not any(m.is_working for m in members):
        score += 10

    score += _HOUSING_POINTS.get(household.housing_status or "", 0)
    score += _HEATING_POINTS.get(household.heating_type or "", 0)

    if household.debt_cents:
        score += 6 * min(1.0, household.debt_cents / (line * size * 3))

    reasons = [r for r in (household.poverty_reasons or []) if r in POVERTY_REASONS]
    score += min(10, 2 * len(set(reasons)))
    return int(round(min(100.0, score)))


def degree_for(score: int) -> str:
    if score >= 70:
        return "critical"
    if score >= 50:
        return "high"
    if score >= 30:
        return "medium"
    return "low"


def household_degree(household) -> str:
    return household.degree_override if household.degree_override in DEGREES else degree_for(household.poverty_score or 0)


async def poverty_line(db: AsyncSession, org_id: UUID) -> int:
    value = (await db.execute(
        select(OrganizationSettings.poverty_line_cents).where(OrganizationSettings.organization_id == org_id)
    )).scalars().first()
    return value or DEFAULT_POVERTY_LINE_CENTS


async def rescore(db: AsyncSession, household: AidRecipient) -> None:
    """Puanı yeniden hesaplar; aile bireyi varsa hane büyüklüğünü onlardan alır."""
    members = (await db.execute(
        select(HouseholdMember).where(HouseholdMember.recipient_id == household.id)
    )).scalars().all() if household.id else []
    if members:
        household.household_size = len(members)
    household.poverty_score = poverty_score(household, members, await poverty_line(db, household.organization_id))
