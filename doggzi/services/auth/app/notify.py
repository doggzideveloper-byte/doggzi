"""Sends the OTP through the notification service (the SMS provider lives behind it)."""
import httpx
from fastapi import HTTPException, status

from .core.config import get_settings


class OtpSender:
    def send(self, phone: str, code: str) -> None:
        s = get_settings()
        try:
            r = httpx.post(f"{s.notification_url}/api/notification/v1/send/otp", json={"phone": phone, "code": code}, headers={"X-Internal-Token": s.internal_token}, timeout=5)
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "We couldn't send the code just now. Try again.") from e


def get_sender() -> OtpSender:
    return OtpSender()
