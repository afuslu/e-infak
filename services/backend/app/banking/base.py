"""Bank account movement connectors.

A connector pulls the movements of one organisation bank account for a date
window. Credentials live in the encrypted per-organisation store under the
provider key ``bank:<key>`` (see app.services.tenant_credentials).
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import ClassVar, Optional


class BankConnectorError(RuntimeError):
    """The bank refused or failed the request; the message is shown to the organisation."""


class BankConnectorNotReady(BankConnectorError):
    """The bank's statement web service is not implemented yet (waiting for its documentation)."""


@dataclass
class BankMovement:
    external_id: str  # unique per account on the bank side (dekont / işlem no)
    booked_at: datetime
    amount_cents: int  # positive = incoming
    currency: str = "TRY"
    sender_name: Optional[str] = None
    sender_iban: Optional[str] = None
    description: str = ""
    raw: dict = field(default_factory=dict)


class BankConnector(ABC):
    key: ClassVar[str]
    label: ClassVar[str]
    credential_fields: ClassVar[dict] = {}
    secret_fields: ClassVar[tuple] = ()
    optional_fields: ClassVar[tuple] = ()
    ready: ClassVar[bool] = False  # False: only Excel/CSV statements can be used for now

    def __init__(self, credentials: dict):
        self.credentials = credentials or {}

    @abstractmethod
    async def fetch(self, account, since: datetime, until: datetime) -> list[BankMovement]:
        """Movements booked in [since, until] for ``account`` (an app.models.automation.BankAccount)."""
