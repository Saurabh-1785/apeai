"""
ApeAI — Centralized Configuration

Loads settings from .env file using pydantic-settings.
All integration credentials are optional — the app starts
even without Slack/GitHub/Postmark configured.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # ── Supabase (Required) ──────────────────────────────
    supabase_url: str = ""
    supabase_key: str = ""



    # ── Google AI (Required for Layer 2+ embeddings) ─────
    google_api_key: Optional[str] = None

    # ── Server ───────────────────────────────────────────
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_debug: bool = True

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
        "extra": "ignore",
    }

    @property
    def supabase_configured(self) -> bool:
        """Check if Supabase credentials are provided."""
        return bool(self.supabase_url and self.supabase_key)



    @property
    def google_configured(self) -> bool:
        """Check if Google API key is provided."""
        return bool(self.google_api_key)


# Singleton instance
settings = Settings()
