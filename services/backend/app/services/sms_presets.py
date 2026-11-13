"""Ready SMS template sets an operator can load into an organisation (python -m app.cli seed-sms-templates)."""
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sms_template import SmsTemplate
from app.services.sms_service import clean_sms_text, ensure_default_templates, unknown_variables

_HAKDER_FOOTER = "hakder.org\n0222 233 30 30"

# name, event key (or None), body. Amounts written into the old texts became {tutar}.
PRESETS: dict[str, list[tuple[str, str | None, str]]] = {
    "hakder": [
        ("Makbuz SMS", "makbuz",
         "Değerli bağışçımız, {tutar} TL Bağışınız Derneğimize Ulaşmıştır. ALLAH KABUL ETSİN\n" + _HAKDER_FOOTER),
        ("Bağış Ulaştı SMS", "havale_eslesti",
         "Bağışınız derneğimize ulaşmıştır. ALLAH KABUL ETSİN\n" + _HAKDER_FOOTER),
        ("Vacip Kurban Küçükbaş", None,
         "Değerli bağışçımız, {tutar} TL TUTARINDAKİ VACİB KURBAN KÜÇÜKBAŞ Bağışınız Derneğimize Ulaşmıştır. "
         "ALLAH KABUL ETSİN\n" + _HAKDER_FOOTER),
        ("Vacip Kurban Hisse", None,
         "Değerli bağışçımız, {tutar} TL TUTARINDAKİ VACİB KURBAN HİSSE Bağışınız Derneğimize Ulaşmıştır. "
         "ALLAH KABUL ETSİN\n" + _HAKDER_FOOTER),
        ("Banka Hesap Bilgileri", None,
         "ALICI ADI: HAYIRA AÇILAN KAPI DERNEĞİ\n\nIBAN: TR24 0021 0000 0444 4444 4000 01\n"
         "Açıklama kısmına telefon numaranızı yazmayı unutmayınız.\n\nhakder.org"),
        ("Hafızlık Sponsor Hatırlatma", None,
         "Kıymetli destekçimiz, hafızlık yolunda eğitimine devam eden kardeşlerimize vermiş olduğunuz kıymetli "
         "destek için teşekkür ederiz.\nDesteğinizi bu ay için hatırlatmak istedik.\n"
         "Rabbimiz hayrınızı kabul, bereketinizi daim eylesin.\nHAKDER - Hayıra Açılan Kapı Derneği\n"
         "Tel: 0222 233 30 30\nwww.hakder.org"),
    ],
}


async def load_preset(db: AsyncSession, org_id: UUID, preset: str) -> dict:
    """Create or update the preset's templates (matched by event, else by name). Safe to run again."""
    await ensure_default_templates(db, org_id)
    existing = (await db.execute(select(SmsTemplate).where(SmsTemplate.organization_id == org_id))).scalars().all()
    by_event = {t.event_key: t for t in existing if t.event_key}
    by_name = {t.name.casefold(): t for t in existing}
    order = (await db.execute(
        select(func.coalesce(func.max(SmsTemplate.sort_order), 0)).where(SmsTemplate.organization_id == org_id)
    )).scalar() or 0
    created = updated = 0
    for name, event_key, body in PRESETS[preset]:
        body = clean_sms_text(body)
        assert not unknown_variables(body), name
        template = (by_event.get(event_key) if event_key else None) or by_name.get(name.casefold())
        if template:
            template.name, template.body, template.is_active = name, body, True
            updated += 1
        else:
            order += 1
            db.add(SmsTemplate(organization_id=org_id, name=name, body=body, event_key=event_key, sort_order=order))
            created += 1
    await db.flush()
    return {"created": created, "updated": updated}
