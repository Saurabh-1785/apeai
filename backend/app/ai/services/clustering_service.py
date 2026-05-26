"""
ApeAI — Clustering Service

Implements the iterative clustering logic using vector similarity.
Supports dynamic thresholds based on feedback type.
"""

import logging
from typing import Dict, Any, List, Optional

from backend.app.ai.gemini_client import gemini_client
from backend.app.db.supabase_client import get_supabase_client
from backend.app.services.cluster_service import create_cluster, add_feedback_to_cluster

logger = logging.getLogger(__name__)

# Thresholds as requested by user
THRESHOLDS = {
    "bug": 0.90,
    "feature_request": 0.85,
    "usability": 0.85,
    "default": 0.80
}

async def classify_feedback(content: str) -> str:
    """
    Quickly classify feedback to determine the appropriate similarity threshold.
    In a full implementation, this could use Gemini, but for speed we'll use keyword heuristics
    or a very fast Gemini 2.0 Flash call.
    """
    content_lower = content.lower()
    if any(word in content_lower for word in ["bug", "error", "fail", "broken", "crash", "wrong"]):
        return "bug"
    if any(word in content_lower for word in ["feature", "add", "new", "want", "should", "could"]):
        return "feature_request"
    return "default"

async def cluster_unprocessed_feedback(user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Finds all feedback items not yet in a cluster and groups them.
    
    Step 1: Generate embeddings for any feedback that doesn't have one yet.
    Step 2: Use vector similarity to group feedback into clusters.
    """
    db = get_supabase_client()
    
    # 1. First, ensure ALL feedback items have embeddings
    from backend.app.services.embedding_service import create_embeddings_batch
    
    try:
        embed_result = await create_embeddings_batch()
        logger.info(f"📊 Embedding batch result: {embed_result}")
    except Exception as e:
        logger.error(f"Failed to create embeddings batch: {e}")
        # Continue anyway — some embeddings may already exist
    
    # 2. Get all feedback IDs that have embeddings but NO cluster link
    feedback_res = db.table("feedback").select("id, content").execute()
    links_res = db.table("cluster_feedback").select("feedback_id").execute()
    
    linked_ids = {l["feedback_id"] for l in (links_res.data or [])}
    unprocessed = [f for f in (feedback_res.data or []) if f["id"] not in linked_ids]
    
    if not unprocessed:
        return {"processed": 0, "new_clusters": 0, "linked": 0, "message": "All feedback is already clustered."}

    logger.info(f"🔄 Processing {len(unprocessed)} unclustered feedback items")
    
    # 3. Check if we have ANY embeddings at all
    embedding_check = db.table("embeddings").select("feedback_id", count="exact").execute()
    embedding_count = embedding_check.count if embedding_check.count is not None else len(embedding_check.data or [])
    
    if embedding_count == 0:
        logger.warning("⚠️ No embeddings exist yet — cannot do similarity matching. Creating standalone clusters.")
        # Fall back: create one cluster per feedback type
        return await _create_fallback_clusters(unprocessed, user_id=user_id)
    
    new_clusters = 0
    linked = 0
    
    for item in unprocessed:
        fid = item["id"]
        content = item["content"]
        
        # Determine threshold
        fb_type = await classify_feedback(content)
        threshold = THRESHOLDS.get(fb_type, THRESHOLDS["default"])
        
        # Search for similar feedback that is ALREADY in a cluster
        from backend.app.services.embedding_service import generate_embedding
        
        try:
            embedding = await generate_embedding(content)
            vector_str = f"[{','.join(str(v) for v in embedding)}]"
            
            # Find similar items
            matches = db.rpc("match_feedback", {
                "query_embedding": vector_str,
                "match_count": 5,
                "match_threshold": threshold
            }).execute()
            
            cluster_id = None
            if matches.data:
                # Check if any match belongs to a cluster
                match_ids = [m["feedback_id"] for m in matches.data if m["feedback_id"] != fid]
                if match_ids:
                    existing_links = db.table("cluster_feedback") \
                        .select("cluster_id") \
                        .in_("feedback_id", match_ids) \
                        .limit(1) \
                        .execute()
                    
                    if existing_links.data:
                        cluster_id = existing_links.data[0]["cluster_id"]
            
            if cluster_id:
                # Link to existing cluster
                sim_score = matches.data[0]["similarity"] if matches.data else 0.8
                await add_feedback_to_cluster(cluster_id, [fid], [sim_score])
                linked += 1
            else:
                # Create new cluster
                await create_cluster(
                    title=f"New {fb_type.replace('_', ' ').title()} Cluster",
                    feedback_ids=[fid],
                    confidence_score=100.0,
                    user_id=user_id
                )
                new_clusters += 1
                
        except Exception as e:
            logger.error(f"Failed to cluster feedback {fid}: {e}")
            continue

    return {
        "processed": len(unprocessed),
        "new_clusters": new_clusters,
        "linked": linked,
        "message": f"Processed {len(unprocessed)} items: {new_clusters} new clusters, {linked} linked to existing."
    }


async def _create_fallback_clusters(unprocessed: list, user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Fallback clustering when no embeddings exist.
    Groups feedback by type (bug, feature_request, etc.) and creates one cluster per type.
    """
    groups: Dict[str, list] = {}
    for item in unprocessed:
        fb_type = await classify_feedback(item["content"])
        groups.setdefault(fb_type, []).append(item["id"])
    
    new_clusters = 0
    for fb_type, fids in groups.items():
        await create_cluster(
            title=f"{fb_type.replace('_', ' ').title()} Feedback Group",
            summary=f"Auto-grouped {len(fids)} {fb_type} feedback items (fallback clustering — no embeddings available yet).",
            feedback_ids=fids,
            confidence_score=50.0,
            user_id=user_id,
        )
        new_clusters += 1
    
    return {
        "processed": len(unprocessed),
        "new_clusters": new_clusters,
        "linked": 0,
        "message": f"Created {new_clusters} clusters using keyword-based fallback grouping ({len(unprocessed)} total items)."
    }

