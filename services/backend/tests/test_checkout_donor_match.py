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
