from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "market"
    database_url: str = "sqlite:///./market.db"
    redis_url: str = ""
    auth_jwt_secret: str = ""
    catalog_cache_seconds: int = 120
    # mock = no real money moves; the order is confirmed by POST /orders/{id}/pay/mock.
    # razorpay = to be wired once test keys arrive (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).
    payments_mode: str = "mock"
    reservation_minutes: int = 15
    max_qty_per_line: int = 10
    # Vendor SLA to accept a new sub-order (minutes; after that it goes to OPS).
    accept_sla_minutes: int = 10
    # Console (Vendor panel)
    session_redis_url: str = ""  # shared with auth: "log out of all devices"
    internal_token: str = ""
    auth_url: str = "http://auth:8000"  # staff invites create the VENDOR login through auth's internal API
    notification_url: str = "http://notification:8000"
    code_secret: str = ""  # HMAC key for optional delivery codes (falls back to AUTH_JWT_SECRET)
    ops_whatsapp: str = ""
    seed_demo: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
