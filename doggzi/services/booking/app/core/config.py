from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# DRAFT serviceable pincodes (Delhi NCR) — confirm before launch. Override with SERVICEABLE_PINCODES.
_DEFAULT_PINS = ",".join(
    [str(122001 + i) for i in range(18)] + [str(201301 + i) for i in range(10)] + ["110017", "110024", "110048", "110049", "110065", "110070"]
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "booking"
    database_url: str = "sqlite:///./booking.db"
    redis_url: str = ""
    auth_jwt_secret: str = ""
    catalog_cache_seconds: int = 600
    serviceable_pincodes: str = _DEFAULT_PINS
    # Slot template, in IST. Slots are created on demand for each date.
    slot_times: str = "09:00,10:30,12:00,14:00,15:30,17:00,18:30"
    slot_minutes: int = 90
    slot_capacity: int = 2
    booking_window_days: int = 14
    min_lead_minutes: int = 120
    # Phase 1 demo: pre-fill ~1 in 5 new slots as full so the UI shows real "unavailable" states.
    mock_availability: bool = True
    pet_profile_url: str = "http://pet-profile:8000"
    internal_token: str = ""
    notification_url: str = "http://notification:8000"
    # Console (provider panel)
    session_redis_url: str = ""  # shared with auth: "log out of all devices"
    offer_ttl_seconds: int = 90
    dispatch_sweep_seconds: int = 15  # 0 = no background sweep (offers still expire lazily on read)
    provider_share_pct: int = 60  # DRAFT: provider's share of the booking total
    code_secret: str = ""  # HMAC key for start/end codes (falls back to AUTH_JWT_SECRET)
    ops_whatsapp: str = ""  # OPS help line for "Need help" (digits, with country code)
    seed_demo: bool = False

    @property
    def pincodes(self) -> set[str]:
        return {p.strip() for p in self.serviceable_pincodes.split(",") if p.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()
