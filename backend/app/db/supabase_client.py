"""
ApeAI — Supabase Client

Creates a singleton Supabase client for database operations.
Fails gracefully with a clear error if credentials are missing.
"""

import logging
from typing import Optional

from supabase import create_client, Client

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

# Module-level client instance (lazy-initialized)
_supabase_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """
    Get the Supabase client instance.
    
    Creates the client on first call and reuses it afterwards.
    Raises RuntimeError if Supabase is not configured.
    """
    global _supabase_client

    if _supabase_client is not None:
        return _supabase_client

    if not settings.supabase_configured:
        logger.warning(
            "⚠️  Supabase is not configured. "
            "Set SUPABASE_URL and SUPABASE_KEY in your .env file."
        )
        raise RuntimeError(
            "Supabase is not configured. "
            "Please set SUPABASE_URL and SUPABASE_KEY in your .env file."
        )

    try:
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_key
        )
        logger.info("✅ Supabase client initialized successfully")
        return _supabase_client
    except Exception as e:
        logger.error(f"❌ Failed to initialize Supabase client: {e}")
        raise RuntimeError(f"Failed to connect to Supabase: {e}")


def check_supabase_connection() -> bool:
    """
    Test if Supabase is reachable.
    Returns True if connected, False otherwise.
    """
    try:
        client = get_supabase_client()
        # Simple query to verify connection
        client.table("feedback").select("id").limit(1).execute()
        return True
    except Exception as e:
        logger.warning(f"Supabase connection check failed: {e}")
        return False
