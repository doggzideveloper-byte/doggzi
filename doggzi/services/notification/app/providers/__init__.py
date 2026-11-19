"""SMS providers behind one interface. Pick one with SMS_PROVIDER."""
import logging
from typing import Protocol

from ..core.config import get_settings

log = logging.getLogger("notification")


class SmsProvider(Protocol):
    name: str

    def send_otp(self, phone: str, code: str) -> None: ...


class ConsoleProvider:
    """Local development: prints the OTP to the service log instead of texting it."""

    name = "console"
    sent: list[tuple[str, str]] = []

    def send_otp(self, phone: str, code: str) -> None:
        masked = phone[:3] + "*" * (len(phone) - 7) + phone[-4:]
        print(f"[console-sms] OTP for {masked}: {code}", flush=True)
        ConsoleProvider.sent.append((phone, code))


class NotConfiguredProvider:
    name = "unconfigured"

    def send_otp(self, phone: str, code: str) -> None:
        raise RuntimeError("SMS provider is not configured. Set SMS_PROVIDER and SMS_PROVIDER_API_KEY.")


def get_provider() -> SmsProvider:
    s = get_settings()
    if s.sms_provider == "console":
        return ConsoleProvider()
    # A real provider (e.g. MSG91 / Twilio) plugs in here, reading s.sms_provider_api_key from env.
    return NotConfiguredProvider()
