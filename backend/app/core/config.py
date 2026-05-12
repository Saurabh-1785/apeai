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

    # ── Slack (Optional) ─────────────────────────────────
    slack_bot_token: Optional[str] = None
    slack_app_token: Optional[str] = None

    # ── GitHub (Optional) ────────────────────────────────
    github_webhook_secret: Optional[str] = None

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
    }

    @property
    def supabase_configured(self) -> bool:
        """Check if Supabase credentials are provided."""
        return bool(self.supabase_url and self.supabase_key)

    @property
    def slack_configured(self) -> bool:
        """Check if Slack credentials are provided."""
        return bool(self.slack_bot_token and self.slack_app_token)

    @property
    def github_configured(self) -> bool:
        """Check if GitHub webhook secret is provided."""
        return bool(self.github_webhook_secret)

    @property
    def google_configured(self) -> bool:
        """Check if Google API key is provided."""
        return bool(self.google_api_key)


# Singleton instance
settings = Settings()
