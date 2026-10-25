"""Application configuration loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_NAME = "GB Wind Forecast Intelligence"
APP_VERSION = "1.0.0"


class Settings(BaseSettings):
    """Runtime settings. Every field can be overridden with an environment variable
    of the same name (case-insensitive). No Elexon API key is required."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    cache_ttl_seconds: int = Field(default=900, ge=0)
    # Chunks whose whole window ended long ago are effectively immutable, so they
    # may be cached for longer than chunks that touch the recent past.
    historical_cache_ttl_seconds: int = Field(default=21600, ge=0)
    cache_max_entries: int = Field(default=512, ge=1)
    request_timeout_seconds: float = Field(default=30.0, gt=0)
    connect_timeout_seconds: float = Field(default=10.0, gt=0)
    max_retries: int = Field(default=3, ge=0, le=10)
    retry_backoff_seconds: float = Field(default=0.5, ge=0)
    max_retry_after_seconds: float = Field(default=30.0, ge=0)
    max_date_range_days: int = Field(default=93, ge=1, le=366)
    fetch_chunk_days: int = Field(default=7, ge=1, le=31)
    max_concurrent_requests: int = Field(default=4, ge=1, le=16)
    # How far before the earliest decision cutoff to look for WINDFOR publications.
    windfor_lookback_hours: int = Field(default=96, ge=1, le=240)
    default_decision_lead_hours: float = Field(default=24.0, ge=0, le=96)
    max_decision_lead_hours: float = Field(default=96.0, ge=0, le=240)
    default_decision_from: str = "2026-01-01"
    default_decision_to: str = "2026-01-31"
    cors_origins: str = "http://localhost:5173,http://localhost:8080,http://127.0.0.1:5173"
    log_level: str = "INFO"

    # --- Windy Agent Settings (LangGraph + Groq) ---
    groq_api_key: str = ""
    windy_model: str = "openai/gpt-oss-120b"
    windy_fallback_model: str = "openai/gpt-oss-20b"
    windy_max_history_turns: int = 8
    windy_max_tokens: int = 1500

    @field_validator("log_level")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.upper()

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
