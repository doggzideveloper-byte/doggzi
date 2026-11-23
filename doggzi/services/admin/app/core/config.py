from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "admin"
    database_url: str = "sqlite:///./admin.db"
    # Live visitors + export rate limits. Empty = in-process (tests, local dev without Redis).
    redis_url: str = ""
    auth_jwt_secret: str = ""
    session_redis_url: str = ""  # shared with auth: "log out of all devices"
    internal_token: str = ""
    auth_url: str = "http://auth:8000"
    booking_url: str = "http://booking:8000"
    market_url: str = "http://market:8000"
    pet_profile_url: str = "http://pet-profile:8000"
    notification_url: str = "http://notification:8000"
    live_window_seconds: int = 60  # "on the site right now" = a heartbeat in the last 60 s
    live_key_ttl_seconds: int = 90
    exports_per_hour: int = 20  # CSV exports per ADMIN per hour
    console_url: str = ""  # link in WhatsApp invites, e.g. https://example.com/console
    seed_demo: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
