"""'Bugün Kimi Arayalım?' — Çağrı Merkezi Akıllı Bağışçı Önceliklendirme Motoru.

Geçmiş bağış alışkanlıkları (aylık düzen, mevsimsel Ramazan/Kurban/aynı ay tekrarı,
pasifleşme riski, yüksek toplam tutar ve cevapsız gelen çağrılar) üzerinden her bağışçıya
0–100 arası öncelik puanı, gerekçe etiketleri ve kısa görüşme açılış önerisi üretir.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.channels import CallLog
from app.models.donation import Donation, DonationStatus, Donor

SEASONAL_KEYWORDS = ("ramazan", "kurban", "zekat", "zekât", "fitre", "fidye", "iftar", "kumanya", "bayram")


def _money_tr(cents: int) -> str:
    return f"{cents / 100:,.0f} ₺".replace(",", ".")


def score_donor_candidate(
    *,
    donor_id: str,
    full_name: str,
    phone: str,
    city: Optional[str],
    donations: Iterable[dict[str, Any]],
    last_called_at: Optional[datetime],
    missed_incoming_at: Optional[datetime],
    now: datetime,
) -> Optional[dict[str, Any]]:
    """Pure scoring function for a single donor's confirmed donation history."""
    rows = sorted(
        [d for d in donations if d.get("paid_at") is not None],
        key=lambda d: d["paid_at"],
    )
    if not rows and not missed_incoming_at:
        return None

    total_cents = sum(int(d.get("amount_cents") or 0) for d in rows)
    count = len(rows)
    last_row = rows[-1] if rows else None
    last_dt: Optional[datetime] = last_row["paid_at"] if last_row else None
    if last_dt and last_dt.tzinfo is None:
        last_dt = last_dt.replace(tzinfo=timezone.utc)
    days_since_last = max(0, (now - last_dt).days) if last_dt else None
    last_campaign = (last_row.get("campaign_title") or "Genel Bağış") if last_row else None

    # Average interval between consecutive donations (for cadence detection)
    gaps: list[int] = []
    for i in range(1, len(rows)):
        d0, d1 = rows[i - 1]["paid_at"], rows[i]["paid_at"]
        if d0.tzinfo is None:
            d0 = d0.replace(tzinfo=timezone.utc)
        if d1.tzinfo is None:
            d1 = d1.replace(tzinfo=timezone.utc)
        delta = (d1 - d0).days
        if delta >= 3:  # same-day multi-line basket donations are one giving occasion
            gaps.append(delta)
    avg_gap_days = round(sum(gaps) / len(gaps)) if gaps else None

    score = 0
    reasons: list[str] = []
    categories: list[str] = []

    # 1. Unanswered incoming call within last 72h (highest urgency)
    if missed_incoming_at:
        m_dt = missed_incoming_at if missed_incoming_at.tzinfo else missed_incoming_at.replace(tzinfo=timezone.utc)
        lc_dt = (last_called_at if last_called_at.tzinfo else last_called_at.replace(tzinfo=timezone.utc)) if last_called_at else None
        if (now - m_dt) <= timedelta(days=3) and (not lc_dt or lc_dt < m_dt):
            score += 45
            reasons.append("Son 72 saatte cevapsız gelen çağrı — geri dönüş bekliyor")
            categories.append("missed_callback")

    # 2. Monthly giving cadence due
    if count >= 3 and avg_gap_days is not None and 18 <= avg_gap_days <= 45 and days_since_last is not None:
        if days_since_last >= int(avg_gap_days * 0.85):
            score += 35
            reasons.append(f"Aylık bağış düzeni (ort. {avg_gap_days} gün) · son bağış {days_since_last} gün önce")
            categories.append("monthly")

    # 3. Churn / lapse risk for repeat or high-value donors
    if days_since_last is not None:
        overdue_cadence = avg_gap_days is not None and days_since_last >= max(45, int(avg_gap_days * 1.5))
        if (count >= 2 and 60 <= days_since_last <= 365) or overdue_cadence:
            score += 30
            reasons.append(f"Pasifleşme riski · {count} bağış sonrası {days_since_last} gündür işlem yok")
            categories.append("churn_risk")
        elif count == 1 and 45 <= days_since_last <= 150 and total_cents >= 100_000:
            score += 20
            reasons.append(f"İlk bağış ({_money_tr(total_cents)}) sonrası {days_since_last} gün geçti")
            categories.append("churn_risk")

    # 4. Seasonal pattern (donated in the same/adjacent calendar month in a prior year, or Kurban/Ramazan donor)
    same_season_prior = False
    seasonal_campaign_hit = False
    for d in rows:
        dt = d["paid_at"]
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt.year < now.year:
            month_diff = min(abs(dt.month - now.month), 12 - abs(dt.month - now.month))
            if month_diff <= 1:
                same_season_prior = True
        title_low = (d.get("campaign_title") or "").lower()
        if any(kw in title_low for kw in SEASONAL_KEYWORDS):
            seasonal_campaign_hit = True

    if same_season_prior and (days_since_last is None or days_since_last >= 25):
        score += 25
        reasons.append("Geçen yıl bu dönemlerde bağış yapmış")
        categories.append("seasonal")
    elif seasonal_campaign_hit and (days_since_last is None or days_since_last >= 40):
        score += 18
        reasons.append("Ramazan / Kurban dönemi bağışçısı")
        categories.append("seasonal")

    # 5. High-value donor multiplier
    if total_cents >= 1_000_000:  # 10.000+ TL
        score += 20
        reasons.append(f"Yüksek tutarlı bağışçı ({_money_tr(total_cents)})")
        categories.append("high_value")
    elif total_cents >= 250_000:  # 2.500+ TL
        score += 10
        reasons.append(f"Değerli bağışçı ({_money_tr(total_cents)})")
        if not categories:
            categories.append("high_value")

    if score <= 0:
        return None

    score = min(100, score)
    primary_category = categories[0] if categories else "high_value"
    priority = "high" if score >= 60 else "medium" if score >= 35 else "normal"

    first_name = full_name.split()[0] if full_name.strip() else "Değerli bağışçımız"
    if primary_category == "missed_callback":
        script = f"Merhaba {first_name} Bey/Hanım, kurumumuzu aramıştınız; size yardımcı olmak için dönüş yapıyoruz."
    elif primary_category == "monthly":
        script = f"Merhaba {first_name} Bey/Hanım, düzenli destekleriniz için teşekkür ederiz; bu ayki {last_campaign} bağışınız için bilgi vermek istedik."
    elif primary_category == "seasonal":
        script = f"Merhaba {first_name} Bey/Hanım, önceki dönem {last_campaign} desteğiniz için teşekkür ederiz; yeni dönem çalışmalarımızı paylaşmak istedik."
    elif primary_category == "churn_risk":
        script = f"Merhaba {first_name} Bey/Hanım, uzun süredir görüşemedik; geçmiş desteklerinizin sahadaki sonuçlarını paylaşmak için aradık."
    else:
        script = f"Merhaba {first_name} Bey/Hanım, kurumumuza bugüne kadar verdiğiniz değerli destekler için teşekkür etmek ve yeni projelerimizi aktarmak istedik."

    return {
        "donor_id": donor_id,
        "full_name": full_name,
        "phone": phone,
        "city": city,
        "score": score,
        "priority": priority,
        "category": primary_category,
        "categories": list(dict.fromkeys(categories)),
        "reasons": reasons[:3],
        "suggested_script": script,
        "total_cents": total_cents,
        "donation_count": count,
        "avg_gap_days": avg_gap_days,
        "days_since_last": days_since_last,
        "last_donation_at": last_dt.isoformat() if last_dt else None,
        "last_campaign": last_campaign,
        "last_called_at": last_called_at.isoformat() if last_called_at else None,
    }


async def build_smart_call_queue(
    db: AsyncSession,
    organization_id: UUID,
    *,
    focus: str = "all",
    cooldown_days: int = 7,
    limit: int = 30,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """Query active donors with phone numbers and rank today's highest-priority call list."""
    now = now or datetime.now(timezone.utc)
    since_history = now - timedelta(days=550)  # ~18 months for seasonal + monthly cadence

    # Donors with a usable phone number (limit to top 1500 by recency/total for fast query)
    donors = (await db.execute(
        select(Donor)
        .where(
            Donor.organization_id == organization_id,
            Donor.phone.is_not(None),
            func.length(func.trim(Donor.phone)) >= 7,
        )
        .order_by(Donor.total_donated_cents.desc().nullslast(), Donor.last_donation_at.desc().nullslast())
        .limit(1500)
    )).scalars().all()
    if not donors:
        return {"items": [], "counts": {"all": 0, "monthly": 0, "churn_risk": 0, "seasonal": 0, "high_value": 0, "missed_callback": 0}}

    donor_ids = [d.id for d in donors]

    # Confirmed donations in last 18 months
    don_rows = (await db.execute(
        select(
            Donation.donor_id,
            Donation.amount_cents,
            func.coalesce(Donation.paid_at, Donation.created_at).label("paid_at"),
            Campaign.title.label("campaign_title"),
        )
        .outerjoin(Campaign, Campaign.id == Donation.campaign_id)
        .where(
            Donation.organization_id == organization_id,
            Donation.donor_id.in_(donor_ids),
            Donation.status == DonationStatus.CONFIRMED,
            func.coalesce(Donation.paid_at, Donation.created_at) >= since_history,
        )
    )).all()
    by_donor: dict[UUID, list[dict[str, Any]]] = {}
    for d_id, amount_cents, paid_at, camp_title in don_rows:
        by_donor.setdefault(d_id, []).append({
            "amount_cents": amount_cents,
            "paid_at": paid_at,
            "campaign_title": camp_title,
        })

    # Recent calls for cooldown and missed incoming callback detection
    call_rows = (await db.execute(
        select(
            CallLog.donor_id,
            CallLog.direction,
            CallLog.status,
            func.max(CallLog.started_at).label("latest"),
        )
        .where(
            CallLog.organization_id == organization_id,
            CallLog.donor_id.in_(donor_ids),
            CallLog.started_at >= now - timedelta(days=max(cooldown_days, 7)),
        )
        .group_by(CallLog.donor_id, CallLog.direction, CallLog.status)
    )).all()

    last_called: dict[UUID, datetime] = {}
    missed_in: dict[UUID, datetime] = {}
    for d_id, direction, st, latest in call_rows:
        if not latest:
            continue
        if direction == "out" or st in ("answered", "ended"):
            if d_id not in last_called or latest > last_called[d_id]:
                last_called[d_id] = latest
        if direction == "in" and st in ("missed", "busy"):
            if d_id not in missed_in or latest > missed_in[d_id]:
                missed_in[d_id] = latest

    cooldown_cutoff = now - timedelta(days=cooldown_days) if cooldown_days > 0 else None
    scored: list[dict[str, Any]] = []
    for donor in donors:
        lc = last_called.get(donor.id)
        mi = missed_in.get(donor.id)
        if cooldown_cutoff and lc:
            lc_tz = lc if lc.tzinfo else lc.replace(tzinfo=timezone.utc)
            has_newer_missed = mi and (mi if mi.tzinfo else mi.replace(tzinfo=timezone.utc)) > lc_tz
            if lc_tz >= cooldown_cutoff and not has_newer_missed:
                continue
        item = score_donor_candidate(
            donor_id=str(donor.id),
            full_name=donor.full_name,
            phone=donor.phone or "",
            city=donor.city,
            donations=by_donor.get(donor.id, []),
            last_called_at=lc,
            missed_incoming_at=mi,
            now=now,
        )
        if item:
            scored.append(item)

    scored.sort(key=lambda x: (-x["score"], -x["total_cents"]))
    counts = {
        "all": len(scored),
        "missed_callback": sum(1 for x in scored if "missed_callback" in x["categories"]),
        "monthly": sum(1 for x in scored if "monthly" in x["categories"]),
        "churn_risk": sum(1 for x in scored if "churn_risk" in x["categories"]),
        "seasonal": sum(1 for x in scored if "seasonal" in x["categories"]),
        "high_value": sum(1 for x in scored if "high_value" in x["categories"]),
    }
    if focus != "all":
        scored = [x for x in scored if focus in x["categories"]]
    return {"items": scored[:limit], "counts": counts}
