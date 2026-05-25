"""
ApeAI — Pydantic Models for Feedback

Defines all input schemas and the unified internal feedback format.
Every feedback source normalizes into FeedbackItem before storage.
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from uuid import UUID

from pydantic import BaseModel, Field


# ─── Input Schemas (one per source) ──────────────────────────


class ManualFeedbackInput(BaseModel):
    """Schema for manual text feedback submission."""
    content: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="The feedback text content"
    )
    author: str = Field(
        default="anonymous",
        max_length=200,
        description="Name or identifier of the person giving feedback"
    )


class CSVFeedbackRow(BaseModel):
    """Schema for a single row from CSV upload."""
    content: str = Field(..., min_length=1)
    author: str = Field(default="anonymous")
    source: str = Field(default="csv")





# ─── Unified Internal Format ────────────────────────────────


class FeedbackItem(BaseModel):
    """
    The unified internal feedback format.
    
    Every feedback source (manual, Slack, GitHub, email, etc.)
    normalizes into this exact structure before being saved.
    This is what makes the system modular — downstream layers
    only ever see FeedbackItem, never source-specific formats.
    """
    source: str = Field(
        ...,
        description="Origin of feedback: manual, csv"
    )
    author: str = Field(
        default="anonymous",
        description="Person who submitted the feedback"
    )
    content: str = Field(
        ...,
        min_length=1,
        description="The actual feedback text"
    )
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="When the feedback was created/received"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Source-specific extra data (channel, repo, email domain, etc.)"
    )

    def to_db_dict(self) -> Dict[str, Any]:
        """Convert to a dictionary suitable for Supabase insert."""
        return {
            "source": self.source,
            "author": self.author,
            "content": self.content,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata,
        }


# ─── Response Schemas ────────────────────────────────────────


class FeedbackResponse(BaseModel):
    """Response returned after successfully saving feedback."""
    id: str
    source: str
    author: str
    content: str
    timestamp: str
    message: str = "Feedback saved successfully"


class BatchFeedbackResponse(BaseModel):
    """Response returned after CSV batch upload."""
    total_rows: int
    saved: int
    errors: List[Dict[str, Any]] = []
    message: str = ""


class HealthResponse(BaseModel):
    """Response for health check endpoint."""
    status: str
    supabase: str
    version: str = "0.1.0"


class StatsResponse(BaseModel):
    """Response for feedback statistics endpoint."""
    total: int
    by_source: Dict[str, int] = {}
