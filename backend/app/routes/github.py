"""
ApeAI — GitHub Webhook Route

Endpoint:
  POST /feedback/github  — Receives GitHub issue/comment webhook events

Security:
  Verifies HMAC-SHA256 signature using X-Hub-Signature-256 header.
  
Setup:
  1. Go to your GitHub repo → Settings → Webhooks → Add webhook
  2. Set Payload URL to: https://your-domain.com/feedback/github
  3. Set Content type to: application/json
  4. Set Secret to match your GITHUB_WEBHOOK_SECRET env var
  5. Select events: Issues, Issue comments
"""

import hashlib
import hmac
import logging

from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional

from backend.app.core.config import settings
from backend.app.models.feedback import FeedbackResponse
from backend.app.services.normalize import normalize_github
from backend.app.services.save_feedback import save_feedback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/feedback", tags=["GitHub Ingestion"])


def verify_github_signature(payload: bytes, signature_header: Optional[str]) -> None:
    """
    Verify the HMAC-SHA256 signature from GitHub.
    
    GitHub signs every webhook payload using the secret you configured.
    We compute the expected signature and compare using constant-time
    comparison to prevent timing attacks.
    """
    if not settings.github_webhook_secret:
        logger.warning("⚠️  GitHub webhook secret not configured — skipping verification")
        return

    if not signature_header:
        raise HTTPException(
            status_code=403,
            detail="Missing X-Hub-Signature-256 header"
        )

    if not signature_header.startswith("sha256="):
        raise HTTPException(
            status_code=403,
            detail="Invalid signature format — expected sha256=..."
        )

    expected_signature = "sha256=" + hmac.new(
        settings.github_webhook_secret.encode("utf-8"),
        msg=payload,
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, signature_header):
        raise HTTPException(
            status_code=403,
            detail="Invalid webhook signature"
        )


@router.post(
    "/github",
    response_model=FeedbackResponse,
    summary="Receive GitHub webhook events",
    description="Handles GitHub issue and issue comment webhook events.",
)
async def github_webhook(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
    x_github_event: Optional[str] = Header(None),
    x_github_delivery: Optional[str] = Header(None),
):
    """
    Receive and process GitHub webhook events.
    
    Supported events:
    - issues (action: opened) — New issue created
    - issue_comment (action: created) — New comment on an issue
    """
    # Step 1: Read raw body for signature verification
    raw_body = await request.body()

    # Step 2: Verify HMAC signature
    verify_github_signature(raw_body, x_hub_signature_256)

    # Step 3: Parse payload
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Step 4: Filter for supported events
    event_type = x_github_event or "unknown"
    action = payload.get("action", "")

    logger.info(f"📥 GitHub webhook: event={event_type}, action={action}, delivery={x_github_delivery}")

    # Only process issue opened and comment created events
    if event_type == "issues" and action == "opened":
        pass  # Process below
    elif event_type == "issue_comment" and action == "created":
        pass  # Process below
    elif event_type == "ping":
        # GitHub sends a ping when webhook is first created
        logger.info("🏓 GitHub webhook ping received — connection verified!")
        return FeedbackResponse(
            id="ping",
            source="github",
            author="github",
            content="Webhook ping successful",
            timestamp="",
            message="GitHub webhook connected successfully",
        )
    else:
        # Ignore other events (e.g., issue closed, edited, etc.)
        logger.info(f"⏭️  Ignoring GitHub event: {event_type}/{action}")
        return FeedbackResponse(
            id="ignored",
            source="github",
            author="system",
            content=f"Event {event_type}/{action} ignored",
            timestamp="",
            message=f"Event type '{event_type}/{action}' is not processed",
        )

    # Step 5: Normalize
    try:
        feedback_item = normalize_github(payload)
    except ValueError as e:
        logger.warning(f"Failed to normalize GitHub event: {e}")
        raise HTTPException(status_code=400, detail=str(e))

    # Step 6: Save
    try:
        saved = await save_feedback(feedback_item)
        return FeedbackResponse(
            id=saved.get("id", ""),
            source=saved.get("source", "github"),
            author=saved.get("author", "unknown"),
            content=saved.get("content", ""),
            timestamp=saved.get("timestamp", ""),
            message="GitHub feedback saved successfully",
        )
    except RuntimeError as e:
        logger.error(f"Failed to save GitHub feedback: {e}")
        raise HTTPException(status_code=503, detail=str(e))
