"""
ApeAI — Cluster Service

Manages feedback clusters — groups of related feedback items
that represent a common theme or user request.

Clusters are central to the pipeline: they flow through states
from 'new' → 'clustered' → 'brd_generated' → ... → 'tickets_created'.
"""

import logging
from typing import Dict, Any, List, Optional

from backend.app.db.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


async def create_cluster(
    title: str,
    summary: Optional[str] = None,
    feedback_ids: Optional[List[str]] = None,
    confidence_score: float = 0.0,
) -> Dict[str, Any]:
    """
    Create a new feedback cluster.
    
    Args:
        title: Descriptive title for the cluster theme.
        summary: Brief summary of the cluster.
        feedback_ids: List of feedback UUIDs to include.
        confidence_score: AI confidence score (0-100).
        
    Returns:
        The created cluster row.
    """
    db = get_supabase_client()

    # Create the cluster
    cluster_data = {
        "title": title,
        "summary": summary,
        "confidence_score": confidence_score,
        "feedback_count": len(feedback_ids) if feedback_ids else 0,
        "status": "new",
    }

    result = db.table("clusters").insert(cluster_data).execute()

    if not result.data:
        raise RuntimeError("Failed to create cluster")

    cluster = result.data[0]
    cluster_id = cluster["id"]

    logger.info(f"✅ Cluster created: {cluster_id} — '{title}'")

    # Link feedback items to the cluster
    if feedback_ids:
        links = [
            {"cluster_id": cluster_id, "feedback_id": fid}
            for fid in feedback_ids
        ]
        db.table("cluster_feedback").insert(links).execute()
        logger.info(f"   Linked {len(feedback_ids)} feedback items")

    return cluster


async def get_cluster(cluster_id: str, include_feedback: bool = True) -> Dict[str, Any]:
    """
    Get a cluster by ID, optionally including its feedback items.
    
    Args:
        cluster_id: UUID of the cluster.
        include_feedback: Whether to include feedback items.
        
    Returns:
        Cluster data with optional feedback items.
    """
    db = get_supabase_client()

    result = db.table("clusters") \
        .select("*") \
        .eq("id", cluster_id) \
        .single() \
        .execute()

    if not result.data:
        raise ValueError(f"Cluster not found: {cluster_id}")

    cluster = result.data

    if include_feedback:
        # Get linked feedback items
        links = db.table("cluster_feedback") \
            .select("feedback_id, similarity_score") \
            .eq("cluster_id", cluster_id) \
            .execute()

        feedback_items = []
        if links.data:
            fids = [l["feedback_id"] for l in links.data]
            scores = {l["feedback_id"]: l.get("similarity_score") for l in links.data}

            feedback = db.table("feedback") \
                .select("*") \
                .in_("id", fids) \
                .execute()

            for f in (feedback.data or []):
                f["similarity_score"] = scores.get(f["id"])
                feedback_items.append(f)

        cluster["feedback_items"] = feedback_items

    return cluster


async def list_clusters(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    List clusters with optional status filter.
    
    Args:
        status: Filter by pipeline status (e.g., 'new', 'approved').
        limit: Number of clusters to return.
        offset: Pagination offset.
        
    Returns:
        Dict with clusters list and total count.
    """
    db = get_supabase_client()

    query = db.table("clusters") \
        .select("*", count="exact") \
        .order("created_at", desc=True) \
        .range(offset, offset + limit - 1)

    if status:
        query = query.eq("status", status)

    result = query.execute()

    total = result.count if result.count is not None else len(result.data or [])

    return {
        "clusters": result.data or [],
        "total": total,
    }


async def update_cluster(
    cluster_id: str,
    title: Optional[str] = None,
    summary: Optional[str] = None,
    status: Optional[str] = None,
    confidence_score: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Update a cluster's fields.
    
    Only non-None fields are updated.
    """
    db = get_supabase_client()

    update_data = {}
    if title is not None:
        update_data["title"] = title
    if summary is not None:
        update_data["summary"] = summary
    if status is not None:
        update_data["status"] = status
    if confidence_score is not None:
        update_data["confidence_score"] = confidence_score

    if not update_data:
        raise ValueError("No fields to update")

    result = db.table("clusters") \
        .update(update_data) \
        .eq("id", cluster_id) \
        .execute()

    if not result.data:
        raise ValueError(f"Cluster not found: {cluster_id}")

    logger.info(f"✅ Cluster updated: {cluster_id}")
    return result.data[0]


async def delete_cluster(cluster_id: str) -> bool:
    """
    Delete a cluster and all its links.
    
    Cascade delete handles cluster_feedback and documents.
    """
    db = get_supabase_client()

    result = db.table("clusters") \
        .delete() \
        .eq("id", cluster_id) \
        .execute()

    if result.data:
        logger.info(f"🗑️  Cluster deleted: {cluster_id}")
        return True

    raise ValueError(f"Cluster not found: {cluster_id}")


async def add_feedback_to_cluster(
    cluster_id: str,
    feedback_ids: List[str],
    similarity_scores: Optional[List[float]] = None,
) -> Dict[str, Any]:
    """
    Add feedback items to an existing cluster.
    
    Args:
        cluster_id: UUID of the cluster.
        feedback_ids: List of feedback UUIDs to add.
        similarity_scores: Optional similarity scores for each item.
        
    Returns:
        Summary with count of items added.
    """
    db = get_supabase_client()

    links = []
    for i, fid in enumerate(feedback_ids):
        link = {"cluster_id": cluster_id, "feedback_id": fid}
        if similarity_scores and i < len(similarity_scores):
            link["similarity_score"] = similarity_scores[i]
        links.append(link)

    result = db.table("cluster_feedback").insert(links).execute()

    # Update feedback count on the cluster
    count_result = db.table("cluster_feedback") \
        .select("id", count="exact") \
        .eq("cluster_id", cluster_id) \
        .execute()

    new_count = count_result.count if count_result.count is not None else len(count_result.data or [])
    db.table("clusters").update({"feedback_count": new_count}).eq("id", cluster_id).execute()

    logger.info(f"✅ Added {len(feedback_ids)} items to cluster {cluster_id}")
    return {"added": len(result.data or []), "total_in_cluster": new_count}


async def remove_feedback_from_cluster(
    cluster_id: str,
    feedback_ids: List[str],
) -> Dict[str, Any]:
    """Remove feedback items from a cluster."""
    db = get_supabase_client()

    for fid in feedback_ids:
        db.table("cluster_feedback") \
            .delete() \
            .eq("cluster_id", cluster_id) \
            .eq("feedback_id", fid) \
            .execute()

    # Update feedback count
    count_result = db.table("cluster_feedback") \
        .select("id", count="exact") \
        .eq("cluster_id", cluster_id) \
        .execute()

    new_count = count_result.count if count_result.count is not None else len(count_result.data or [])
    db.table("clusters").update({"feedback_count": new_count}).eq("id", cluster_id).execute()

    logger.info(f"🗑️  Removed {len(feedback_ids)} items from cluster {cluster_id}")
    return {"removed": len(feedback_ids), "total_in_cluster": new_count}


async def get_cluster_stats() -> Dict[str, Any]:
    """Get cluster statistics grouped by status."""
    db = get_supabase_client()

    try:
        result = db.table("clusters").select("status").execute()

        by_status: Dict[str, int] = {}
        for row in (result.data or []):
            s = row.get("status", "unknown")
            by_status[s] = by_status.get(s, 0) + 1

        return {
            "total": len(result.data or []),
            "by_status": by_status,
        }
    except Exception as e:
        logger.error(f"Failed to get cluster stats: {e}")
        return {"total": 0, "by_status": {}, "error": str(e)}
