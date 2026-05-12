"""
ApeAI — Embedding Service (Google Gemini Edition)

Generates vector embeddings using Google's text-embedding-004 model
and stores them in Supabase pgvector for similarity search.

This is the bridge between raw text feedback and AI-powered clustering.
"""

import logging
import asyncio
from typing import Dict, Any, List, Optional

import google.generativeai as genai
from backend.app.core.config import settings
from backend.app.db.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

# Singleton configuration flag
_configured = False


def _configure_google_ai():
    """Configure the Google AI SDK."""
    global _configured
    if _configured:
        return

    if not settings.google_api_key:
        raise RuntimeError(
            "Google API key not configured. "
            "Set GOOGLE_API_KEY in your .env file."
        )

    genai.configure(api_key=settings.google_api_key)
    _configured = True
    logger.info("✅ Google AI SDK configured")


async def generate_embedding(text: str) -> List[float]:
    """
    Generate a vector embedding for the given text using Google Gemini.
    
    Uses models/text-embedding-004 (768 dimensions).
    
    Args:
        text: The text to embed.
        
    Returns:
        List of 768 floats representing the embedding vector.
    """
    _configure_google_ai()

    try:
        # Run the synchronous Google SDK call in a thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        
        def _call_gemini():
            return genai.embed_content(
                model="models/text-embedding-004",
                content=text,
                task_type="clustering",
            )

        response = await loop.run_in_executor(None, _call_gemini)
        
        embedding = response['embedding']
        logger.debug(f"Generated Gemini embedding: {len(embedding)} dimensions")
        return embedding

    except Exception as e:
        logger.error(f"❌ Failed to generate Gemini embedding: {e}")
        raise RuntimeError(f"Gemini embedding generation failed: {e}")


async def create_embedding_for_feedback(feedback_id: str) -> Dict[str, Any]:
    """
    Generate and store a Gemini embedding for a specific feedback item.
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
    logger.info(f"🧠 Generating Gemini embedding for feedback {feedback_id} ({len(content)} chars)")
    embedding = await generate_embedding(content)

    # Store in database
    vector_str = f"[{','.join(str(v) for v in embedding)}]"

    result = db.table("embeddings").insert({
        "feedback_id": feedback_id,
        "embedding": vector_str,
        "model": "text-embedding-004",
    }).execute()

    if result.data:
        logger.info(f"✅ Gemini embedding stored for feedback {feedback_id}")
        return result.data[0]
    else:
        raise RuntimeError(f"Failed to store embedding for {feedback_id}")


async def create_embeddings_batch(
    feedback_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Generate Gemini embeddings for multiple feedback items.
    """
    db = get_supabase_client()

    if feedback_ids is None:
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

    logger.info(f"🧠 Batch embedding (Gemini): {len(feedback_ids)} items to process")

    for fid in feedback_ids:
        try:
            result = await create_embedding_for_feedback(fid)
            if result.get("id"):
                created += 1
            else:
                skipped += 1
        except Exception as e:
            logger.error(f"Error embedding {fid}: {e}")
            errors.append({"feedback_id": fid, "error": str(e)})

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
    match_threshold: float = 0.5, # Gemini similarity values can differ from OpenAI
) -> List[Dict[str, Any]]:
    """
    Find feedback items similar to the given text or feedback item using Gemini vectors.
    """
    db = get_supabase_client()

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
            "model": "text-embedding-004",
            "dimensions": 768
        }
    except Exception as e:
        logger.error(f"Failed to get embedding stats: {e}")
        return {"total_feedback": 0, "total_embedded": 0, "total_unembedded": 0, "error": str(e)}
