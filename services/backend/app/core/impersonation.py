"""Platform simulation ("destek girişi"): a platform operator working in an
organisation's panel with a token that carries an `imp` claim.

`current_impersonator` is set per request by `get_current_user`; every
organisation audit row written during such a request records the operator, so
the organisation's log never attributes the operator's work to its admin alone.
"""
from contextvars import ContextVar
from typing import Optional

from sqlalchemy import event
from sqlalchemy.orm import Session

current_impersonator: ContextVar[Optional[str]] = ContextVar("current_impersonator", default=None)

SIMULATION_FORBIDDEN = "Bu işlem kurum simülasyonunda yapılamaz"


def is_impersonating() -> bool:
    return current_impersonator.get() is not None


@event.listens_for(Session, "before_flush")
def _tag_audit_rows(session, _flush_context, _instances) -> None:
    operator_id = current_impersonator.get()
    if not operator_id:
        return
    from app.models.audit_log import AuditLog

    for obj in session.new:
        if isinstance(obj, AuditLog):
            details = dict(obj.details or {})
            details.setdefault("platform_operator_id", operator_id)
            obj.details = details
