import uuid
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from starlette.requests import Request

from app.api.deps import require_admin_route_permission
from app.api.v1 import reminders as api
from app.models.donation import Donor
from app.models.donor_reminder import DonorReminder
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services import reminders as svc

TZ = svc.TZ

# The eight lines on the Wise Reminder screen the request came with: every way a number gets typed.
WISE_SCREEN = """Tamamlanmış
(543) 352 66 28 CMESUT DESOVOLU GAZZE İÇİN YEMEK BAĞIŞI ...
23.10.2026 11:15:52
(538) 334 35 30 YASİN TEZCAN GAZZE YEMEK ARAYIN DEDİ
15.10.2026 14:30:36
(535) 071 01 09 FIRAT BULUT GAZZE YEMEK İÇİN ARAYIN DEDİ
14.10.2026 11:22:53
0532 223 36 10 SİNAN BAŞYAPTAN GAZZE İÇİN YEMEK
6.11.2026 11:16:50
(546) 427 22 52  ŞÜKRÜ DOĞAN 15 EKİM' GAZZE'YE YEMEK YARDI...
15.10.2026 11:21:41
(536) 557 00 26 RAMAZAN ÜNAL 16 EKİM CUMA BENİ ARAYIN DEDİ
16.10.2026 11:16:22
(543) 902 01 01  ALPARSLAN SAYAN GAZZE YEMEK NAFİLE 13 EKİ...
13.10.2026 11:28:46
5557352591  YAVUZ YILDIRIM  26 EKİMDE ARAYIN DEDİ
26.10.2026 11:30:44
"""


def _request(org, method="GET", path="/api/v1/admin-features/reminders"):
    request = Request({"type": "http", "method": method, "path": path, "headers": [], "query_string": b"", "client": ("1.2.3.4", 1)})
    request.state.organization_id = str(org.id)
    request.state.organization = org
    return request


async def _setup(db, role=UserRole.STK_ADMIN):
    slug = f"o-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name="Test Derneği", legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="ileri", enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    admin = User(organization_id=org.id, email=f"{slug}@example.com", hashed_password="x",
                 first_name="Ayşe", last_name="Y", role=role)
    db.add(admin)
    await db.flush()
    return org, admin


# --- Pure rules ----------------------------------------------------------------------------------

@pytest.mark.parametrize("text,phone", [
    ("(543) 352 66 28 CMESUT DESOVOLU", "5433526628"),
    ("0532 223 36 10 SİNAN BAŞYAPTAN", "5322233610"),
    ("5557352591  YAVUZ YILDIRIM", "5557352591"),
    ("+90 212 555 44 33 Vakıf", "2125554433"),
    ("Ali bey 05321234567 arayın", "5321234567"),
    ("26 EKİMDE ARAYIN DEDİ", None),
])
def test_phone_is_found_in_free_text(text, phone):
    assert svc.find_phone(text) == phone


def test_name_is_guessed_from_words_after_the_phone():
    assert svc.suggested_name("0532 223 36 10 SİNAN BAŞYAPTAN GAZZE İÇİN") == ("Sinan", "Başyaptan")
    assert svc.suggested_name("(536) 557 00 26 RAMAZAN ÜNAL 16 EKİM") == ("Ramazan", "Ünal")
    assert svc.suggested_name("(535) 071 01 09 FIRAT BULUT") == ("Fırat", "Bulut")
    assert svc.suggested_name("5557352591") == ("", "")


def test_wise_reminder_screen_is_parsed():
    rows = svc.parse_wise_reminder_text(WISE_SCREEN)
    assert len(rows) == 8
    assert [r.phone for r in rows] == [
        "5433526628", "5383343530", "5350710109", "5322233610",
        "5464272252", "5365570026", "5439020101", "5557352591",
    ]
    assert rows[0].remind_at == datetime(2026, 10, 23, 11, 15, 52, tzinfo=TZ)
    assert rows[3].remind_at == datetime(2026, 11, 6, 11, 16, 50, tzinfo=TZ)
    assert rows[3].content.startswith("0532 223 36 10 SİNAN")


def test_csv_export_with_date_column_is_parsed():
    rows = svc.parse_wise_reminder_text('Metin;Tarih\n"0532 111 22 33 Ali Veli";"01.12.2026 10:00"\n')
    assert len(rows) == 1
    assert rows[0].phone == "5321112233" and rows[0].remind_at == datetime(2026, 12, 1, 10, 0, tzinfo=TZ)


def test_monthly_repeat_keeps_the_clock_and_month_end():
    start = datetime(2026, 1, 31, 10, 0, tzinfo=TZ)
    assert svc.next_time(start, "monthly", start) == datetime(2026, 2, 28, 10, 0, tzinfo=TZ)
    assert svc.next_time(start, "monthly", datetime(2026, 3, 1, tzinfo=TZ)) == datetime(2026, 3, 31, 10, 0, tzinfo=TZ)
    assert svc.next_time(start, "none", start) is None


# --- API -----------------------------------------------------------------------------------------

async def test_reminder_route_is_open_to_every_staff_member():
    org = Organization(slug="x")
    clerk = User(role=UserRole.EDITOR)
    for method in ("GET", "POST"):
        assert await require_admin_route_permission(
            Request({"type": "http", "method": method, "path": "/api/v1/admin-features/reminders", "headers": []}), clerk)


async def test_create_links_donor_by_phone_and_lists_only_own(db_session):
    org, admin = await _setup(db_session)
    other = User(organization_id=org.id, email=f"b-{uuid.uuid4().hex[:6]}@x.com", hashed_password="x", first_name="Can", last_name="K", role=UserRole.STK_ADMIN)
    donor = Donor(organization_id=org.id, first_name="Sinan", last_name="Başyaptan", phone="905322233610",
                  total_donations=0, total_donated_cents=0)
    db_session.add_all([other, donor])
    await db_session.flush()

    when = datetime.now(TZ) + timedelta(hours=2)
    out = await api.create_reminder(_request(org, "POST"), api.ReminderIn(
        content="0532 223 36 10 SİNAN BAŞYAPTAN GAZZE İÇİN YEMEK", remind_at=when), db_session, admin)
    assert out["donor"]["id"] == str(donor.id)
    assert out["phone"] == "5322233610"

    await api.create_reminder(_request(org, "POST"), api.ReminderIn(content="Başkasının notu", remind_at=when), db_session, other)
    mine = await api.list_reminders(_request(org), "acik", None, 300, db_session, admin)
    assert [r["content"] for r in mine] == ["0532 223 36 10 SİNAN BAŞYAPTAN GAZZE İÇİN YEMEK"]
    found = await api.list_reminders(_request(org), "acik", "2233610", 300, db_session, admin)
    assert len(found) == 1

    card = await api.donor_reminders(_request(org), donor.id, db_session, admin)
    assert len(card) == 1 and card[0]["mine"] is True

    with pytest.raises(HTTPException) as exc:
        await api.complete_reminder(_request(org, "POST"), uuid.UUID(out["id"]), db_session, other)
    assert exc.value.status_code == 404


async def test_complete_snooze_reopen_and_repeat(db_session):
    org, admin = await _setup(db_session)
    past = datetime.now(TZ) - timedelta(minutes=5)
    once = await api.create_reminder(_request(org, "POST"), api.ReminderIn(content="Bir kere", remind_at=past), db_session, admin)
    monthly = await api.create_reminder(_request(org, "POST"), api.ReminderIn(
        content="Her ay aidat", remind_at=past, repeat="monthly"), db_session, admin)

    summary = await api.reminder_summary(_request(org), db_session, admin)
    assert summary["vadesi_gelen"] == 2

    done = await api.complete_reminder(_request(org, "POST"), uuid.UUID(once["id"]), db_session, admin)
    assert done["completed_at"] is not None
    moved = await api.complete_reminder(_request(org, "POST"), uuid.UUID(monthly["id"]), db_session, admin)
    assert moved["completed_at"] is None
    assert datetime.fromisoformat(moved["remind_at"]) > datetime.now(TZ)

    finished = await api.list_reminders(_request(org), "tamamlanan", None, 300, db_session, admin)
    assert sorted(r["content"] for r in finished) == ["Bir kere", "Her ay aidat"]

    reopened = await api.reopen_reminder(_request(org, "POST"), uuid.UUID(once["id"]), db_session, admin)
    assert reopened["completed_at"] is None
    later = datetime.now(TZ) + timedelta(minutes=10)
    snoozed = await api.update_reminder(_request(org, "PATCH"), uuid.UUID(once["id"]),
                                        api.ReminderPatch(remind_at=later), db_session, admin)
    assert snoozed["notified_at"] is None
    assert datetime.fromisoformat(snoozed["remind_at"]) == later


async def test_due_reminders_are_pushed_once(db_session, monkeypatch):
    from app.models.device_token import DeviceToken
    from app.models.staff_notification import StaffNotification, StaffNotificationSetting
    from app.services import staff_notify

    org, admin = await _setup(db_session)
    donor = Donor(organization_id=org.id, first_name="Yavuz", last_name="Yıldırım", phone="05551112233",
                  total_donations=0, total_donated_cents=0)
    tok = f"ExponentPushToken[rem-{uuid.uuid4().hex[:8]}]"
    db_session.add_all([donor, DeviceToken(organization_id=org.id, user_id=admin.id, token=tok, platform="ios")])
    await db_session.flush()

    sent = []

    async def fake_push(tokens, title, body, data=None, *, badge=None, channel_id="default", category_id=None, errors=None):
        tokens = list(tokens)
        sent.append((tokens, title, body, data, channel_id))
        return len(tokens), []

    monkeypatch.setattr("app.services.push_service.push_messages", fake_push)
    monkeypatch.setattr(staff_notify, "_quiet", lambda now=None: False)

    now = datetime.now(TZ)
    due = DonorReminder(organization_id=org.id, created_by_id=admin.id, donor_id=donor.id, content="Ara: Yavuz", remind_at=now - timedelta(minutes=1))
    future = DonorReminder(organization_id=org.id, created_by_id=admin.id, content="Sonra", remind_at=now + timedelta(hours=1))
    done = DonorReminder(organization_id=org.id, created_by_id=admin.id, content="Bitti", remind_at=now - timedelta(hours=1), completed_at=now)
    db_session.add_all([due, future, done])
    await db_session.commit()

    await svc.send_due(db_session, now)
    await svc.send_due(db_session, now)
    mine = [s for s in sent if tok in s[0]]
    assert len(mine) == 1
    assert "Ara: Yavuz" in mine[0][2]
    assert mine[0][3]["reminder_id"] == str(due.id)
    assert mine[0][3]["route"] == "donor" and mine[0][3]["donor_id"] == str(donor.id)
    assert mine[0][4] == "tasks"

    # Also stored in inbox, and turning donor_reminders off suppresses phone push while keeping inbox entry:
    db_session.add(StaffNotificationSetting(user_id=admin.id, settings={"donor_reminders": False}))
    muted_due = DonorReminder(organization_id=org.id, created_by_id=admin.id, content="Sessiz hatırlatma", remind_at=now - timedelta(seconds=10))
    db_session.add(muted_due)
    await db_session.commit()
    await svc.send_due(db_session, now)
    assert len([s for s in sent if tok in s[0]]) == 1  # no second phone push
    notes = (await db_session.execute(select(StaffNotification).where(
        StaffNotification.user_id == admin.id, StaffNotification.kind == "donor_reminder"))).scalars().all()
    assert len(notes) == 2


async def test_wise_reminder_import_matches_and_skips_duplicates(db_session):
    org, admin = await _setup(db_session)
    known = Donor(organization_id=org.id, first_name="Yavuz", last_name="Yıldırım", phone="05557352591",
                  total_donations=0, total_donated_cents=0)
    db_session.add(known)
    await db_session.flush()

    preview = await api.import_reminders(_request(org, "POST"), api.ImportIn(text=WISE_SCREEN), db_session, admin)
    assert preview["total"] == 8 and preview["matched"] == 1 and preview["created"] == 0

    result = await api.import_reminders(_request(org, "POST"), api.ImportIn(
        text=WISE_SCREEN, completed=True, dry_run=False, create_donors=True), db_session, admin)
    assert result["created"] == 8 and result["new_donors"] == 7
    rows = (await db_session.execute(select(DonorReminder).where(DonorReminder.organization_id == org.id))).scalars().all()
    assert all(r.completed_at and r.notified_at and r.donor_id for r in rows)
    sinan = (await db_session.execute(select(Donor).where(Donor.organization_id == org.id, Donor.first_name == "Sinan"))).scalar_one()
    assert sinan.last_name == "Başyaptan" and sinan.phone == "05322233610"

    again = await api.import_reminders(_request(org, "POST"), api.ImportIn(
        text=WISE_SCREEN, completed=True, dry_run=False), db_session, admin)
    assert again["created"] == 0 and again["skipped"] == 8
