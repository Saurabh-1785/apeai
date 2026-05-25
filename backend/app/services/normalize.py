"""
ApeAI — Normalization Engine

Converts source-specific data into the unified FeedbackItem format.
Each source has its own normalize function. Adding a new source
means writing one new function here — nothing else changes.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any

from backend.app.models.feedback import (
    FeedbackItem,
    ManualFeedbackInput,
)

logger = logging.getLogger(__name__)


def normalize_manual(data: ManualFeedbackInput) -> FeedbackItem:
    """
    Normalize manually submitted text feedback.
    
    Input: { content: "...", author: "..." }
    Output: FeedbackItem with source="manual"
    """
    return FeedbackItem(
        source="manual",
        author=data.author or "anonymous",
        content=data.content.strip(),
        timestamp=datetime.now(timezone.utc),
        metadata={
            "submission_type": "text_paste",
        },
    )


def normalize_csv_row(row: Dict[str, Any], row_number: int) -> FeedbackItem:
    """
    Normalize a single row from a CSV upload.
    
    Expected CSV columns: content (required), author (optional)
    Extra columns are stored in metadata.
    """
    content = row.get("content", "").strip()
    if not content:
        raise ValueError(f"Row {row_number}: 'content' column is empty or missing")

    author = row.get("author", "anonymous").strip() or "anonymous"

    # Store any extra columns in metadata
    known_columns = {"content", "author", "source"}
    extra_data = {k: v for k, v in row.items() if k not in known_columns and v}

    return FeedbackItem(
        source="csv",
        author=author,
        content=content,
        timestamp=datetime.now(timezone.utc),
        metadata={
            "submission_type": "csv_upload",
            "row_number": row_number,
            **extra_data,
        },
    )



