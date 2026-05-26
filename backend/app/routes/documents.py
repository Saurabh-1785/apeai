"""
ApeAI — Document, Approval, Integration & Ticket Link Routes

Covers all CRUD operations for the remaining Layer 2 entities.

Document Endpoints:
  POST   /documents/              — Create a document
  GET    /documents/              — List documents (with filters)
  GET    /documents/{id}          — Get document details
  PATCH  /documents/{id}          — Update document
  DELETE /documents/{id}          — Delete document

Approval Endpoints:
  POST   /approvals/              — Submit approval/rejection
  GET    /approvals/              — List approvals

Integration Endpoints:
  POST   /integrations/           — Create integration
  GET    /integrations/           — List integrations
  PATCH  /integrations/{id}       — Update integration
  DELETE /integrations/{id}       — Delete integration

Ticket Link Endpoints:
  POST   /ticket-links/           — Create ticket link
  GET    /ticket-links/           — List ticket links

Pipeline:
  GET    /pipeline/status         — Full pipeline overview
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.app.models.storage import (
    DocumentCreate,
    DocumentUpdate,
    DocumentResponse,
    DocumentListResponse,
    ApprovalCreate,
    ApprovalResponse,
    ApprovalListResponse,
    IntegrationCreate,
    IntegrationUpdate,
    IntegrationResponse,
    IntegrationListResponse,
    TicketLinkCreate,
    TicketLinkResponse,
    PipelineStatus,
)
from backend.app.services.document_service import (
    create_document,
    get_document,
    list_documents,
    update_document,
    delete_document,
    create_approval,
    list_approvals,
    create_integration,
    list_integrations,
    update_integration,
    delete_integration,
    create_ticket_link,
    list_ticket_links,
    get_pipeline_status,
)

logger = logging.getLogger(__name__)


# ─── Document Routes ─────────────────────────────────────────

doc_router = APIRouter(prefix="/documents", tags=["Documents"])


@doc_router.post("", response_model=DocumentResponse, summary="Create document")
async def api_create_document(data: DocumentCreate):
    """Create a new AI-generated document linked to a cluster."""
    try:
        doc = await create_document(
            cluster_id=data.cluster_id,
            doc_type=data.type.value,
            title=data.title,
            content=data.content,
            parent_id=data.parent_id,
        )
        return _doc_to_response(doc)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@doc_router.get("", response_model=DocumentListResponse, summary="List documents")
async def api_list_documents(
    cluster_id: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    parent_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List documents with optional filters."""
    try:
        result = await list_documents(
            cluster_id=cluster_id,
            doc_type=type,
            status=status,
            parent_id=parent_id,
            limit=limit,
            offset=offset,
        )
        return DocumentListResponse(
            documents=[_doc_to_response(d) for d in result["documents"]],
            total=result["total"],
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@doc_router.get("/{document_id}", response_model=DocumentResponse, summary="Get document")
async def api_get_document(document_id: str):
    """Get a document by ID."""
    try:
        doc = await get_document(document_id)
        return _doc_to_response(doc)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@doc_router.patch("/{document_id}", response_model=DocumentResponse, summary="Update document")
async def api_update_document(document_id: str, data: DocumentUpdate):
    """Update a document's title, content, or status."""
    try:
        doc = await update_document(
            document_id=document_id,
            title=data.title,
            content=data.content,
            status=data.status.value if data.status else None,
        )
        return _doc_to_response(doc)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@doc_router.delete("/{document_id}", summary="Delete document")
async def api_delete_document(document_id: str):
    """Delete a document."""
    try:
        await delete_document(document_id)
        return {"message": f"Document {document_id} deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Approval Routes ─────────────────────────────────────────

approval_router = APIRouter(prefix="/approvals", tags=["Approvals (Review Gate)"])


@approval_router.post("", response_model=ApprovalResponse, summary="Submit review")
async def api_create_approval(data: ApprovalCreate):
    """
    Submit a human review (approve or reject) for a document.
    
    If edited_content is provided, the original and edited versions
    are saved side by side for the feedback loop feature.
    """
    try:
        approval = await create_approval(
            document_id=data.document_id,
            approved=data.approved,
            reviewed_by=data.reviewed_by,
            review_notes=data.review_notes,
            edited_content=data.edited_content,
        )
        return ApprovalResponse(
            id=approval.get("id", ""),
            document_id=approval.get("document_id", ""),
            approved=approval.get("approved", False),
            reviewed_by=approval.get("reviewed_by", ""),
            review_notes=approval.get("review_notes"),
            has_edits=approval.get("edited_content") is not None,
            reviewed_at=str(approval.get("reviewed_at", "")),
            message="approved" if approval.get("approved") else "rejected",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@approval_router.get("", response_model=ApprovalListResponse, summary="List approvals")
async def api_list_approvals(
    document_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List approvals, optionally filtered by document."""
    try:
        result = await list_approvals(document_id=document_id, limit=limit, offset=offset)
        approvals = [
            ApprovalResponse(
                id=a.get("id", ""),
                document_id=a.get("document_id", ""),
                approved=a.get("approved", False),
                reviewed_by=a.get("reviewed_by", ""),
                review_notes=a.get("review_notes"),
                has_edits=a.get("edited_content") is not None,
                reviewed_at=str(a.get("reviewed_at", "")),
            )
            for a in result["approvals"]
        ]
        return ApprovalListResponse(approvals=approvals, total=result["total"])
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ─── Integration Routes ──────────────────────────────────────

integration_router = APIRouter(prefix="/integrations", tags=["Integrations"])


@integration_router.post("", response_model=IntegrationResponse, summary="Create integration")
async def api_create_integration(data: IntegrationCreate):
    """Configure a new external integration (Jira, GitHub, Linear, etc.)."""
    try:
        integration = await create_integration(
            int_type=data.type.value,
            name=data.name,
            api_key=data.api_key,
            api_url=data.api_url,
            project_id=data.project_id,
            config=data.config,
        )
        return _integration_to_response(integration)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@integration_router.get("", response_model=IntegrationListResponse, summary="List integrations")
async def api_list_integrations(
    type: Optional[str] = Query(None),
    active_only: bool = Query(True),
):
    """List configured integrations (API keys are masked)."""
    try:
        result = await list_integrations(int_type=type, active_only=active_only)
        return IntegrationListResponse(
            integrations=[_integration_to_response(i) for i in result["integrations"]],
            total=result["total"],
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@integration_router.patch(
    "/{integration_id}",
    response_model=IntegrationResponse,
    summary="Update integration",
)
async def api_update_integration(integration_id: str, data: IntegrationUpdate):
    """Update an existing integration's configuration."""
    try:
        integration = await update_integration(
            integration_id=integration_id,
            name=data.name,
            api_key=data.api_key,
            api_url=data.api_url,
            project_id=data.project_id,
            config=data.config,
            is_active=data.is_active,
        )
        return _integration_to_response(integration)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@integration_router.delete("/{integration_id}", summary="Delete integration")
async def api_delete_integration(integration_id: str):
    """Delete an integration configuration."""
    try:
        await delete_integration(integration_id)
        return {"message": f"Integration {integration_id} deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Ticket Link Routes ──────────────────────────────────────

ticket_router = APIRouter(prefix="/ticket-links", tags=["Ticket Links"])


@ticket_router.post("", response_model=TicketLinkResponse, summary="Create ticket link")
async def api_create_ticket_link(data: TicketLinkCreate):
    """Record a link between a document and an external ticket."""
    try:
        link = await create_ticket_link(
            document_id=data.document_id,
            integration_id=data.integration_id,
            external_id=data.external_id,
            external_url=data.external_url,
            external_status=data.external_status,
        )
        return TicketLinkResponse(
            id=link.get("id", ""),
            document_id=link.get("document_id", ""),
            integration_id=link.get("integration_id", ""),
            external_id=link.get("external_id", ""),
            external_url=link.get("external_url"),
            external_status=link.get("external_status"),
            synced_at=str(link.get("synced_at", "")),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@ticket_router.get("", summary="List ticket links")
async def api_list_ticket_links(document_id: Optional[str] = Query(None)):
    """List ticket links, optionally filtered by document."""
    try:
        links = await list_ticket_links(document_id=document_id)
        return {"ticket_links": links, "total": len(links)}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ─── Pipeline Overview Route ─────────────────────────────────

pipeline_router = APIRouter(prefix="/pipeline", tags=["Pipeline"])


@pipeline_router.get("/status", response_model=PipelineStatus, summary="Pipeline overview")
async def api_pipeline_status():
    """
    Get a comprehensive overview of the entire pipeline state.
    
    Shows counts for feedback, embeddings, clusters by status,
    documents by type/status, approvals, and pending reviews.
    This powers the pipeline visualization on the frontend.
    """
    try:
        return await get_pipeline_status()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ─── Helper Functions ─────────────────────────────────────────

def _doc_to_response(doc: dict) -> DocumentResponse:
    return DocumentResponse(
        id=doc.get("id", ""),
        cluster_id=doc.get("cluster_id", ""),
        type=doc.get("type", ""),
        title=doc.get("title"),
        content=doc.get("content", {}),
        version=doc.get("version", 1),
        parent_id=doc.get("parent_id"),
        status=doc.get("status", "draft"),
        created_at=str(doc.get("created_at", "")),
        updated_at=str(doc.get("updated_at", "")),
    )


def _integration_to_response(integration: dict) -> IntegrationResponse:
    return IntegrationResponse(
        id=integration.get("id", ""),
        type=integration.get("type", ""),
        name=integration.get("name", ""),
        api_url=integration.get("api_url"),
        project_id=integration.get("project_id"),
        config=integration.get("config", {}),
        is_active=integration.get("is_active", True),
        created_at=str(integration.get("created_at", "")),
        updated_at=str(integration.get("updated_at", "")),
    )
