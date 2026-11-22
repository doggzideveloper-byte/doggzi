from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "auth"
    database_url: str = "sqlite:///./auth.db"
    redis_url: str = ""
    auth_jwt_secret: str = ""
    access_token_ttl_minutes: int = 60 * 24 * 7
    otp_ttl_seconds: int = 300
    otp_max_attempts: int = 5
    # Rate limits (Redis; in-process fallback for local dev)
    otp_requests_per_phone: int = 3
    otp_requests_per_ip: int = 10
    otp_rate_window_seconds: int = 600
    # Echo the code back in the response. ONLY for local development with the console SMS provider.
    otp_dev_echo: bool = False
    otp_hash_pepper: str = ""
    notification_url: str = "http://notification:8000"
    internal_token: str = ""
    # Comma-separated phone numbers that get the ADMIN role on first login.
    admin_phones: str = ""
    # Console (Admin / Vendor / Provider panels): 12-hour sessions.
    console_token_ttl_minutes: int = 12 * 60
    # Shared Redis where "log out of all devices" publishes each user's token version (read by every service).
    session_redis_url: str = ""
    # Local/demo only: create the five demo console logins on start.
    seed_demo: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
