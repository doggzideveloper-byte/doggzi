from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "notification"
    # console (local dev) | msg91 (to be wired once the provider is chosen)
    sms_provider: str = "console"
    sms_provider_api_key: str = ""
    # Shared secret for service-to-service calls. This service is internal only (not routed by the gateway).
    internal_token: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
