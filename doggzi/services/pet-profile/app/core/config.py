from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (see .env.example). No secrets in code."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "pet-profile"
    database_url: str = "sqlite:///./pet_profile.db"
    redis_url: str = ""  # empty → in-process cache (local dev / tests)
    guest_jwt_secret: str = ""
    guest_token_ttl_hours: int = 24 * 7
    # Shared with the auth service so user tokens can be verified here.
    auth_jwt_secret: str = ""
    cors_origins: str = ""  # comma-separated; the gateway serves same-origin so usually empty
    breeds_cache_seconds: int = 24 * 3600
    # Shared secret for service-to-service calls (/internal/*).
    internal_token: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
