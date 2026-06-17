from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "local"
    app_name: str = "Company Brain Lite"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/company_brain"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret_key: str = Field(default="change-me", min_length=8)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    refresh_token_expire_days: int = 30

    upload_dir: Path = Path("storage/uploads")
    export_dir: Path = Path("storage/exports")
    max_upload_size_mb: int = 1024
    rq_queue_name: str = "meeting-processing"
    ai_worker_enabled: bool = True
    ai_model_base_url: str | None = None
    ai_model_name: str = "test-9b-llm"
    ai_model_timeout_seconds: int = 120
    ai_model_max_tokens: int = 2048
    ai_model_temperature: float = 0.0

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
