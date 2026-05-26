"""
ApeAI — Manual Feedback & CSV Upload Routes

Endpoints:
  POST /feedback/manual  — Submit single text feedback
  POST /feedback/csv     — Upload CSV file with multiple feedback items
"""

import csv
import io
import logging
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends

from backend.app.core.auth import get_current_user

from backend.app.models.feedback import (
    ManualFeedbackInput,
    FeedbackResponse,
    BatchFeedbackResponse,
)
from backend.app.services.normalize import normalize_manual, normalize_csv_row
from backend.app.services.save_feedback import save_feedback, save_feedback_batch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feedback", tags=["Manual Ingestion"])


@router.post(
    "/manual",
    response_model=FeedbackResponse,
    summary="Submit manual text feedback",
    description="Accepts a text feedback submission and saves it to the database.",
)
async def upload_manual_feedback(data: ManualFeedbackInput, user_id: str = Depends(get_current_user)):
    """
    Receive manual text feedback from the frontend.
    
    This is the simplest ingestion endpoint — a user pastes feedback
    text into a form, and it gets normalized and saved.
    """
    try:
        # Step 1: Normalize to unified format
        feedback_item = normalize_manual(data)
        feedback_item.user_id = user_id

        # Step 2: Save to database
        saved = await save_feedback(feedback_item)

        # Step 3: Return response
        return FeedbackResponse(
            id=saved.get("id", ""),
            source=saved.get("source", "manual"),
            author=saved.get("author", "anonymous"),
            content=saved.get("content", ""),
            timestamp=saved.get("timestamp", ""),
            message="Feedback saved successfully",
        )

    except RuntimeError as e:
        logger.error(f"Failed to save manual feedback: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in manual feedback: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/recent",
    summary="Get recent feedback",
    description="Fetch recent raw feedback items from the database.",
)
async def get_recent_feedback_list(limit: int = 50, user_id: str = Depends(get_current_user)):
    try:
        from backend.app.services.save_feedback import get_recent_feedbacks
        items = await get_recent_feedbacks(user_id=user_id, limit=limit)
        return {"feedbacks": items}
    except Exception as e:
        logger.error(f"Failed to fetch recent feedback: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post(
    "/csv",
    response_model=BatchFeedbackResponse,
    summary="Upload CSV file with feedback",
    description=(
        "Accepts a CSV file upload. "
        "Required column: 'content'. Optional column: 'author'. "
        "Any extra columns are stored in metadata."
    ),
)
async def upload_csv_feedback(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    """
    Upload a CSV file containing multiple feedback items.
    
    Expected CSV format:
        content,author
        "Dashboard is slow","alex"
        "Search is broken","jordan"
    
    The 'content' column is required. 'author' defaults to 'anonymous'.
    """
    # Validate file type
    if file.content_type not in ("text/csv", "application/vnd.ms-excel", "application/octet-stream"):
        if file.filename and not file.filename.endswith(".csv"):
            raise HTTPException(
                status_code=400,
                detail=f"Expected a CSV file, got: {file.content_type}"
            )

    try:
        # Read and decode the file
        raw_content = await file.read()
        try:
            text_content = raw_content.decode("utf-8")
        except UnicodeDecodeError:
            text_content = raw_content.decode("latin-1")

        # Parse CSV
        reader = csv.DictReader(io.StringIO(text_content))

        if "content" not in (reader.fieldnames or []):
            raise HTTPException(
                status_code=400,
                detail=(
                    "CSV must have a 'content' column. "
                    f"Found columns: {reader.fieldnames}"
                ),
            )

        # Normalize each row
        feedback_items = []
        errors = []

        for row_number, row in enumerate(reader, start=1):
            try:
                item = normalize_csv_row(dict(row), row_number)
                item.user_id = user_id
                feedback_items.append(item)
            except ValueError as e:
                errors.append({"row": row_number, "error": str(e)})
            except Exception as e:
                errors.append({"row": row_number, "error": f"Unexpected: {str(e)}"})

        if not feedback_items:
            raise HTTPException(
                status_code=400,
                detail="No valid rows found in CSV",
            )

        # Batch save all valid rows
        saved = await save_feedback_batch(feedback_items)

        return BatchFeedbackResponse(
            total_rows=len(feedback_items) + len(errors),
            saved=len(saved),
            errors=errors,
            message=f"Successfully saved {len(saved)} of {len(feedback_items) + len(errors)} rows",
        )

    except HTTPException:
        raise
    except RuntimeError as e:
        logger.error(f"Failed to save CSV feedback: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing CSV: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing CSV: {str(e)}")
