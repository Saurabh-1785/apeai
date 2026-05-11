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


def normalize_slack(event: Dict[str, Any]) -> FeedbackItem:
    """
    Normalize a Slack message event into feedback.
    
    Slack event payload structure:
    {
        "text": "Dashboard is slow",
        "user": "U12345",
        "channel": "C67890",
        "ts": "1620000000.000000"
    }
    """
    text = event.get("text", "").strip()
    if not text:
        raise ValueError("Slack message has no text content")

    user_id = event.get("user", "unknown")
    channel = event.get("channel", "unknown")
    thread_ts = event.get("thread_ts")
    ts = event.get("ts", "")

    # Convert Slack timestamp to datetime
    try:
        timestamp = datetime.fromtimestamp(float(ts), tz=timezone.utc)
    except (ValueError, TypeError):
        timestamp = datetime.now(timezone.utc)

    return FeedbackItem(
        source="slack",
        author=user_id,
        content=text,
        timestamp=timestamp,
        metadata={
            "channel": channel,
            "thread_ts": thread_ts,
            "slack_ts": ts,
            "is_thread_reply": thread_ts is not None,
        },
    )


def normalize_github(payload: Dict[str, Any]) -> FeedbackItem:
    """
    Normalize a GitHub issue webhook event into feedback.
    
    Handles two types:
    1. New issue created (action: "opened")
    2. Issue comment created (action: "created")
    """
    action = payload.get("action", "")
    
    # Handle issue opened
    if "issue" in payload and action == "opened":
        issue = payload["issue"]
        title = issue.get("title", "")
        body = issue.get("body", "") or ""
        content = f"{title}\n{body}".strip()
        author = issue.get("user", {}).get("login", "unknown")
        repo = payload.get("repository", {}).get("full_name", "unknown")
        issue_number = issue.get("number")
        issue_url = issue.get("html_url", "")
        labels = [label.get("name", "") for label in issue.get("labels", [])]

        return FeedbackItem(
            source="github",
            author=author,
            content=content,
            timestamp=datetime.now(timezone.utc),
            metadata={
                "repo": repo,
                "issue_number": issue_number,
                "issue_url": issue_url,
                "labels": labels,
                "event_type": "issue_opened",
            },
        )

    # Handle issue comment created
    if "comment" in payload and action == "created":
        comment = payload["comment"]
        body = comment.get("body", "").strip()
        author = comment.get("user", {}).get("login", "unknown")
        repo = payload.get("repository", {}).get("full_name", "unknown")
        issue = payload.get("issue", {})
        issue_number = issue.get("number")
        issue_title = issue.get("title", "")

        return FeedbackItem(
            source="github",
            author=author,
            content=f"[Comment on #{issue_number}: {issue_title}] {body}",
            timestamp=datetime.now(timezone.utc),
            metadata={
                "repo": repo,
                "issue_number": issue_number,
                "comment_url": comment.get("html_url", ""),
                "event_type": "issue_comment",
            },
        )

    raise ValueError(
        f"Unsupported GitHub event: action={action}, "
        f"has_issue={'issue' in payload}, has_comment={'comment' in payload}"
    )


def normalize_email(payload: Dict[str, Any]) -> FeedbackItem:
    """
    Normalize a Postmark inbound email into feedback.
    
    Postmark payload fields used:
    - From: sender email address
    - FromName: sender display name
    - Subject: email subject line
    - TextBody: plain text content of the email
    """
    sender = payload.get("From", payload.get("from", "unknown"))
    sender_name = payload.get("FromName", payload.get("fromName", ""))
    subject = payload.get("Subject", payload.get("subject", "(no subject)"))
    text_body = payload.get("TextBody", payload.get("textBody", ""))

    # Combine subject and body for the content field
    parts = []
    if subject and subject != "(no subject)":
        parts.append(subject)
    if text_body:
        parts.append(text_body.strip())

    content = "\n".join(parts) if parts else "(empty email)"

    # Use sender name if available, otherwise email address
    author = sender_name if sender_name else sender

    return FeedbackItem(
        source="email",
        author=author,
        content=content,
        timestamp=datetime.now(timezone.utc),
        metadata={
            "sender_email": sender,
            "sender_name": sender_name,
            "subject": subject,
            "mailbox_hash": payload.get("MailboxHash", ""),
        },
    )
