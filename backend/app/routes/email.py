"""
ApeAI — Email Ingestion Route (Postmark Inbound)

Endpoint:
  POST /feedback/email  — Receives inbound email parsed by Postmark

Setup:
  1. Create a Postmark account: https://postmarkapp.com
  2. Set up an Inbound domain or use the sandbox address
  3. Configure the Inbound Webhook URL to: https://your-domain.com/feedback/email
  4. Postmark will parse incoming emails and POST them as JSON to your endpoint
  
No secret/HMAC needed — Postmark uses simple HTTP POST.
We validate the payload structure using Pydantic.
"""

import logging

from fastapi import APIRouter, Request, HTTPException

from backend.app.models.feedback import FeedbackResponse
from backend.app.services.normalize import normalize_email
from backend.app.services.save_feedback import save_feedback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feedback", tags=["Email Ingestion"])


@router.post(
    "/email",
    response_model=FeedbackResponse,
    summary="Receive Postmark inbound email",
    description=(
        "Accepts inbound email webhook payload from Postmark. "
        "The email subject and body are combined as feedback content."
    ),
)
async def email_webhook(request: Request):
    """
    Receive and process inbound emails forwarded by Postmark.
    
    Postmark parses the email and sends a structured JSON payload
    containing sender info, subject, body text, attachments, etc.
    
    We extract the key fields and normalize them into feedback.
    """
    # Step 1: Parse the payload
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    logger.info(
        f"📧 Email received: from={payload.get('From', 'unknown')}, "
        f"subject={payload.get('Subject', '(none)')}"
    )

    # Step 2: Basic validation
    # Postmark always sends 'From' and 'Subject' at minimum
    if not payload.get("From") and not payload.get("from"):
        raise HTTPException(
            status_code=400,
            detail="Invalid email payload — missing 'From' field"
        )

    text_body = payload.get("TextBody", payload.get("textBody", ""))
    subject = payload.get("Subject", payload.get("subject", ""))

    if not text_body and not subject:
        logger.warning("Received email with no subject and no body — skipping")
        raise HTTPException(
            status_code=400,
            detail="Email has no subject or body content"
        )

    # Step 3: Normalize
    try:
        feedback_item = normalize_email(payload)
    except ValueError as e:
        logger.warning(f"Failed to normalize email: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    # Step 4: Save
    try:
        saved = await save_feedback(feedback_item)
        return FeedbackResponse(
            id=saved.get("id", ""),
            source=saved.get("source", "email"),
            author=saved.get("author", "unknown"),
            content=saved.get("content", ""),
            timestamp=saved.get("timestamp", ""),
            message="Email feedback saved successfully",
        )
    except RuntimeError as e:
        logger.error(f"Failed to save email feedback: {e}")
        raise HTTPException(status_code=503, detail=str(e))
