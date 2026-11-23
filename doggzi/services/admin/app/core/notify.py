"""Best-effort WhatsApp / push updates through services/notification (never blocks or fails a request)."""
import logging
import threading

import httpx

from .config import get_settings

log = logging.getLogger("admin.notify")


def send(channel: str, to: str | None, template: str, data: dict | None = None) -> None:
    if not to:
        return
    s = get_settings()
    if not s.notification_url:
        return

    def run() -> None:
        try:
            httpx.post(f"{s.notification_url}/api/notification/v1/send/message", json={"channel": channel, "to": to, "template": template, "data": data or {}},
                       headers={"X-Internal-Token": s.internal_token}, timeout=2)
        except Exception as e:  # noqa: BLE001
            log.info("notify %s/%s skipped: %s", channel, template, e)

    threading.Thread(target=run, daemon=True).start()
