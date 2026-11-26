"""Automatic WhatsApp notifications on the same events as the automatic SMS.

Every event SMS goes through `sms_service.send_event_sms`, which asks `route_event` first. Per
event the organisation chooses a channel:

    sms        only the SMS (default; nothing changes for organisations without WhatsApp)
    whatsapp   the approved template on WhatsApp; the SMS is sent instead when WhatsApp cannot be
               used (no account, no template, donor stopped WhatsApp) or Meta reports a failure
    both       WhatsApp and SMS

The template parameters use the SMS variables ({ad_soyad}, {tutar}, {makbuz_no}, {video}…).
"""
from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import whatsapp as wa

logger = logging.getLogger(__name__)
CHANNELS = ("sms", "whatsapp", "both")

# Ready-made templates per event, created on Meta from the settings page in one click.
# {{n}} order matches `params`.
SUGGESTED: dict[str, dict] = {
    "bagis_alindi": {
        "name": "bagis_alindi", "category": "UTILITY",
        "body": "Sayın {{1}}, {{2}} TL tutarındaki {{3}} bağışınız alınmıştır. Makbuz No: {{4}}. "
                "Allah kabul etsin. Bağışlarınızı {{5}} adresinden takip edebilirsiniz.",
        "params": ["{ad_soyad}", "{tutar}", "{bagis_kalemi}", "{makbuz_no}", "{portal}"],
    },
    "adina_bagis": {
        "name": "adina_bagis_bildirimi", "category": "UTILITY",
        "body": "Sayın {{1}}, {{2}} tarafından sizin adınıza {{3}} bağışı yapılmıştır. "
                "Makbuz No: {{4}}. Hayırlara vesile olmasını dileriz.",
        "params": ["{kimin_adina}", "{ad_soyad}", "{bagis_kalemi}", "{makbuz_no}"],
    },
    "makbuz": {
        "name": "makbuz_kesildi", "category": "UTILITY",
        "body": "Değerli bağışçımız {{1}}, {{2}} TL bağışınız kurumumuza ulaşmıştır. Makbuz No: {{3}}. Allah kabul etsin.",
        "params": ["{ad_soyad}", "{tutar}", "{makbuz_no}"],
    },
    "havale_eslesti": {
        "name": "havale_bagis_ulasti", "category": "UTILITY",
        "body": "Değerli bağışçımız {{1}}, havale ile gönderdiğiniz {{2}} TL bağışınız kurumumuza ulaşmıştır. "
                "Makbuz No: {{3}}. Allah kabul etsin.",
        "params": ["{ad_soyad}", "{tutar}", "{makbuz_no}"],
    },
    "kurban_kesildi": {
        "name": "kurban_kesildi", "category": "UTILITY",
        "body": "Sayın {{1}}, {{2}} adına vekaletiniz yerine getirilmiş, kurbanınız ({{3}}) kesilmiştir. "
                "Allah kabul etsin. Kesim videosu: {{4}}",
        "params": ["{ad_soyad}", "{kimin_adina}", "{kurban_no}", "{video}"],
    },
    "aidat_hatirlatma": {
        "name": "aidat_hatirlatma", "category": "UTILITY",
        "body": "Sayın {{1}}, {{2}} dönemi {{3}} TL üyelik aidatınızın son ödeme tarihi {{4}}. Desteğiniz için teşekkür ederiz.",
        "params": ["{ad_soyad}", "{donem}", "{tutar}", "{vade}"],
    },
    "sponsor_hatirlatma": {
        "name": "sponsorluk_hatirlatma", "category": "UTILITY",
        "body": "Kıymetli destekçimiz {{1}}, {{2}} için {{3}} TL tutarındaki bu ayki desteğinizi hatırlatmak istedik. "
                "Ödeme: {{4}}",
        "params": ["{ad_soyad}", "{bagis_kalemi}", "{tutar}", "{odeme_linki}"],
    },
    "duzenli_hatirlatma": {
        "name": "duzenli_bagis_hatirlatma", "category": "UTILITY",
        "body": "Sayın {{1}}, her ay yaptığınız {{2}} TL {{3}} bağışınızın günü geldi: {{4}} "
                "Talimatınızı buradan yönetebilirsiniz: {{5}}",
        "params": ["{ad_soyad}", "{tutar}", "{bagis_kalemi}", "{odeme_linki}", "{yonet_linki}"],
    },
    "duzenli_basarisiz": {
        "name": "duzenli_bagis_cekilemedi", "category": "UTILITY",
        "body": "Sayın {{1}}, {{2}} TL düzenli bağışınız kartınızdan çekilemedi. Bağışınızı buradan yapabilirsiniz: {{3}} "
                "Talimat: {{4}}",
        "params": ["{ad_soyad}", "{tutar}", "{odeme_linki}", "{yonet_linki}"],
    },
}


def event_config(org, event_key: str) -> dict:
    from app.services.whatsapp_inbox import settings_of

    raw = settings_of(org)["events"].get(event_key) or {}
    channel = raw.get("channel") if raw.get("channel") in CHANNELS else "sms"
    return {"channel": channel, "template_name": (raw.get("template_name") or "").strip(),
            "language": raw.get("language") or None, "params": list(raw.get("params") or [])}


async def route_event(
    db: AsyncSession, org, event_key: str, phone: str, *, donor=None, context_factory,
    sms_body_factory, related: Optional[tuple[str, UUID]] = None, dedupe_key: Optional[str] = None,
    source: str = "auto",
) -> tuple[Optional[object], bool]:
    """Queue the event's WhatsApp message when the organisation wants one.

    Returns (WhatsAppMessage or None, whether the SMS should still be sent now).
    `context_factory()` is awaited and `sms_body_factory(context)` → (SMS text or None, SMS template id)
    is called only when needed.
    """
    from app.models.channels import WhatsAppMessage
    from app.services.tenant_credentials import CredentialsUnavailable, get_credentials
    from app.services.whatsapp_inbox import opted_out

    conf = event_config(org, event_key)
    if conf["channel"] == "sms":
        return None, True
    try:
        creds = await get_credentials(db, org.id, wa.PROVIDER) or {}
    except CredentialsUnavailable:
        creds = {}
    usable = (wa.configured(creds) and conf["template_name"] and len(wa.normalize_phone(phone)) >= 10
              and not await opted_out(db, org.id, phone, donor))
    if not usable:
        return None, True
    key = f"wa:{dedupe_key or (f'{event_key}:{related[1]}' if related else '')}" if (dedupe_key or related) else None
    if key and (await db.execute(select(WhatsAppMessage.id).where(
        WhatsAppMessage.organization_id == org.id, WhatsAppMessage.dedupe_key == key,
    ))).first():
        return None, conf["channel"] == "both"
    context = await context_factory()
    params = wa.render_params(conf["params"], context)
    fallback = None
    if conf["channel"] == "whatsapp":
        sms_body, template_id = sms_body_factory(context)
        if sms_body:
            fallback = {"body": sms_body, "source": source, "dedupe_key": dedupe_key or (
                f"{event_key}:{related[1]}" if related else None),
                "related": [related[0], str(related[1])] if related else None,
                "template_id": str(template_id) if template_id else None, "event": event_key}
    msg = WhatsAppMessage(
        organization_id=org.id, donor_id=getattr(donor, "id", None), phone=phone, kind="template",
        template_name=conf["template_name"], language=conf["language"] or creds.get("default_language") or "tr",
        params=params, body=" | ".join(params) or None, source="event", fallback=fallback,
        related_type=related[0] if related else None, related_id=related[1] if related else None,
        dedupe_key=key,
    )
    db.add(msg)
    await db.flush()
    wa.kick_after_commit(db)
    return msg, conf["channel"] == "both"
