"""Queue organisation webhooks (delivered by app.tasks._deliver_webhooks through the outbox)."""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import OutboxEvent
from app.models.webhook_setting import WebhookSetting


async def queue_webhook(db: AsyncSession, org_id: UUID, event: str, aggregate_type: str, aggregate_id: UUID,
                        payload: dict) -> bool:
    """Adds an outbox event when an active hook of the organisation listens to `event`."""
    hooks = (await db.execute(select(WebhookSetting.subscribed_events).where(
        WebhookSetting.organization_id == org_id, WebhookSetting.is_active.is_(True),
    ))).scalars().all()
    if not any(event in (events or "").split(",") for events in hooks):
        return False
    db.add(OutboxEvent(organization_id=org_id, aggregate_type=aggregate_type, aggregate_id=aggregate_id,
                       event_type=f"webhook.{event}", payload=payload))
    return True
