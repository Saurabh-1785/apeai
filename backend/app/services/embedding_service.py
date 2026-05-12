"""
ApeAI — Embedding Service

Generates vector embeddings using OpenAI's text-embedding-3-small model
and stores them in Supabase pgvector for similarity search.

This is the bridge between raw text feedback and AI-powered clustering.
"""

import logging
from typing import Dict, Any, List, Optional

from backend.app.core.config import settings
from backend.app.db.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

# Lazy-loaded OpenAI client
_openai_client = None


def _get_openai_client():
    """Get or create the OpenAI client (lazy initialization)."""
    global _openai_client
    if _openai_client is not None:
        return _openai_client

    if not settings.openai_api_key:
        raise RuntimeError(
            "OpenAI API key not configured. "
            "Set OPENAI_API_KEY in your .env file."
        )

    from openai import OpenAI
    _openai_client = OpenAI(api_key=settings.openai_api_key)
    logger.info("✅ OpenAI client initialized")
    return _openai_client


async def generate_embedding(text: str) -> List[float]:
    """
    Generate a vector embedding for the given text.
    
    Uses OpenAI text-embedding-3-small (1536 dimensions).
    
    Args:
        text: The text to embed.
        
    Returns:
        List of 1536 floats representing the embedding vector.
    """
    client = _get_openai_client()

    try:
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
        )
        embedding = response.data[0].embedding
        logger.debug(f"Generated embedding: {len(embedding)} dimensions")
        return embedding

    except Exception as e:
        logger.error(f"❌ Failed to generate embedding: {e}")
        raise RuntimeError(f"Embedding generation failed: {e}")


async def create_embedding_for_feedback(feedback_id: str) -> Dict[str, Any]:
    """
    Generate and store an embedding for a specific feedback item.
    
    1. Fetches the feedback content from Supabase
    2. Generates the embedding via OpenAI
    3. Stores the vector in the embeddings table
    
    Args:
        feedback_id: UUID of the feedback item.
        
    Returns:
        The created embedding row.
    """
    db = get_supabase_client()

    # Check if embedding already exists
    existing = db.table("embeddings") \
        .select("id") \
        .eq("feedback_id", feedback_id) \
        .execute()

    if existing.data:
        logger.info(f"⏭️  Embedding already exists for feedback {feedback_id}")
        return existing.data[0]

    # Fetch the feedback content
    feedback = db.table("feedback") \
        .select("id, content") \
        .eq("id", feedback_id) \
        .single() \
        .execute()

    if not feedback.data:
        raise ValueError(f"Feedback not found: {feedback_id}")

    content = feedback.data["content"]

    # Generate embedding
    logger.info(f"🧠 Generating embedding for feedback {feedback_id} ({len(content)} chars)")
    embedding = await generate_embedding(content)

    # Store in database
    # pgvector expects the vector as a string representation: '[0.1, 0.2, ...]'
    vector_str = f"[{','.join(str(v) for v in embedding)}]"

    result = db.table("embeddings").insert({
        "feedback_id": feedback_id,
        "embedding": vector_str,
        "model": "text-embedding-3-small",
    }).execute()

    if result.data:
        logger.info(f"✅ Embedding stored for feedback {feedback_id}")
        return result.data[0]
    else:
        raise RuntimeError(f"Failed to store embedding for {feedback_id}")


async def create_embeddings_batch(
    feedback_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Generate embeddings for multiple feedback items.
    
    If feedback_ids is None, embeds all feedback that doesn't have
    an embedding yet (backfill mode).
    
    Args:
        feedback_ids: Optional list of specific feedback UUIDs.
        
    Returns:
        Summary with counts of created, skipped, and errors.
    """
    db = get_supabase_client()

    if feedback_ids is None:
        # Find all feedback without embeddings
        # Use a left join approach: get all feedback IDs, then filter
        all_feedback = db.table("feedback").select("id").execute()
        existing_embeddings = db.table("embeddings").select("feedback_id").execute()

        existing_ids = {e["feedback_id"] for e in (existing_embeddings.data or [])}
        feedback_ids = [
            f["id"] for f in (all_feedback.data or [])
            if f["id"] not in existing_ids
        ]

    if not feedback_ids:
        return {"total": 0, "created": 0, "skipped": 0, "errors": []}

    created = 0
    skipped = 0
    errors = []

    logger.info(f"🧠 Batch embedding: {len(feedback_ids)} items to process")

    for fid in feedback_ids:
        try:
            result = await create_embedding_for_feedback(fid)
            if result.get("id"):
                created += 1
            else:
                skipped += 1
        except ValueError as e:
            logger.warning(f"Skipped {fid}: {e}")
            skipped += 1
        except Exception as e:
            logger.error(f"Error embedding {fid}: {e}")
            errors.append({"feedback_id": fid, "error": str(e)})

    logger.info(
        f"✅ Batch embedding complete: {created} created, "
        f"{skipped} skipped, {len(errors)} errors"
    )

    return {
        "total": len(feedback_ids),
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }


async def search_similar(
    text: Optional[str] = None,
    feedback_id: Optional[str] = None,
    match_count: int = 10,
    match_threshold: float = 0.7,
) -> List[Dict[str, Any]]:
    """
    Find feedback items similar to the given text or feedback item.
    
    Uses pgvector cosine distance for similarity comparison.
    
    Args:
        text: Text to search for (generates embedding on the fly).
        feedback_id: Find items similar to this feedback.
        match_count: Number of results to return.
        match_threshold: Minimum similarity score (0-1).
        
    Returns:
        List of similar feedback items with similarity scores.
    """
    db = get_supabase_client()

    # Get the query embedding
    if text:
        query_embedding = await generate_embedding(text)
    elif feedback_id:
        result = db.table("embeddings") \
            .select("embedding") \
            .eq("feedback_id", feedback_id) \
            .single() \
            .execute()

        if not result.data:
            raise ValueError(f"No embedding found for feedback {feedback_id}")

        query_embedding = result.data["embedding"]
    else:
        raise ValueError("Either 'text' or 'feedback_id' must be provided")

    # Use the match_feedback RPC function for similarity search
    vector_str = f"[{','.join(str(v) for v in query_embedding)}]" if isinstance(query_embedding, list) else query_embedding

    result = db.rpc("match_feedback", {
        "query_embedding": vector_str,
        "match_count": match_count,
        "match_threshold": match_threshold,
    }).execute()

    return result.data or []


async def get_embedding_stats() -> Dict[str, Any]:
    """Get embedding statistics."""
    db = get_supabase_client()

    try:
        total_feedback = db.table("feedback").select("id", count="exact").execute()
        total_embeddings = db.table("embeddings").select("id", count="exact").execute()

        feedback_count = total_feedback.count if total_feedback.count is not None else len(total_feedback.data or [])
        embedding_count = total_embeddings.count if total_embeddings.count is not None else len(total_embeddings.data or [])

        return {
            "total_feedback": feedback_count,
            "total_embedded": embedding_count,
            "total_unembedded": feedback_count - embedding_count,
        }
    except Exception as e:
        logger.error(f"Failed to get embedding stats: {e}")
        return {"total_feedback": 0, "total_embedded": 0, "total_unembedded": 0, "error": str(e)}
