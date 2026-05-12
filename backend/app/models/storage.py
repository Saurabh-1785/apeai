"""
ApeAI — Pydantic Models for Layer 2 Storage

Defines schemas for: Clusters, Documents, Approvals,
Integrations, Embeddings, and Ticket Links.

These models power the entire storage layer — every table
has input, response, and update schemas.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum

from pydantic import BaseModel, Field


# ─── Enums ───────────────────────────────────────────────────


class ClusterStatus(str, Enum):
    """Pipeline status for a feedback cluster."""
    NEW = "new"
    CLUSTERED = "clustered"
    BRD_GENERATED = "brd_generated"
    PRD_GENERATED = "prd_generated"
    STORIES_GENERATED = "stories_generated"
    TASKS_GENERATED = "tasks_generated"
    APPROVED = "approved"
    TICKETS_CREATED = "tickets_created"
    ARCHIVED = "archived"


class DocumentType(str, Enum):
    """Types of AI-generated documents."""
    BRD = "brd"
    PRD = "prd"
    EPIC = "epic"
    STORY = "story"
    TASK = "task"
    SPRINT_PLAN = "sprint_plan"


class DocumentStatus(str, Enum):
    """Review status for AI-generated documents."""
    DRAFT = "draft"
    REVIEW = "review"
    APPROVED = "approved"
    REJECTED = "rejected"
    PUBLISHED = "published"


class IntegrationType(str, Enum):
    """Supported external integration types."""
    JIRA = "jira"
    GITHUB = "github"
    LINEAR = "linear"
    NOTION = "notion"


# ─── Embedding Models ───────────────────────────────────────


class EmbeddingCreate(BaseModel):
    """Request to generate and store an embedding for a feedback item."""
    feedback_id: str = Field(..., description="UUID of the feedback item to embed")


class EmbeddingResponse(BaseModel):
    """Response after embedding is created."""
    id: str
    feedback_id: str
    model: str
    dimensions: int
    created_at: str
    message: str = "Embedding created successfully"


class EmbeddingBatchCreate(BaseModel):
    """Request to generate embeddings for multiple feedback items."""
    feedback_ids: List[str] = Field(
        default=None,
        description="List of feedback UUIDs to embed. If empty, embeds all un-embedded feedback."
    )


class EmbeddingBatchResponse(BaseModel):
    """Response after batch embedding creation."""
    total: int
    created: int
    skipped: int
    errors: List[Dict[str, Any]] = []
    message: str = ""


class SimilaritySearchRequest(BaseModel):
    """Request to find feedback items similar to given text or feedback_id."""
    text: Optional[str] = Field(
        None, description="Text to find similar feedback for"
    )
    feedback_id: Optional[str] = Field(
        None, description="Find items similar to this feedback"
    )
    match_count: int = Field(
        default=10, ge=1, le=100,
        description="Number of similar items to return"
    )
    match_threshold: float = Field(
        default=0.7, ge=0.0, le=1.0,
        description="Minimum similarity score (0-1)"
    )


class SimilarFeedback(BaseModel):
    """A single similar feedback item with its similarity score."""
    feedback_id: str
    content: str
    source: str
    similarity: float


class SimilaritySearchResponse(BaseModel):
    """Response from a similarity search."""
    query: str
    results: List[SimilarFeedback]
    count: int


# ─── Cluster Models ──────────────────────────────────────────


class ClusterCreate(BaseModel):
    """Create a new cluster (manually or from AI pipeline)."""
    title: str = Field(..., min_length=1, max_length=500)
    summary: Optional[str] = None
    feedback_ids: List[str] = Field(
        default_factory=list,
        description="Feedback IDs to include in this cluster"
    )
    confidence_score: float = Field(default=0.0, ge=0.0, le=100.0)


class ClusterUpdate(BaseModel):
    """Update an existing cluster."""
    title: Optional[str] = Field(None, max_length=500)
    summary: Optional[str] = None
    status: Optional[ClusterStatus] = None
    confidence_score: Optional[float] = Field(None, ge=0.0, le=100.0)


class ClusterAddFeedback(BaseModel):
    """Add feedback items to a cluster."""
    feedback_ids: List[str]
    similarity_scores: Optional[List[float]] = None


class ClusterResponse(BaseModel):
    """Full cluster response including feedback items."""
    id: str
    title: Optional[str]
    summary: Optional[str]
    feedback_count: int
    confidence_score: float
    status: str
    created_at: str
    updated_at: str
    feedback_items: List[Dict[str, Any]] = []


class ClusterListResponse(BaseModel):
    """List of clusters with pagination."""
    clusters: List[ClusterResponse]
    total: int


# ─── Document Models ─────────────────────────────────────────


class DocumentCreate(BaseModel):
    """Create a new AI-generated document."""
    cluster_id: str
    type: DocumentType
    title: Optional[str] = None
    content: Dict[str, Any] = Field(default_factory=dict)
    parent_id: Optional[str] = None


class DocumentUpdate(BaseModel):
    """Update an existing document (human edits)."""
    title: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    status: Optional[DocumentStatus] = None


class DocumentResponse(BaseModel):
    """Full document response."""
    id: str
    cluster_id: str
    type: str
    title: Optional[str]
    content: Dict[str, Any]
    version: int
    parent_id: Optional[str]
    status: str
    created_at: str
    updated_at: str


class DocumentListResponse(BaseModel):
    """List of documents for a cluster."""
    documents: List[DocumentResponse]
    total: int


# ─── Approval Models ─────────────────────────────────────────


class ApprovalCreate(BaseModel):
    """Submit an approval/rejection for a document."""
    document_id: str
    approved: bool
    reviewed_by: str = Field(..., min_length=1)
    review_notes: Optional[str] = None
    edited_content: Optional[Dict[str, Any]] = Field(
        None,
        description="If the reviewer edited the content, include the edited version here"
    )


class ApprovalResponse(BaseModel):
    """Response after approval/rejection."""
    id: str
    document_id: str
    approved: bool
    reviewed_by: str
    review_notes: Optional[str]
    has_edits: bool
    reviewed_at: str
    message: str = ""


class ApprovalListResponse(BaseModel):
    """List of approvals for a document."""
    approvals: List[ApprovalResponse]
    total: int


# ─── Integration Models ──────────────────────────────────────


class IntegrationCreate(BaseModel):
    """Configure a new external integration."""
    type: IntegrationType
    name: str = Field(..., min_length=1, max_length=200)
    api_key: str = Field(..., min_length=1)
    api_url: Optional[str] = None
    project_id: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)


class IntegrationUpdate(BaseModel):
    """Update an existing integration."""
    name: Optional[str] = Field(None, max_length=200)
    api_key: Optional[str] = None
    api_url: Optional[str] = None
    project_id: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class IntegrationResponse(BaseModel):
    """Integration response (API key masked for security)."""
    id: str
    type: str
    name: str
    api_url: Optional[str]
    project_id: Optional[str]
    config: Dict[str, Any]
    is_active: bool
    created_at: str
    updated_at: str
    # Note: api_key is intentionally NOT returned


class IntegrationListResponse(BaseModel):
    """List of configured integrations."""
    integrations: List[IntegrationResponse]
    total: int


# ─── Ticket Link Models ──────────────────────────────────────


class TicketLinkCreate(BaseModel):
    """Record a link between a document and an external ticket."""
    document_id: str
    integration_id: str
    external_id: str
    external_url: Optional[str] = None
    external_status: Optional[str] = None


class TicketLinkResponse(BaseModel):
    """Ticket link response."""
    id: str
    document_id: str
    integration_id: str
    external_id: str
    external_url: Optional[str]
    external_status: Optional[str]
    synced_at: str


# ─── Pipeline Overview Model ─────────────────────────────────


class PipelineStatus(BaseModel):
    """Overview of the entire pipeline state."""
    total_feedback: int
    total_embedded: int
    total_unembedded: int
    total_clusters: int
    clusters_by_status: Dict[str, int]
    total_documents: int
    documents_by_type: Dict[str, int]
    documents_by_status: Dict[str, int]
    total_approvals: int
    pending_reviews: int
