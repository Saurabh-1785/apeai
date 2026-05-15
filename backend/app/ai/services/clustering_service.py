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

async def cluster_unprocessed_feedback() -> Dict[str, Any]:
    """
    Finds all feedback items not yet in a cluster and groups them.
    """
    db = get_supabase_client()
    
    # 1. Get all feedback IDs that have embeddings but NO cluster link
    # This requires a slightly complex query or a join
    # For simplicity, we'll fetch feedback and check cluster_feedback table
    feedback_res = db.table("feedback").select("id, content").execute()
    links_res = db.table("cluster_feedback").select("feedback_id").execute()
    
    linked_ids = {l["feedback_id"] for l in (links_res.data or [])}
    unprocessed = [f for f in (feedback_res.data or []) if f["id"] not in linked_ids]
    
    if not unprocessed:
        return {"processed": 0, "new_clusters": 0, "linked": 0}

    logger.info(f"🔄 Processing {len(unprocessed)} unclustered feedback items")
    
    new_clusters = 0
    linked = 0
    
    for item in unprocessed:
        fid = item["id"]
        content = item["content"]
        
        # Determine threshold
        fb_type = await classify_feedback(content)
        threshold = THRESHOLDS.get(fb_type, THRESHOLDS["default"])
        
        # 2. Search for similar feedback that is ALREADY in a cluster
        # We use the match_feedback RPC we created in Layer 2
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
                match_ids = [m["feedback_id"] for m in matches.data]
                existing_links = db.table("cluster_feedback") \
                    .select("cluster_id") \
                    .in_("feedback_id", match_ids) \
                    .limit(1) \
                    .execute()
                
                if existing_links.data:
                    cluster_id = existing_links.data[0]["cluster_id"]
            
            if cluster_id:
                # Link to existing cluster
                await add_feedback_to_cluster(cluster_id, [fid], [matches.data[0]["similarity"]])
                linked += 1
            else:
                # Create new cluster
                # We'll use a placeholder title, which will be updated by summarization service
                await create_cluster(
                    title=f"New {fb_type.replace('_', ' ').title()} Cluster",
                    feedback_ids=[fid],
                    confidence_score=100.0
                )
                new_clusters += 1
                
        except Exception as e:
            logger.error(f"Failed to cluster feedback {fid}: {e}")
            continue

    return {
        "processed": len(unprocessed),
        "new_clusters": new_clusters,
        "linked": linked
    }
