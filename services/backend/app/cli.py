"""Operator commands.

    python -m app.cli import-legacy-credentials [--dry-run]
        Copies ZIRAATPAY_TENANT_CREDENTIALS (env, keyed by organisation slug) into
        the encrypted per-organisation credential store. Existing records are kept.
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


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    legacy = commands.add_parser("import-legacy-credentials", help="Ortam değişkenindeki Ziraat Pay bilgilerini panele taşır")
    legacy.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.command == "import-legacy-credentials":
        asyncio.run(import_legacy_credentials(args.dry_run))


if __name__ == "__main__":
    main()
