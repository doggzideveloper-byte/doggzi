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
    # Vendor SLA to accept a new sub-order.
    accept_sla_minutes: int = 15


@lru_cache
def get_settings() -> Settings:
    return Settings()
