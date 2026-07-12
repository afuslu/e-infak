from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.config import settings
from app.core.db import Base

# Import all models here
from app.models.organization import Organization
from app.models.user import User
from app.models.campaign import Campaign
from app.models.donation import Donation, Donor
from app.models.kurban import KurbanCampaign, KurbanAnimal, KurbanShare
from app.models.orphan import Orphan, OrphanSponsorship
from app.models.subscription import Subscription
from app.models.student import Student
from app.models.student_progress import StudentProgress
from app.models.expense import Expense
from app.models.donor_note import DonorNote
from app.models.sms_template import SmsTemplate
from app.models.audit_log import AuditLog
from app.models.zakat_setting import ZakatSetting

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("+asyncpg", ""))


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
