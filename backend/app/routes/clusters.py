"""
ApeAI — Cluster Routes

Full CRUD for feedback clusters + feedback linking.

Endpoints:
  POST   /clusters/             — Create a new cluster
  GET    /clusters/             — List clusters (with status filter)
  GET    /clusters/{id}         — Get cluster with its feedback items
  PATCH  /clusters/{id}         — Update cluster (title, status, etc.)
  DELETE /clusters/{id}         — Delete a cluster
  POST   /clusters/{id}/feedback — Add feedback items to cluster
  DELETE /clusters/{id}/feedback — Remove feedback from cluster
  GET    /clusters/stats        — Cluster statistics
"""

import logging

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List

from backend.app.models.storage import (
    ClusterCreate,
    ClusterUpdate,
    ClusterAddFeedback,
    ClusterResponse,
    ClusterListResponse,
)
from backend.app.services.cluster_service import (
    create_cluster,
    get_cluster,
    list_clusters,
    update_cluster,
    delete_cluster,
    add_feedback_to_cluster,
    remove_feedback_from_cluster,
    get_cluster_stats,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clusters", tags=["Clusters"])


@router.post(
    "/",
    response_model=ClusterResponse,
    summary="Create a new cluster",
)
async def api_create_cluster(data: ClusterCreate):
    """
    Create a new feedback cluster.
    
    Optionally include feedback_ids to link feedback items immediately.
    """
    try:
        cluster = await create_cluster(
            title=data.title,
            summary=data.summary,
            feedback_ids=data.feedback_ids,
            confidence_score=data.confidence_score,
        )
        return _cluster_to_response(cluster)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get(
    "/stats",
    summary="Cluster statistics",
)
async def api_cluster_stats():
    """Get cluster count and breakdown by pipeline status."""
    try:
        return await get_cluster_stats()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get(
    "/",
    response_model=ClusterListResponse,
    summary="List clusters",
)
async def api_list_clusters(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all clusters with optional status filter and pagination."""
    try:
        result = await list_clusters(status=status, limit=limit, offset=offset)
        return ClusterListResponse(
            clusters=[_cluster_to_response(c) for c in result["clusters"]],
            total=result["total"],
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.get(
    "/{cluster_id}",
    response_model=ClusterResponse,
    summary="Get cluster details",
)
async def api_get_cluster(cluster_id: str):
    """Get a cluster including its linked feedback items."""
    try:
        cluster = await get_cluster(cluster_id, include_feedback=True)
        return _cluster_to_response(cluster)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.patch(
    "/{cluster_id}",
    response_model=ClusterResponse,
    summary="Update cluster",
)
async def api_update_cluster(cluster_id: str, data: ClusterUpdate):
    """Update a cluster's title, summary, status, or confidence score."""
    try:
        cluster = await update_cluster(
            cluster_id=cluster_id,
            title=data.title,
            summary=data.summary,
            status=data.status.value if data.status else None,
            confidence_score=data.confidence_score,
        )
        return _cluster_to_response(cluster)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.delete(
    "/{cluster_id}",
    summary="Delete cluster",
)
async def api_delete_cluster(cluster_id: str):
    """Delete a cluster and all its feedback links."""
    try:
        await delete_cluster(cluster_id)
        return {"message": f"Cluster {cluster_id} deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post(
    "/{cluster_id}/feedback",
    summary="Add feedback to cluster",
)
async def api_add_feedback(cluster_id: str, data: ClusterAddFeedback):
    """Add feedback items to an existing cluster."""
    try:
        result = await add_feedback_to_cluster(
            cluster_id=cluster_id,
            feedback_ids=data.feedback_ids,
            similarity_scores=data.similarity_scores,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.delete(
    "/{cluster_id}/feedback",
    summary="Remove feedback from cluster",
)
async def api_remove_feedback(cluster_id: str, feedback_ids: List[str] = Query(...)):
    """Remove feedback items from a cluster."""
    try:
        result = await remove_feedback_from_cluster(
            cluster_id=cluster_id,
            feedback_ids=feedback_ids,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


def _cluster_to_response(cluster: dict) -> ClusterResponse:
    """Convert a raw cluster dict to a ClusterResponse."""
    return ClusterResponse(
        id=cluster.get("id", ""),
        title=cluster.get("title"),
        summary=cluster.get("summary"),
        feedback_count=cluster.get("feedback_count", 0),
        confidence_score=cluster.get("confidence_score", 0.0),
        status=cluster.get("status", "new"),
        created_at=str(cluster.get("created_at", "")),
        updated_at=str(cluster.get("updated_at", "")),
        feedback_items=cluster.get("feedback_items", []),
    )
