"""
ApeAI — Embedding Routes

Endpoints for generating and managing vector embeddings,
and performing similarity search across feedback items.

Endpoints:
  POST /embeddings/create         — Embed a single feedback item
  POST /embeddings/batch          — Embed all un-embedded feedback
  POST /embeddings/search         — Similarity search
  GET  /embeddings/stats          — Embedding statistics
"""

import logging

from fastapi import APIRouter, HTTPException

from backend.app.models.storage import (
    EmbeddingCreate,
    EmbeddingResponse,
    EmbeddingBatchCreate,
    EmbeddingBatchResponse,
    SimilaritySearchRequest,
    SimilaritySearchResponse,
    SimilarFeedback,
)
from backend.app.services.embedding_service import (
    create_embedding_for_feedback,
    create_embeddings_batch,
    search_similar,
    get_embedding_stats,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/embeddings", tags=["Embeddings & Similarity"])


@router.post(
    "/create",
    response_model=EmbeddingResponse,
    summary="Generate embedding for a feedback item",
)
async def create_embedding(data: EmbeddingCreate):
    """
    Generate a vector embedding for a single feedback item.
    
    Uses OpenAI text-embedding-3-small (1536 dimensions).
    The embedding is stored in pgvector for similarity search.
    Skips if embedding already exists.
    """
    try:
        result = await create_embedding_for_feedback(data.feedback_id)
        return EmbeddingResponse(
            id=result.get("id", ""),
            feedback_id=result.get("feedback_id", data.feedback_id),
            model=result.get("model", "text-embedding-3-small"),
            dimensions=1536,
            created_at=result.get("created_at", ""),
            message="Embedding created successfully",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post(
    "/batch",
    response_model=EmbeddingBatchResponse,
    summary="Generate embeddings for multiple feedback items",
)
async def batch_create_embeddings(data: EmbeddingBatchCreate):
    """
    Generate embeddings for multiple feedback items in batch.
    
    If no feedback_ids are specified, automatically finds and embeds
    all feedback items that don't have embeddings yet (backfill mode).
    """
    try:
        result = await create_embeddings_batch(data.feedback_ids)
        return EmbeddingBatchResponse(
            total=result["total"],
            created=result["created"],
            skipped=result["skipped"],
            errors=result["errors"],
            message=f"Batch complete: {result['created']} created, {result['skipped']} skipped",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post(
    "/search",
    response_model=SimilaritySearchResponse,
    summary="Find similar feedback items",
)
async def similarity_search(data: SimilaritySearchRequest):
    """
    Find feedback items similar to the given text or feedback item.
    
    Uses pgvector cosine distance for fast similarity matching.
    This is the foundation for feedback clustering.
    """
    if not data.text and not data.feedback_id:
        raise HTTPException(
            status_code=400,
            detail="Either 'text' or 'feedback_id' must be provided",
        )

    try:
        results = await search_similar(
            text=data.text,
            feedback_id=data.feedback_id,
            match_count=data.match_count,
            match_threshold=data.match_threshold,
        )

        similar_items = [
            SimilarFeedback(
                feedback_id=r["feedback_id"],
                content=r["content"],
                source=r["source"],
                similarity=r["similarity"],
            )
            for r in results
        ]

        query_desc = data.text[:100] if data.text else f"feedback:{data.feedback_id}"
        return SimilaritySearchResponse(
            query=query_desc,
            results=similar_items,
            count=len(similar_items),
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get(
    "/stats",
    summary="Embedding statistics",
)
async def embedding_stats():
    """Get counts of total, embedded, and un-embedded feedback items."""
    try:
        stats = await get_embedding_stats()
        return stats
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
