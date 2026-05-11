"""
ApeAI — Feedback Storage Service

Handles saving normalized FeedbackItems to Supabase.
Supports both single insert and batch insert (for CSV uploads).
"""

import logging
from typing import Dict, Any, List

from backend.app.db.supabase_client import get_supabase_client
from backend.app.models.feedback import FeedbackItem

logger = logging.getLogger(__name__)


async def save_feedback(item: FeedbackItem) -> Dict[str, Any]:
    """
    Save a single normalized feedback item to Supabase.
    
    Args:
        item: A normalized FeedbackItem ready for storage.
        
    Returns:
        The inserted row data (including generated UUID).
        
    Raises:
        RuntimeError: If Supabase is not configured or insert fails.
    """
    client = get_supabase_client()
    db_data = item.to_db_dict()

    logger.info(
        f"💾 Saving feedback: source={item.source}, "
        f"author={item.author}, "
        f"content_length={len(item.content)} chars"
    )

    try:
        response = client.table("feedback").insert(db_data).execute()
        
        if response.data:
            saved = response.data[0]
            logger.info(f"✅ Feedback saved: id={saved.get('id')}")
            return saved
        else:
            raise RuntimeError("Supabase insert returned no data")

    except Exception as e:
        logger.error(f"❌ Failed to save feedback: {e}")
        raise RuntimeError(f"Failed to save feedback: {e}")


async def save_feedback_batch(items: List[FeedbackItem]) -> List[Dict[str, Any]]:
    """
    Save multiple feedback items in a single batch insert.
    
    Used primarily for CSV uploads to reduce database round trips.
    
    Args:
        items: List of normalized FeedbackItems.
        
    Returns:
        List of inserted rows.
    """
    if not items:
        return []

    client = get_supabase_client()
    db_data = [item.to_db_dict() for item in items]

    logger.info(f"💾 Batch saving {len(items)} feedback items")

    try:
        response = client.table("feedback").insert(db_data).execute()

        if response.data:
            logger.info(f"✅ Batch save complete: {len(response.data)} items saved")
            return response.data
        else:
            raise RuntimeError("Supabase batch insert returned no data")

    except Exception as e:
        logger.error(f"❌ Batch save failed: {e}")
        raise RuntimeError(f"Batch save failed: {e}")


async def get_feedback_stats() -> Dict[str, Any]:
    """
    Get feedback count statistics grouped by source.
    
    Returns:
        Dict with total count and per-source breakdown.
    """
    client = get_supabase_client()

    try:
        response = client.table("feedback").select("source").execute()

        if not response.data:
            return {"total": 0, "by_source": {}}

        # Count per source
        by_source: Dict[str, int] = {}
        for row in response.data:
            src = row.get("source", "unknown")
            by_source[src] = by_source.get(src, 0) + 1

        return {
            "total": len(response.data),
            "by_source": by_source,
        }

    except Exception as e:
        logger.error(f"Failed to get feedback stats: {e}")
        return {"total": 0, "by_source": {}, "error": str(e)}
