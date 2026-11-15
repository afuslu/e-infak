"""Real donor analytics: RFM scoring, interval-based churn risk, expected next gift date,
upgrade candidates, campaign preference, and rule-based narrative summary (no personal data sent externally).
"""
from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.donation import Donation, DonationStatus, Donor
from app.models.organization import Organization

logger = logging.getLogger(__name__)

CATEGORY_LABELS = {
    "genel": "Genel Bağış",
    "egitim": "Eğitim",
    "saglik": "Sağlık",
    "gida": "Gıda",
    "su": "Su Kuyusu",
    "yetim": "Yetim",
    "kurban": "Kurban",
    "insaat": "İnşaat",
    "zekat": "Zekât",
    "fitre": "Fitre",
    "fidye": "Fidye",
    "sadaka": "Sadaka",
    "adak": "Adak",
    "akika": "Akika",
}

SEGMENTS = {
    "champions": "Şampiyon Bağışçılar",
    "loyal": "Sadık Bağışçılar",
    "potential": "Yükselme Adayları",
    "at_risk": "Kayıp Riskinde Olanlar",
    "hibernating": "Uykuda Olanlar",
}


def _rfm_scores(days_since: int, count: int, total_cents: int) -> tuple[int, int, int, str]:
    r = 5 if days_since <= 30 else 4 if days_since <= 60 else 3 if days_since <= 120 else 2 if days_since <= 240 else 1
    f = 5 if count >= 10 else 4 if count >= 5 else 3 if count >= 3 else 2 if count == 2 else 1
    m = (
        5 if total_cents >= 1_000_000
        else 4 if total_cents >= 300_000
        else 3 if total_cents >= 100_000
        else 2 if total_cents >= 25_000
        else 1
    )
    if r >= 4 and f >= 4 and m >= 4:
        seg = "champions"
    elif r >= 3 and f >= 3:
        seg = "loyal"
    elif r >= 3 and f <= 2 and m >= 2:
        seg = "potential"
    elif r <= 2 and (f >= 2 or m >= 3):
        seg = "at_risk"
    else:
        seg = "hibernating"
    return r, f, m, seg


async def compute_org_insights(db: AsyncSession, org_id: UUID, mask_fn=None) -> dict[str, Any]:
    """Compute RFM, interval-based churn, upgrade candidates and category predictions for one tenant."""
    now = datetime.now(timezone.utc)
    donors = (
        await db.execute(
            select(Donor)
            .where(
                Donor.organization_id == org_id,
                func.coalesce(Donor.total_donations, 0) >= 1,
                Donor.last_donation_at.isnot(None),
            )
            .order_by(Donor.total_donated_cents.desc())
            .limit(500)
        )
    ).scalars().all()

    donor_ids = [d.id for d in donors]
    tx_by_donor: dict[UUID, list[tuple[datetime, int, str | None]]] = defaultdict(list)
    if donor_ids:
        paid_expr = func.coalesce(Donation.paid_at, Donation.created_at)
        rows = (
            await db.execute(
                select(
                    Donation.donor_id,
                    paid_expr,
                    Donation.amount_cents,
                    Campaign.title,
                )
                .outerjoin(Campaign, Campaign.id == Donation.campaign_id)
                .where(
                    Donation.organization_id == org_id,
                    Donation.status == DonationStatus.CONFIRMED,
                    Donation.donor_id.in_(donor_ids),
                )
                .order_by(paid_expr.asc())
            )
        ).all()
        for d_id, paid_at, amount_cents, camp_title in rows:
            if d_id and paid_at:
                dt = paid_at if paid_at.tzinfo else paid_at.replace(tzinfo=timezone.utc)
                tx_by_donor[d_id].append((dt, int(amount_cents or 0), camp_title))

    segment_counts: dict[str, int] = {k: 0 for k in SEGMENTS}
    churn_items: list[dict[str, Any]] = []
    upgrade_candidates: list[dict[str, Any]] = []

    for d in donors:
        last_dt = d.last_donation_at
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        days_since = max(0, (now - last_dt).days)
        txs = tx_by_donor.get(d.id, [])
        count = max(int(d.total_donations or 1), len(txs))
        total_cents = int(d.total_donated_cents or 0)

        # Average interval between consecutive gifts (defaults to 90 days for single-gift donors)
        if len(txs) >= 2:
            gaps = [max(1, (txs[i][0] - txs[i - 1][0]).days) for i in range(1, len(txs))]
            avg_interval_days = max(14, int(round(sum(gaps) / len(gaps))))
        else:
            avg_interval_days = 90

        expected_next = (last_dt + timedelta(days=avg_interval_days)).date().isoformat()
        overdue_ratio = days_since / max(avg_interval_days, 1)

        # Preferred campaign from past donations
        camp_counter = Counter(t[2] for t in txs if t[2])
        preferred_campaign = camp_counter.most_common(1)[0][0] if camp_counter else None

        r, f, m, seg = _rfm_scores(days_since, count, total_cents)
        segment_counts[seg] = segment_counts.get(seg, 0) + 1

        phone_out = mask_fn(d.phone) if mask_fn else d.phone

        # Upgrade candidate: recent donor with growing or consistent gifts ready for next tier or monthly
        if seg in ("potential", "loyal", "champions") and days_since <= 90:
            avg_gift = total_cents // max(count, 1)
            suggested_next_cents = int(round((avg_gift * 1.25) / 5000.0) * 5000) or 10_000
            upgrade_candidates.append(
                {
                    "donor_id": str(d.id),
                    "donor_name": d.full_name,
                    "donor_phone": phone_out,
                    "rfm_score": f"{r}{f}{m}",
                    "segment_label": SEGMENTS[seg],
                    "donation_count": count,
                    "total_donated_cents": total_cents,
                    "suggested_next_cents": suggested_next_cents,
                    "preferred_campaign": preferred_campaign or "Genel Bağış",
                    "expected_next_date": expected_next,
                }
            )

        # Churn candidate: overdue compared to their usual interval or inactive >= 45 days
        if days_since >= 45 or overdue_ratio >= 1.2:
            raw_risk = min(98.0, max(20.0, overdue_ratio * 45.0 + (12.0 if count >= 3 else 5.0)))
            risk = round(raw_risk, 1)
            camp_hint = f" ({preferred_campaign})" if preferred_campaign else ""
            if risk >= 80 and count >= 3:
                action = f"Mutad bağış süresi ({avg_interval_days} gün) aşıldı — özel teşekkür ve proje SMS'i gönder{camp_hint}"
            elif risk >= 75:
                action = f"Yüksek kayıp riski — kampanya hatırlatma SMS'i gönder{camp_hint}"
            else:
                action = f"Beklenen bağış tarihi: {expected_next} — faaliyet bilgilendirmesi paylaş{camp_hint}"

            churn_items.append(
                {
                    "donor_id": str(d.id),
                    "donor_name": d.full_name,
                    "donor_phone": phone_out,
                    "allow_sms": bool(d.allow_sms),
                    "last_donation_date": last_dt.date().isoformat(),
                    "days_since_last": days_since,
                    "avg_interval_days": avg_interval_days,
                    "expected_next_date": expected_next,
                    "rfm_score": f"{r}{f}{m}",
                    "segment": seg,
                    "segment_label": SEGMENTS[seg],
                    "preferred_campaign": preferred_campaign,
                    "donation_count": count,
                    "total_donated_cents": total_cents,
                    "risk_percentage": risk,
                    "recommended_action": action,
                }
            )

    churn_items.sort(key=lambda x: (-x["risk_percentage"], -x["total_donated_cents"]))
    upgrade_candidates.sort(key=lambda x: (-x["total_donated_cents"], -x["donation_count"]))
    high_risk_count = sum(1 for c in churn_items if c["risk_percentage"] >= 75)

    year_ago = now - timedelta(days=365)
    paid_expr = func.coalesce(Donation.paid_at, Donation.created_at)
    cat_rows = (
        await db.execute(
            select(
                Campaign.category,
                Donation.currency,
                func.count(func.distinct(Donation.donor_id)),
                func.count(Donation.id),
                func.avg(Donation.amount_cents),
                func.sum(Donation.amount_cents),
            )
            .join(Campaign, Campaign.id == Donation.campaign_id)
            .where(
                Donation.organization_id == org_id,
                Donation.status == DonationStatus.CONFIRMED,
                paid_expr >= year_ago,
            )
            .group_by(Campaign.category, Donation.currency)
            .order_by(func.sum(Donation.amount_cents).desc())
            .limit(10)
        )
    ).all()

    predictive_amounts = []
    for cat, currency, uniq_donors, tx_count, avg_cents, sum_cents in cat_rows:
        cat_key = cat.value if hasattr(cat, "value") else str(cat)
        predictive_amounts.append(
            {
                "campaign_category": CATEGORY_LABELS.get(cat_key, cat_key.title()),
                "currency": (currency or "TRY").upper(),
                "suggested_avg_cents": int(round(avg_cents or 0)),
                "suggested_avg_lira": round((avg_cents or 0) / 100, 2),
                "expected_donor_count": int(uniq_donors or 0),
                "donation_count": int(tx_count or 0),
                "total_cents": int(sum_cents or 0),
            }
        )

    ninety_days_ago = now - timedelta(days=90)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    try_90_cents = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(Donation.amount_cents), 0)).where(
                    Donation.organization_id == org_id,
                    Donation.status == DonationStatus.CONFIRMED,
                    Donation.currency == "TRY",
                    paid_expr >= ninety_days_ago,
                )
            )
        ).scalar()
        or 0
    )
    current_month_try_cents = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(Donation.amount_cents), 0)).where(
                    Donation.organization_id == org_id,
                    Donation.status == DonationStatus.CONFIRMED,
                    Donation.currency == "TRY",
                    paid_expr >= month_start,
                )
            )
        ).scalar()
        or 0
    )

    analyzed_count = len(donors)
    top_cat = predictive_amounts[0]["campaign_category"] if predictive_amounts else "Genel Bağış"
    narrative = (
        f"Toplam {analyzed_count} aktif bağışçı RFM modeline göre analiz edildi: "
        f"{segment_counts['champions']} şampiyon, {segment_counts['loyal']} sadık, "
        f"{segment_counts['potential']} yükselme adayı ve {len(churn_items)} kayıp riski taşıyan bağışçı tespit edildi. "
        f"Son 12 ayda en yüksek katkı '{top_cat}' kategorisinde gerçekleşti."
    )

    return {
        "churn_list": churn_items[:30],
        "upgrade_candidates": upgrade_candidates[:20],
        "predictive_amounts": predictive_amounts,
        "segments": [
            {"key": k, "label": label, "count": segment_counts.get(k, 0)}
            for k, label in SEGMENTS.items()
        ],
        "narrative": narrative,
        "summary": {
            "analyzed_donors": analyzed_count,
            "at_risk_count": len(churn_items),
            "high_risk_count": high_risk_count,
            "upgrade_count": len(upgrade_candidates),
            "avg_monthly_try_cents": try_90_cents // 3,
            "current_month_try_cents": current_month_try_cents,
        },
    }


async def compute_all(db_factory) -> dict[str, int]:
    """Nightly Celery entry point: compute insights across active organisations."""
    async with db_factory() as db:
        org_ids = (
            await db.execute(select(Organization.id).where(Organization.is_active.is_(True)))
        ).scalars().all()
    processed = 0
    for org_id in org_ids:
        async with db_factory() as db:
            try:
                await compute_org_insights(db, org_id)
                processed += 1
            except Exception:
                logger.exception("Bağışçı analizi hesaplanamadı: %s", org_id)
    return {"organizations": processed}
