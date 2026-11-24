"""Online bağışta bağışçı kartı eşleşmesi: e-posta/telefon tek başına yetmez, ad soyad da tutmalı."""
import uuid

from app.api.v1.checkout import _get_or_create_donor, _same_person
from app.models.donation import Donor
from app.models.organization import Organization
from app.schemas.checkout import CheckoutDonor


async def _org(db):
    slug = f"t-{uuid.uuid4().hex[:8]}"
    org = Organization(slug=slug, name=slug, legal_name=slug, email=f"{slug}@example.com",
                       primary_domain=f"{slug}.example.com", plan="baslangic", enabled_addons=[], extra_user_seats=0)
    db.add(org)
    await db.flush()
    return org


def _form(first, last, email="ortak@dernek.org", phone="0532 111 22 33"):
    return CheckoutDonor(first_name=first, last_name=last, email=email, phone=phone)


def test_same_person_ignores_case_turkish_letters_and_middle_names():
    card = Donor(first_name="MEHMET ALİ", last_name="Çırak")
    assert _same_person(card, "mehmet ali", "CIRAK")
    assert _same_person(card, "Mehmet", "çırak")
    assert not _same_person(card, "Ahmet", "Çırak")
    assert not _same_person(card, "Mehmet Ali", "Kaya")
    assert _same_person(Donor(first_name=None, last_name=None), "Kim", "Olursa")


async def test_shared_email_or_phone_with_other_name_opens_new_card(db_session):
    org = await _org(db_session)
    staff = Donor(organization_id=org.id, first_name="Seçkin", last_name="Kara", email="ortak@dernek.org",
                  phone="905321112233")
    db_session.add(staff)
    await db_session.flush()

    other, payer = await _get_or_create_donor(org.id, _form("Ali", "Veli"), db_session)
    assert other.id != staff.id and payer is None
    assert (other.first_name, other.last_name) == ("Ali", "Veli")

    by_phone_only, _ = await _get_or_create_donor(org.id, _form("Ayşe", "Yılmaz", email="ayse@example.com"), db_session)
    assert by_phone_only.id not in (staff.id, other.id)


async def test_same_name_and_contact_reuses_card_without_rewriting_contact(db_session):
    org = await _org(db_session)
    card = Donor(organization_id=org.id, first_name="Seçkin", last_name="Kara", email="seckin@example.com",
                 phone="905321112233")
    db_session.add(card)
    await db_session.flush()

    found, payer = await _get_or_create_donor(org.id, _form("SEÇKİN", "kara", email="yeni@example.com"), db_session)
    assert found.id == card.id
    assert card.email == "seckin@example.com"
    assert payer["email"] == "yeni@example.com"


async def test_picks_the_matching_card_among_several_with_same_phone(db_session):
    org = await _org(db_session)
    first = Donor(organization_id=org.id, first_name="Fatma", last_name="Demir", phone="905321112233")
    second = Donor(organization_id=org.id, first_name="Hasan", last_name="Demir", phone="905321112233")
    db_session.add_all([first, second])
    await db_session.flush()

    found, _ = await _get_or_create_donor(org.id, _form("Hasan", "Demir", email="hasan@example.com"), db_session)
    assert found.id == second.id


async def _make_order(db, org, donor, method="credit_card"):
    from app.models.campaign import Campaign, CampaignCategory, CampaignStatus
    from app.models.payment import PaymentAttempt, PaymentOrder, PaymentOrderItem, PaymentOrderStatus

    camp = Campaign(
        organization_id=org.id,
        slug=f"c-{uuid.uuid4().hex[:8]}",
        title="Genel Bağış",
        category=CampaignCategory.GENEL,
        status=CampaignStatus.ACTIVE,
        summary="s",
        target_cents=100_000,
    )
    db.add(camp)
    await db.flush()
    order = PaymentOrder(
        organization_id=org.id,
        donor_id=donor.id,
        merchant_payment_id=f"MP-{uuid.uuid4().hex[:10]}",
        idempotency_key=f"IK-{uuid.uuid4().hex[:10]}",
        payment_method=method,
        status=PaymentOrderStatus.PENDING,
        total_cents=50_000,
        currency="TRY",
    )
    db.add(order)
    await db.flush()
    item = PaymentOrderItem(
        order_id=order.id,
        campaign_id=camp.id,
        quantity=1,
        unit_amount_cents=50_000,
        total_amount_cents=50_000,
    )
    attempt = PaymentAttempt(
        order_id=order.id,
        provider="iyzico" if method == "credit_card" else "bank_transfer",
        pg_tran_id=f"TR-{uuid.uuid4().hex[:8]}",
        safe_response={"ok": True},
    )
    db.add_all([item, attempt])
    await db.flush()
    return order, attempt


async def _staff_user(db, org, *, is_active=True):
    from app.models.user import User, UserRole

    u = User(
        organization_id=org.id,
        email=f"u-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x",
        first_name="Ali",
        last_name="Temsilci",
        role=UserRole.CRM,
        is_active=is_active,
    )
    db.add(u)
    await db.flush()
    return u


async def test_online_card_auto_assigns_to_donors_active_representative(db_session):
    from sqlalchemy import select
    from app.api.v1.checkout import _finalize_paid_order, _load_order
    from app.api.v1.crm import created_type
    from app.models.donation import Donation

    org = await _org(db_session)
    rep = await _staff_user(db_session, org)
    donor = Donor(organization_id=org.id, first_name="Ayşe", last_name="Kaya", assigned_user_id=rep.id)
    db_session.add(donor)
    await db_session.flush()

    order, attempt = await _make_order(db_session, org, donor, method="credit_card")
    loaded = await _load_order(db_session, order.id)
    donation_ids = await _finalize_paid_order(db_session, loaded, attempt, commit=False)
    assert len(donation_ids) == 1

    donation = (await db_session.execute(select(Donation).where(Donation.id == uuid.UUID(donation_ids[0])))).scalar_one()
    assert donation.issued_by_id == rep.id
    assert (donation.payment_details or {}).get("auto_assigned_staff") is True
    assert created_type(donation) == "Web"


async def test_online_card_falls_back_to_active_staff_and_skips_inactive_or_unassigned(db_session):
    from sqlalchemy import select
    from app.api.v1.checkout import _finalize_paid_order, _load_order
    from app.models.donation import Donation

    org = await _org(db_session)
    inactive_rep = await _staff_user(db_session, org, is_active=False)
    active_staff = await _staff_user(db_session, org, is_active=True)

    # Inactive representative -> falls back to active staff_user_id
    d1 = Donor(organization_id=org.id, first_name="Veli", last_name="Can",
               assigned_user_id=inactive_rep.id, staff_user_id=active_staff.id)
    # No representative / staff -> remains None ("Online (otomatik)")
    d2 = Donor(organization_id=org.id, first_name="Mehmet", last_name="Ak")
    db_session.add_all([d1, d2])
    await db_session.flush()

    o1, a1 = await _make_order(db_session, org, d1, method="credit_card")
    ids1 = await _finalize_paid_order(db_session, await _load_order(db_session, o1.id), a1, commit=False)
    don1 = (await db_session.execute(select(Donation).where(Donation.id == uuid.UUID(ids1[0])))).scalar_one()
    assert don1.issued_by_id == active_staff.id

    o2, a2 = await _make_order(db_session, org, d2, method="credit_card")
    ids2 = await _finalize_paid_order(db_session, await _load_order(db_session, o2.id), a2, commit=False)
    don2 = (await db_session.execute(select(Donation).where(Donation.id == uuid.UUID(ids2[0])))).scalar_one()
    assert don2.issued_by_id is None
    assert not (don2.payment_details or {}).get("auto_assigned_staff")


async def test_bank_transfer_never_auto_assigns_staff(db_session):
    from sqlalchemy import select
    from app.api.v1.checkout import _finalize_paid_order, _load_order
    from app.models.donation import Donation

    org = await _org(db_session)
    rep = await _staff_user(db_session, org)
    manual_approver = await _staff_user(db_session, org)
    donor = Donor(organization_id=org.id, first_name="Zeynep", last_name="Yılmaz", assigned_user_id=rep.id)
    db_session.add(donor)
    await db_session.flush()

    # Without explicit issued_by_id, bank transfer does NOT auto-assign to donor's rep
    o1, a1 = await _make_order(db_session, org, donor, method="bank_transfer")
    ids1 = await _finalize_paid_order(db_session, await _load_order(db_session, o1.id), a1, commit=False)
    don1 = (await db_session.execute(select(Donation).where(Donation.id == uuid.UUID(ids1[0])))).scalar_one()
    assert don1.issued_by_id is None

    # When manually confirmed by a staff member, it attributes to that approver
    o2, a2 = await _make_order(db_session, org, donor, method="bank_transfer")
    ids2 = await _finalize_paid_order(db_session, await _load_order(db_session, o2.id), a2, commit=False,
                                      issued_by_id=manual_approver.id)
    don2 = (await db_session.execute(select(Donation).where(Donation.id == uuid.UUID(ids2[0])))).scalar_one()
    assert don2.issued_by_id == manual_approver.id
