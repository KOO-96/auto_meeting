from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Known placeholder values that must never be used to sign tokens.
_INSECURE_JWT_SECRETS = {"change-me", "changeme", "secret", "please-change-me"}


class Settings(BaseSettings):
    app_env: str = "local"
    app_name: str = "Company Brain Lite"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/company_brain"
    redis_url: str = "redis://localhost:6379/0"

    # Required. No default: the app must fail fast if JWT_SECRET_KEY is unset.
    jwt_secret_key: str = Field(min_length=16)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    refresh_token_expire_days: int = 30

    upload_dir: Path = Path("storage/uploads")
    export_dir: Path = Path("storage/exports")
    max_upload_size_mb: int = 1024
    rq_queue_name: str = "meeting-processing"

    # RQ job lifecycle
    rq_job_timeout_seconds: int = 900
    rq_result_ttl_seconds: int = 86400
    rq_failure_ttl_seconds: int = 604800
    rq_max_retries: int = 2
    rq_retry_interval_seconds: int = 30
    # A job left in an active state longer than this is treated as orphaned.
    stuck_job_timeout_seconds: int = 1800

    ai_worker_enabled: bool = True
    ai_model_base_url: str | None = None
    ai_model_name: str = "test-9b-llm"
    ai_model_timeout_seconds: int = 120
    ai_model_max_tokens: int = 2048
    ai_model_temperature: float = 0.0
    # Model client retry/backoff for transient upstream failures.
    ai_model_max_retries: int = 2
    ai_model_retry_backoff_seconds: float = 1.0

    # Login rate limiting (fixed window).
    login_rate_limit_max_attempts: int = 10
    login_rate_limit_window_seconds: int = 300

    # Structured JSON logs (recommended in non-local environments).
    json_logs: bool = False

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("jwt_secret_key")
    @classmethod
    def _reject_insecure_secret(cls, value: str) -> str:
        if value.strip().lower() in _INSECURE_JWT_SECRETS:
            raise ValueError(
                "JWT_SECRET_KEY is set to a known placeholder. "
                "Generate a strong secret, e.g. `openssl rand -hex 32`."
            )
        return value

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
