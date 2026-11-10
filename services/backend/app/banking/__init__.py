"""Bank statement connectors registry."""
from app.banking.base import BankConnector, BankConnectorError, BankConnectorNotReady, BankMovement

CONNECTORS: dict[str, type[BankConnector]] = {}
CREDENTIAL_PREFIX = "bank:"


def register(cls: type[BankConnector]) -> type[BankConnector]:
    CONNECTORS[cls.key] = cls
    return cls


def credential_key(bank_key: str) -> str:
    return f"{CREDENTIAL_PREFIX}{bank_key}"


from app.banking import connectors  # noqa: E402,F401  (registers the banks)

__all__ = ["BankConnector", "BankConnectorError", "BankConnectorNotReady", "BankMovement", "CONNECTORS",
           "register", "credential_key", "CREDENTIAL_PREFIX"]
