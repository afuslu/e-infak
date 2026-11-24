"""Operator commands.

    python -m app.cli import-legacy-credentials [--dry-run]
        Copies ZIRAATPAY_TENANT_CREDENTIALS (env, keyed by organisation slug) into
        the encrypted per-organisation credential store. Existing records are kept.

    python -m app.cli create-platform-admin --email ad@ornek.org [--name "Ad Soyad"]
        Creates a platform console (e-infak.org/platform) operator and prints a
        one-time password, or resets the password of an existing operator.

    python -m app.cli bootstrap-sites
        First installation on an empty database: creates Hicret Derneği and
        Kardeşlik Payı with their domains and site design, and one administrator
        per organisation whose one-time password is printed. Existing data is kept.

    python -m app.cli import-stkpro --org hakder --user admin@hakder.org \
            --donors bagiscilar_1.xlsx bagiscilar_2.xlsx --donations tum_bagislar.xlsx [--commit]
        Moves an organisation's STK PRO exports (donors, donations, kurban shares, transfer senders).
        Without --commit it is a dry run: everything is computed in a transaction that is rolled back.

    python -m app.cli seed-sms-templates --org hakder --preset hakder
        Loads a ready SMS template set (app/services/sms_presets.py) into the organisation.
        Templates are matched by event or name, so running it again only refreshes the texts.

    python -m app.cli list-orgs
    python -m app.cli backup-org --org hakder --out /data/media/_exports/_gecelik/hakder.zip
        Used by deploy/backup/gecelik-yedek.sh: organisation slugs, and one organisation's full backup ZIP.

    python -m app.cli repair-kurban-intents --org hakder [--apply]
        Kurban shares saved as "Vacip" although the donor chose another intention on the site.
        Lists them; only --apply writes. Shares whose type staff changed are left alone.
"""
import argparse
import asyncio
import json

from sqlalchemy import select


async def import_legacy_credentials(dry_run: bool) -> None:
    from app.core.config import settings
    from app.core.db import AsyncSessionLocal
    from app.models.organization import Organization
    from app.services.tenant_credentials import get_credentials, save_credentials

    legacy = json.loads(settings.ZIRAATPAY_TENANT_CREDENTIALS or "{}")
    async with AsyncSessionLocal() as db:
        for slug, values in legacy.items():
            org = (await db.execute(select(Organization).where(Organization.slug == slug))).scalar_one_or_none()
            if not org:
                print(f"- {slug}: kurum bulunamadı, atlandı")
                continue
            if await get_credentials(db, org.id, "ziraatpay"):
                print(f"- {slug}: panelde zaten kayıtlı, dokunulmadı")
                continue
            # The env credentials were used with the env URLs: live only if those are live.
            mode = "live" if settings.PAYMENTS_LIVE_ENABLED and "test." not in settings.ZIRAATPAY_API_URL else "test"
            if not dry_run:
                await save_credentials(db, org.id, "ziraatpay", {**values, "mode": mode}, actor="cli:import-legacy")
            print(f"- {slug}: Ziraat Pay bilgileri {'aktarılacak' if dry_run else 'aktarıldı'} ({mode})")
        if not dry_run:
            await db.commit()


BOOTSTRAP_ORGS = {
    "hicret-dernegi": {"name": "Hicret Derneği", "legal_name": "Hicret Eğitim ve Yardımlaşma Derneği",
                       "email": "info@hicretdernegi.org", "domain": "hicretdernegi.org", "city": "Eskişehir"},
    "kardeslik-payi": {"name": "Kardeşlik Payı", "legal_name": "Kardeşlik Payı Sosyal Yardımlaşma Derneği",
                       "email": "info@kardeslikpayi.org", "domain": "kardeslikpayi.org", "city": "İstanbul"},
}


def _site_presets() -> dict:
    """Design of the two existing sites, as defined by the multi-tenant migration."""
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parent.parent / "alembic" / "versions" / "e5f6a7b8c9d1_multi_tenant_sites.py"
    spec = importlib.util.spec_from_file_location("multi_tenant_sites_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.EXISTING_SITES


async def bootstrap_sites() -> None:
    import secrets as secrets_lib

    from app.core.db import AsyncSessionLocal
    from app.core.security import get_password_hash
    from app.models.organization import Organization, OrganizationDomain
    from app.models.user import User, UserRole

    presets = _site_presets()
    async with AsyncSessionLocal() as db:
        for slug, info in BOOTSTRAP_ORGS.items():
            org = (await db.execute(select(Organization).where(Organization.slug == slug))).scalar_one_or_none()
            if org:
                print(f"- {info['name']}: zaten var, dokunulmadı")
            else:
                preset = presets[slug]
                org = Organization(
                    slug=slug, subdomain=slug, name=info["name"], legal_name=info["legal_name"], email=info["email"],
                    city=info["city"], primary_domain=info["domain"], plan="ileri", is_active=True,
                    template=preset["template"], tagline=preset["tagline"], theme_primary_color=preset["primary"],
                    theme_accent_color=preset["accent"], logo_url=preset["logo"], site=preset["site"],
                )
                db.add(org)
                await db.flush()
                db.add(OrganizationDomain(organization_id=org.id, domain=info["domain"], status="active",
                                          verification_token=secrets_lib.token_hex(16), is_primary=True))
                print(f"- {info['name']}: oluşturuldu ({info['domain']})")
            has_user = (await db.execute(select(User.id).where(User.organization_id == org.id).limit(1))).first()
            if not has_user:
                password = secrets_lib.token_urlsafe(12)
                email = f"admin@{info['domain']}"
                db.add(User(organization_id=org.id, email=email, hashed_password=get_password_hash(password),
                            first_name="Yönetici", last_name=info["name"], role=UserRole.STK_ADMIN,
                            is_active=True, is_verified=True, must_change_password=True))
                print(f"  Yönetici: {email}  Geçici şifre: {password}  (ilk girişte değiştirin)")
        await db.commit()


async def create_platform_admin(email: str, name: str) -> None:
    import secrets as secrets_lib

    from sqlalchemy import func

    from app.core.db import AsyncSessionLocal
    from app.core.security import get_password_hash
    from app.models.platform import PlatformUser

    password = secrets_lib.token_urlsafe(14)
    async with AsyncSessionLocal() as db:
        user = (await db.execute(
            select(PlatformUser).where(func.lower(PlatformUser.email) == email.lower())
        )).scalar_one_or_none()
        if user:
            user.hashed_password, user.is_active = get_password_hash(password), True
            user.must_change_password = True
            print(f"Platform yöneticisinin şifresi yenilendi: {email}")
        else:
            db.add(PlatformUser(email=email, full_name=name, hashed_password=get_password_hash(password),
                                must_change_password=True))
            print(f"Platform yöneticisi oluşturuldu: {email}")
        await db.commit()
    print(f"Geçici şifre: {password}  (ilk girişte değiştirin)")


async def import_stkpro(args) -> None:
    from sqlalchemy import func

    from app.core.db import AsyncSessionLocal
    from app.models.campaign import CampaignStatus
    from app.models.organization import Organization
    from app.models.user import User
    from app.services.stkpro_import import run

    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization).where(Organization.slug == args.org))).scalar_one_or_none()
        if not org:
            raise SystemExit(f"Kurum bulunamadı: {args.org}")
        user = (await db.execute(select(User).where(
            User.organization_id == org.id, func.lower(User.email) == args.user.lower()))).scalar_one_or_none()
        if not user:
            raise SystemExit(f"Kullanıcı bulunamadı: {args.user}")
        report = await run(db, org.id, actor=user, donor_files=args.donors or [], donation_files=args.donations or [],
                           commit=args.commit, create_campaigns=not args.no_create_campaigns,
                           campaign_status=CampaignStatus(args.campaign_status),
                           aliases=dict(a.split("=", 1) for a in args.alias or []))
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    if not args.commit:
        print("\nDeneme çalışmasıydı, hiçbir şey yazılmadı. Yazmak için --commit ekleyin.")


async def seed_sms_templates(org_slug: str, preset: str) -> None:
    from app.core.db import AsyncSessionLocal
    from app.models.organization import Organization
    from app.services.sms_presets import load_preset

    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization).where(Organization.slug == org_slug))).scalar_one_or_none()
        if not org:
            raise SystemExit(f"Kurum bulunamadı: {org_slug}")
        result = await load_preset(db, org.id, preset)
        await db.commit()
    print(f"{org.name}: {result['created']} şablon eklendi, {result['updated']} şablon güncellendi.")


async def list_orgs() -> None:
    from app.core.db import AsyncSessionLocal
    from app.models.organization import Organization

    async with AsyncSessionLocal() as db:
        for slug in (await db.execute(select(Organization.slug).order_by(Organization.slug))).scalars():
            print(f"KURUM {slug}")


async def backup_org(slug: str, out: str) -> None:
    from pathlib import Path
    from app.core.db import AsyncSessionLocal
    from app.services.data_export import write_backup, tables
    from app.models.organization import Organization

    tables()  # registers every model
    async with AsyncSessionLocal() as db:
        org = (await db.execute(select(Organization).where(Organization.slug == slug))).scalar_one_or_none()
        if org is None:
            raise SystemExit(f"Kurum bulunamadı: {slug}")
        await write_backup(db, org, Path(out))


async def repair_kurban_intents(slug: str, apply: bool, db=None) -> int:
    """Shares saved as "vacip" although the online order named another intention. Staff edits are kept."""
    from sqlalchemy import select

    from app.core.db import AsyncSessionLocal
    from app.models.donation import Donation
    from app.models.kurban import KURBAN_TYPES, KurbanShare
    from app.models.organization import Organization
    from app.models.payment import PaymentOrderItem
    from app.services.donation_hooks import intent_label, intent_value, normalize_kurban_type

    if db is None:
        async with AsyncSessionLocal() as session:
            return await repair_kurban_intents(slug, apply, session)
    rows = (await db.execute(
        select(KurbanShare, Donation, PaymentOrderItem.metadata_json)
        .join(Donation, Donation.id == KurbanShare.donation_id)
        .join(Organization, Organization.id == KurbanShare.organization_id)
        .join(PaymentOrderItem, PaymentOrderItem.id == Donation.payment_order_item_id)
        .where(Organization.slug == slug, KurbanShare.kurban_type == "vacip")
        .order_by(Donation.paid_at)
    )).all()
    found = 0
    for share, donation, metadata in rows:
        kind = normalize_kurban_type(intent_value(metadata or {}))
        if kind == "vacip" or (donation.payment_details or {}).get("niyet_edited"):
            continue
        found += 1
        print(f"{donation.receipt_number}  Vacip -> {KURBAN_TYPES[kind]}  ({share.status.value})")
        if apply:
            share.kurban_type = kind
            donation.payment_details = {**(donation.payment_details or {}), "niyet": intent_label(intent_value(metadata))}
    if apply:
        await db.commit()
    print(f"{found} hisse {'düzeltildi' if apply else 'bulundu (yazılmadı; --apply ile düzeltilir)'}")
    return found


async def copy_donation_options(slug: str, apply: bool) -> None:
    from sqlalchemy import select

    from app.core.db import AsyncSessionLocal
    from app.models.organization import Organization
    from app.services.donation_options import copy_from_blocks

    async with AsyncSessionLocal() as db:
        org_id = (await db.execute(select(Organization.id).where(Organization.slug == slug))).scalar_one()
        report = await copy_from_blocks(db, org_id, apply)
    print("\n".join(report) or "Kopyalanacak ayar yok")
    if not apply:
        print("Yazılmadı; --apply ile yazılır")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    legacy = commands.add_parser("import-legacy-credentials", help="Ortam değişkenindeki Ziraat Pay bilgilerini panele taşır")
    legacy.add_argument("--dry-run", action="store_true")
    admin = commands.add_parser("create-platform-admin", help="Platform konsolu yöneticisi oluşturur")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", default="Platform Yöneticisi")
    commands.add_parser("bootstrap-sites", help="Boş veritabanında Hicret ve Kardeşlik kurumlarını oluşturur")
    stk = commands.add_parser("import-stkpro", help="STK PRO Excel dışa aktarımlarını kuruma taşır")
    stk.add_argument("--org", required=True, help="Kurum kısa adı (slug)")
    stk.add_argument("--user", required=True, help="Aktarımı yapan yönetici e-postası")
    stk.add_argument("--donors", nargs="*", help="bagiscilar_*.xlsx dosyaları")
    stk.add_argument("--donations", nargs="*", help="tum_bagislar_*.xlsx dosyası")
    stk.add_argument("--commit", action="store_true", help="Yaz (yoksa deneme çalışması)")
    stk.add_argument("--no-create-campaigns", action="store_true", help="Eksik kampanyaları açma, hata ver")
    stk.add_argument("--campaign-status", default="active", choices=["active", "draft", "paused"],
                     help="Sitede karşılığı olmayan, yeni açılan kampanyaların durumu")
    stk.add_argument("--alias", action="append", metavar="STK_ADI=KAMPANYA",
                     help='STK PRO kampanyasını var olan kampanyaya bağla, ör. "keçi süt=Süt Keçisi" (tekrarlanabilir)')
    sms = commands.add_parser("seed-sms-templates", help="Kuruma hazır SMS şablon setini yükler")
    sms.add_argument("--org", required=True, help="Kurum kısa adı (slug)")
    sms.add_argument("--preset", required=True, choices=["hakder"])
    commands.add_parser("list-orgs", help="Kurum kısa adlarını listeler")
    backup = commands.add_parser("backup-org", help="Kurumun tam yedeğini (ZIP) yazar")
    backup.add_argument("--org", required=True, help="Kurum kısa adı (slug)")
    backup.add_argument("--out", required=True, help="Yazılacak ZIP dosyası")
    intents = commands.add_parser("repair-kurban-intents", help="Sitede seçilen niyeti Vacip kalan hisselere yazar")
    intents.add_argument("--org", required=True, help="Kurum kısa adı (slug)")
    intents.add_argument("--apply", action="store_true", help="Yaz (yoksa yalnız listeler)")
    options = commands.add_parser("copy-donation-options", help="Bağış kartı bloklarındaki süre/adet/niyet ayarını kampanyalara kopyalar")
    options.add_argument("--org", required=True, help="Kurum kısa adı (slug)")
    options.add_argument("--apply", action="store_true", help="Yaz (yoksa yalnız listeler)")
    args = parser.parse_args()
    if args.command == "import-legacy-credentials":
        asyncio.run(import_legacy_credentials(args.dry_run))
    elif args.command == "create-platform-admin":
        asyncio.run(create_platform_admin(args.email.strip(), args.name.strip()))
    elif args.command == "bootstrap-sites":
        asyncio.run(bootstrap_sites())
    elif args.command == "import-stkpro":
        asyncio.run(import_stkpro(args))
    elif args.command == "seed-sms-templates":
        asyncio.run(seed_sms_templates(args.org, args.preset))
    elif args.command == "list-orgs":
        asyncio.run(list_orgs())
    elif args.command == "backup-org":
        asyncio.run(backup_org(args.org, args.out))
    elif args.command == "repair-kurban-intents":
        asyncio.run(repair_kurban_intents(args.org, args.apply))
    elif args.command == "copy-donation-options":
        asyncio.run(copy_donation_options(args.org, args.apply))


if __name__ == "__main__":
    main()
