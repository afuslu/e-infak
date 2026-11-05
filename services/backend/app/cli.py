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
                            is_active=True, is_verified=True))
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
            print(f"Platform yöneticisinin şifresi yenilendi: {email}")
        else:
            db.add(PlatformUser(email=email, full_name=name, hashed_password=get_password_hash(password)))
            print(f"Platform yöneticisi oluşturuldu: {email}")
        await db.commit()
    print(f"Geçici şifre: {password}  (ilk girişte değiştirin)")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    legacy = commands.add_parser("import-legacy-credentials", help="Ortam değişkenindeki Ziraat Pay bilgilerini panele taşır")
    legacy.add_argument("--dry-run", action="store_true")
    admin = commands.add_parser("create-platform-admin", help="Platform konsolu yöneticisi oluşturur")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", default="Platform Yöneticisi")
    commands.add_parser("bootstrap-sites", help="Boş veritabanında Hicret ve Kardeşlik kurumlarını oluşturur")
    args = parser.parse_args()
    if args.command == "import-legacy-credentials":
        asyncio.run(import_legacy_credentials(args.dry_run))
    elif args.command == "create-platform-admin":
        asyncio.run(create_platform_admin(args.email.strip(), args.name.strip()))
    elif args.command == "bootstrap-sites":
        asyncio.run(bootstrap_sites())


if __name__ == "__main__":
    main()
