"""
ApeAI — Document Service

Manages AI-generated documents (BRD, PRD, epics, stories, tasks).
Also handles the human review/approval workflow.

Documents flow: draft → review → approved/rejected → published
"""

import logging
from typing import Dict, Any, List, Optional

from backend.app.db.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


# ─── Document CRUD ───────────────────────────────────────────


async def create_document(
    cluster_id: str,
    doc_type: str,
    title: Optional[str] = None,
    content: Optional[Dict[str, Any]] = None,
    parent_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a new AI-generated document linked to a cluster.
    
    Args:
        cluster_id: UUID of the parent cluster.
        doc_type: One of: brd, prd, epic, story, task, sprint_plan
        title: Document title.
        content: JSONB content of the document.
        parent_id: UUID of parent document (e.g., story's parent epic).
        
    Returns:
        The created document row.
    """
    db = get_supabase_client()

    doc_data = {
        "cluster_id": cluster_id,
        "type": doc_type,
        "title": title,
        "content": content or {},
        "parent_id": parent_id,
        "status": "draft",
        "version": 1,
    }

    result = db.table("documents").insert(doc_data).execute()

    if not result.data:
        raise RuntimeError("Failed to create document")

    doc = result.data[0]
    logger.info(f"✅ Document created: {doc['id']} — type={doc_type}, cluster={cluster_id}")
    return doc


async def get_document(document_id: str) -> Dict[str, Any]:
    """Get a document by ID."""
    db = get_supabase_client()

    result = db.table("documents") \
        .select("*") \
        .eq("id", document_id) \
        .single() \
        .execute()

    if not result.data:
        raise ValueError(f"Document not found: {document_id}")

    return result.data


async def list_documents(
    cluster_id: Optional[str] = None,
    doc_type: Optional[str] = None,
    status: Optional[str] = None,
    parent_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    List documents with optional filters.
    
    Args:
        cluster_id: Filter by cluster.
        doc_type: Filter by document type (brd, prd, epic, etc.).
        status: Filter by review status.
        parent_id: Filter by parent document.
        limit: Results per page.
        offset: Pagination offset.
    """
    db = get_supabase_client()

    query = db.table("documents") \
        .select("*", count="exact") \
        .order("created_at", desc=True) \
        .range(offset, offset + limit - 1)

    if cluster_id:
        query = query.eq("cluster_id", cluster_id)
    if doc_type:
        query = query.eq("type", doc_type)
    if status:
        query = query.eq("status", status)
    if parent_id:
        query = query.eq("parent_id", parent_id)

    result = query.execute()

    total = result.count if result.count is not None else len(result.data or [])

    return {
        "documents": result.data or [],
        "total": total,
    }


async def update_document(
    document_id: str,
    title: Optional[str] = None,
    content: Optional[Dict[str, Any]] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Update a document's fields.
    
    When content changes, the version number is incremented.
    """
    db = get_supabase_client()

    update_data = {}
    if title is not None:
        update_data["title"] = title
    if content is not None:
        update_data["content"] = content
    if status is not None:
        update_data["status"] = status

    if not update_data:
        raise ValueError("No fields to update")

    # Increment version if content is changing
    if content is not None:
        current = await get_document(document_id)
        update_data["version"] = current.get("version", 1) + 1

    result = db.table("documents") \
        .update(update_data) \
        .eq("id", document_id) \
        .execute()

    if not result.data:
        raise ValueError(f"Document not found: {document_id}")

    logger.info(f"✅ Document updated: {document_id}")
    return result.data[0]


async def delete_document(document_id: str) -> bool:
    """Delete a document (cascades to approvals and ticket links)."""
    db = get_supabase_client()

    result = db.table("documents") \
        .delete() \
        .eq("id", document_id) \
        .execute()

    if result.data:
        logger.info(f"🗑️  Document deleted: {document_id}")
        return True

    raise ValueError(f"Document not found: {document_id}")


# ─── Approval / Review Gate ──────────────────────────────────


async def create_approval(
    document_id: str,
    approved: bool,
    reviewed_by: str,
    review_notes: Optional[str] = None,
    edited_content: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Submit a human review for a document.
    
    If edited_content is provided, the original content is saved
    alongside the edits — this powers the feedback loop feature
    where human corrections improve future AI prompts.
    
    Args:
        document_id: UUID of the document being reviewed.
        approved: True to approve, False to reject.
        reviewed_by: Name/ID of the reviewer.
        review_notes: Optional notes from the reviewer.
        edited_content: If the reviewer made changes, the new content.
        
    Returns:
        The created approval row.
    """
    db = get_supabase_client()

    # Fetch the current document to store original content
    doc = await get_document(document_id)
    original_content = doc.get("content")

    approval_data = {
        "document_id": document_id,
        "approved": approved,
        "reviewed_by": reviewed_by,
        "review_notes": review_notes,
        "original_content": original_content,
        "edited_content": edited_content,
    }

    result = db.table("approvals").insert(approval_data).execute()

    if not result.data:
        raise RuntimeError("Failed to create approval")

    # Update document status based on approval
    new_status = "approved" if approved else "rejected"
    db.table("documents").update({"status": new_status}).eq("id", document_id).execute()

    # If edits were made and approved, update the document content
    if approved and edited_content:
        await update_document(document_id, content=edited_content, status="approved")
        logger.info(f"📝 Document {document_id} content updated with reviewer edits")

    # Update cluster status if this is a final approval
    if approved:
        doc_type = doc.get("type", "")
        status_map = {
            "brd": "brd_generated",
            "prd": "prd_generated",
            "story": "stories_generated",
            "task": "tasks_generated",
        }
        if doc_type in status_map:
            cluster_id = doc.get("cluster_id")
            if cluster_id:
                db.table("clusters") \
                    .update({"status": status_map[doc_type]}) \
                    .eq("id", cluster_id) \
                    .execute()

    action = "approved" if approved else "rejected"
    logger.info(f"✅ Document {document_id} {action} by {reviewed_by}")
    return result.data[0]


async def list_approvals(
    document_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Dict[str, Any]:
    """List approvals for a document or all approvals."""
    db = get_supabase_client()

    query = db.table("approvals") \
        .select("*", count="exact") \
        .order("created_at", desc=True) \
        .range(offset, offset + limit - 1)

    if document_id:
        query = query.eq("document_id", document_id)

    result = query.execute()

    total = result.count if result.count is not None else len(result.data or [])

    return {
        "approvals": result.data or [],
        "total": total,
    }


# ─── Integration Config ──────────────────────────────────────


async def create_integration(
    int_type: str,
    name: str,
    api_key: str,
    api_url: Optional[str] = None,
    project_id: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Create a new external integration configuration."""
    db = get_supabase_client()

    int_data = {
        "type": int_type,
        "name": name,
        "api_key": api_key,
        "api_url": api_url,
        "project_id": project_id,
        "config": config or {},
        "is_active": True,
    }

    result = db.table("integrations").insert(int_data).execute()

    if not result.data:
        raise RuntimeError("Failed to create integration")

    logger.info(f"✅ Integration created: {result.data[0]['id']} — type={int_type}, name={name}")
    return result.data[0]


async def list_integrations(
    int_type: Optional[str] = None,
    active_only: bool = True,
) -> Dict[str, Any]:
    """List configured integrations."""
    db = get_supabase_client()

    query = db.table("integrations").select("*").order("created_at", desc=True)

    if int_type:
        query = query.eq("type", int_type)
    if active_only:
        query = query.eq("is_active", True)

    result = query.execute()

    # Mask API keys in response
    integrations = []
    for row in (result.data or []):
        row["api_key"] = "***masked***"
        integrations.append(row)

    return {"integrations": integrations, "total": len(integrations)}


async def update_integration(
    integration_id: str,
    name: Optional[str] = None,
    api_key: Optional[str] = None,
    api_url: Optional[str] = None,
    project_id: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
    is_active: Optional[bool] = None,
) -> Dict[str, Any]:
    """Update an existing integration."""
    db = get_supabase_client()

    update_data = {}
    if name is not None:
        update_data["name"] = name
    if api_key is not None:
        update_data["api_key"] = api_key
    if api_url is not None:
        update_data["api_url"] = api_url
    if project_id is not None:
        update_data["project_id"] = project_id
    if config is not None:
        update_data["config"] = config
    if is_active is not None:
        update_data["is_active"] = is_active

    if not update_data:
        raise ValueError("No fields to update")

    result = db.table("integrations") \
        .update(update_data) \
        .eq("id", integration_id) \
        .execute()

    if not result.data:
        raise ValueError(f"Integration not found: {integration_id}")

    logger.info(f"✅ Integration updated: {integration_id}")
    return result.data[0]


async def delete_integration(integration_id: str) -> bool:
    """Delete an integration."""
    db = get_supabase_client()

    result = db.table("integrations") \
        .delete() \
        .eq("id", integration_id) \
        .execute()

    if result.data:
        logger.info(f"🗑️  Integration deleted: {integration_id}")
        return True

    raise ValueError(f"Integration not found: {integration_id}")


# ─── Ticket Links ────────────────────────────────────────────


async def create_ticket_link(
    document_id: str,
    integration_id: str,
    external_id: str,
    external_url: Optional[str] = None,
    external_status: Optional[str] = None,
) -> Dict[str, Any]:
    """Record a link between a document and an external ticket."""
    db = get_supabase_client()

    link_data = {
        "document_id": document_id,
        "integration_id": integration_id,
        "external_id": external_id,
        "external_url": external_url,
        "external_status": external_status,
    }

    result = db.table("ticket_links").insert(link_data).execute()

    if not result.data:
        raise RuntimeError("Failed to create ticket link")

    # Update cluster status to 'tickets_created'
    doc = await get_document(document_id)
    if doc.get("cluster_id"):
        db.table("clusters") \
            .update({"status": "tickets_created"}) \
            .eq("id", doc["cluster_id"]) \
            .execute()

    logger.info(f"✅ Ticket link created: doc={document_id} → {external_url or external_id}")
    return result.data[0]


async def list_ticket_links(document_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """List ticket links, optionally filtered by document."""
    db = get_supabase_client()

    query = db.table("ticket_links").select("*").order("created_at", desc=True)

    if document_id:
        query = query.eq("document_id", document_id)

    result = query.execute()
    return result.data or []


# ─── Pipeline Overview ───────────────────────────────────────


async def get_pipeline_status() -> Dict[str, Any]:
    """
    Get a comprehensive overview of the entire pipeline state.
    
    This powers the pipeline visualization in the frontend dashboard.
    """
    db = get_supabase_client()

    try:
        # Feedback stats
        feedback = db.table("feedback").select("id", count="exact").execute()
        feedback_count = feedback.count if feedback.count is not None else len(feedback.data or [])

        # Embedding stats
        embeddings = db.table("embeddings").select("id", count="exact").execute()
        embedded_count = embeddings.count if embeddings.count is not None else len(embeddings.data or [])

        # Cluster stats by status
        clusters = db.table("clusters").select("status").execute()
        clusters_by_status: Dict[str, int] = {}
        for row in (clusters.data or []):
            s = row.get("status", "unknown")
            clusters_by_status[s] = clusters_by_status.get(s, 0) + 1

        # Document stats
        documents = db.table("documents").select("type, status").execute()
        docs_by_type: Dict[str, int] = {}
        docs_by_status: Dict[str, int] = {}
        for row in (documents.data or []):
            t = row.get("type", "unknown")
            s = row.get("status", "unknown")
            docs_by_type[t] = docs_by_type.get(t, 0) + 1
            docs_by_status[s] = docs_by_status.get(s, 0) + 1

        # Approval stats
        approvals = db.table("approvals").select("approved").execute()
        approval_count = len(approvals.data or [])

        # Pending reviews = documents in 'review' status
        pending = docs_by_status.get("review", 0)

        return {
            "total_feedback": feedback_count,
            "total_embedded": embedded_count,
            "total_unembedded": feedback_count - embedded_count,
            "total_clusters": len(clusters.data or []),
            "clusters_by_status": clusters_by_status,
            "total_documents": len(documents.data or []),
            "documents_by_type": docs_by_type,
            "documents_by_status": docs_by_status,
            "total_approvals": approval_count,
            "pending_reviews": pending,
        }

    except Exception as e:
        logger.error(f"Failed to get pipeline status: {e}")
        raise RuntimeError(f"Failed to get pipeline status: {e}")
