"""Unit tests for the Call Center 'Bugün Kimi Arayalım?' smart donor scoring engine."""
from datetime import datetime, timedelta, timezone

from app.services.smart_call_queue import score_donor_candidate


def test_monthly_cadence_donor_scores_high_when_due():
    now = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)
    donations = [
        {"amount_cents": 150_000, "paid_at": now - timedelta(days=122), "campaign_title": "Yetim Destek"},
        {"amount_cents": 150_000, "paid_at": now - timedelta(days=91), "campaign_title": "Yetim Destek"},
        {"amount_cents": 150_000, "paid_at": now - timedelta(days=61), "campaign_title": "Yetim Destek"},
        {"amount_cents": 150_000, "paid_at": now - timedelta(days=31), "campaign_title": "Yetim Destek"},
    ]
    res = score_donor_candidate(
        donor_id="d1",
        full_name="Ahmet Yılmaz",
        phone="05321234567",
        city="İstanbul",
        donations=donations,
        last_called_at=None,
        missed_incoming_at=None,
        now=now,
    )
    assert res is not None
    assert "monthly" in res["categories"]
    assert res["score"] >= 35
    assert res["avg_gap_days"] in range(29, 32)


def test_missed_incoming_call_gets_top_priority():
    now = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)
    res = score_donor_candidate(
        donor_id="d2",
        full_name="Fatma Kaya",
        phone="05321112233",
        city="Ankara",
        donations=[{"amount_cents": 50_000, "paid_at": now - timedelta(days=10), "campaign_title": "Genel"}],
        last_called_at=None,
        missed_incoming_at=now - timedelta(hours=4),
        now=now,
    )
    assert res is not None
    assert res["category"] == "missed_callback"
    assert res["score"] >= 45


def test_seasonal_kurban_donor_detected():
    now = datetime(2026, 11, 21, 12, 0, tzinfo=timezone.utc)
    res = score_donor_candidate(
        donor_id="d3",
        full_name="Mehmet Demir",
        phone="05329998877",
        city="Bursa",
        donations=[
            {"amount_cents": 500_000, "paid_at": datetime(2025, 11, 15, 10, 0, tzinfo=timezone.utc), "campaign_title": "Kurban Hisse"},
            {"amount_cents": 600_000, "paid_at": datetime(2025, 6, 10, 10, 0, tzinfo=timezone.utc), "campaign_title": "Ramazan Kumanya"},
        ],
        last_called_at=None,
        missed_incoming_at=None,
        now=now,
    )
    assert res is not None
    assert "seasonal" in res["categories"]
    assert "high_value" in res["categories"]
    assert res["priority"] == "high"
