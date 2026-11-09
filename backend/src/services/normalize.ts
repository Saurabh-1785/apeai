/**
 * ApeAI — Normalization Engine (Layer 1)
 *
 * Converts source-specific data into the unified FeedbackItem format.
 * Mirrors Python services/normalize.py exactly.
 *
 * === Multi-Source Normalizers ===
 * Each normalizer preserves source-specific metadata so that downstream
 * layers (clustering, summarization, etc.) can leverage platform context
 * without losing fidelity.
 */

import {
  FeedbackItem,
  ManualFeedbackInput,
  AppStoreReviewInput,
  RedditPostInput,
  SupportTicketWebhookInput,
  TranscriptWebhookInput,
  ObservabilityAlertInput,
} from '../types/feedback';

const MAX_CSV_CONTENT_LENGTH = 50_000;

// ─── Existing Normalizers ─────────────────────────────────────

export function normalizeManual(data: ManualFeedbackInput): FeedbackItem {
  return {
    source: 'manual',
    author: (data.author || 'anonymous').trim() || 'anonymous',
    content: data.content.trim(),
    timestamp: new Date().toISOString(),
    metadata: {
      submission_type: 'text_paste',
    },
  };
}

export function normalizeCsvRow(
  row: Record<string, string | undefined>,
  rowNumber: number,
): FeedbackItem {
  // Header names are matched case-insensitively.
  const get = (...names: string[]): string | undefined => {
    for (const [key, value] of Object.entries(row)) {
      if (names.includes(key.trim().toLowerCase())) return value;
    }
    return undefined;
  };

  const content = (get('content') ?? '').trim();
  if (!content) throw new Error(`Row ${rowNumber}: 'content' column is empty or missing`);
  if (content.length > MAX_CSV_CONTENT_LENGTH) {
    throw new Error(`Row ${rowNumber}: 'content' exceeds ${MAX_CSV_CONTENT_LENGTH} characters`);
  }

  const author = (get('author') ?? '').trim() || 'anonymous';

  // Use the row's own date if it parses; otherwise the upload time.
  const rawDate = (get('date', 'timestamp', 'created_at') ?? '').trim();
  const parsedDate = rawDate ? new Date(rawDate) : null;
  const timestamp =
    parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();

  // Keep the spreadsheet's own source label (e.g. "support_ticket") in metadata;
  // the feedback `source` stays 'csv' so the channel is always known.
  const originalSource = (get('source') ?? '').trim();

  const known = new Set(['content', 'author', 'source', 'date', 'timestamp', 'created_at']);
  const extraData: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!known.has(key.trim().toLowerCase()) && value) extraData[key] = value;
  }

  return {
    source: 'csv',
    author,
    content,
    timestamp,
    metadata: {
      ...extraData,
      submission_type: 'csv_upload',
      row_number: rowNumber,
      ...(originalSource ? { original_source: originalSource } : {}),
      ...(rawDate ? { original_date: rawDate } : {}),
    },
  };
}

// ─── App Store / Google Play Review Normalizer ────────────────

/**
 * Normalizes an App Store (iOS) or Google Play (Android) review.
 * Preserves: rating, app_version, platform, country.
 * Note: All reviews are ingested regardless of star rating.
 * Filtering is deferred to Layer 3.
 */
export function normalizeAppStoreReview(data: AppStoreReviewInput): FeedbackItem {
  const source = data.platform === 'android' ? 'google_play' : 'appstore';
  const titlePrefix = data.title ? `${data.title}: ` : '';

  return {
    source,
    author: (data.author || 'anonymous').trim() || 'anonymous',
    content: `${titlePrefix}${data.content ?? ''}`.trim(),
    timestamp: data.review_date || new Date().toISOString(),
    external_id: data.review_id,
    metadata: {
      submission_type: 'app_review',
      platform: data.platform,
      rating: data.rating,
      app_version: data.app_version || null,
      country: data.country || null,
      review_id: data.review_id,
    },
  };
}

// ─── Reddit Post/Comment Normalizer ──────────────────────────

/**
 * Normalizes a Reddit post or comment.
 * Preserves: subreddit, upvotes, comments_count, post_url.
 */
export function normalizeRedditPost(data: RedditPostInput): FeedbackItem {
  // Combine title + body for richer context (either may be absent).
  const title = (data.title ?? '').trim();
  const body = (data.content ?? '').trim();
  const content = title && body ? `${title}\n\n${body}` : title || body;

  return {
    source: 'reddit',
    author: (data.author || 'anonymous').trim() || 'anonymous',
    content,
    timestamp: data.created_utc
      ? new Date(data.created_utc * 1000).toISOString()
      : new Date().toISOString(),
    external_id: data.post_id,
    metadata: {
      submission_type: 'reddit_post',
      subreddit: data.subreddit,
      upvotes: data.upvotes,
      comments_count: data.comments_count,
      post_url: data.post_url,
      post_id: data.post_id,
    },
  };
}

// ─── Intercom / Zendesk Support Ticket Normalizer ────────────

/**
 * Normalizes a support ticket from Intercom or Zendesk.
 * Preserves: customer_tier, ticket_id, tags.
 */
export function normalizeSupportTicket(data: SupportTicketWebhookInput): FeedbackItem {
  const source = data.platform === 'zendesk' ? 'zendesk' : 'intercom';
  const subjectPrefix = data.subject ? `${data.subject}: ` : '';

  return {
    source,
    author: (data.author || 'anonymous').trim() || 'anonymous',
    content: `${subjectPrefix}${data.content ?? ''}`.trim(),
    timestamp: data.created_at || new Date().toISOString(),
    external_id: data.ticket_id,
    metadata: {
      submission_type: 'support_ticket',
      platform: data.platform,
      ticket_id: data.ticket_id,
      customer_email: data.customer_email || null,
      customer_tier: data.customer_tier || null,
      tags: data.tags || [],
    },
  };
}

// ─── Fireflies / Zoom Meeting Transcript Normalizer ──────────

/**
 * Normalizes a meeting transcript from Fireflies.ai or Zoom.
 * Preserves: meeting_title, participants, duration.
 */
export function normalizeTranscript(data: TranscriptWebhookInput): FeedbackItem {
  const participants = Array.isArray(data.participants)
    ? data.participants.filter((p) => typeof p === 'string' && p.trim())
    : [];
  const participantsLabel = participants.length > 0 ? participants.join(', ') : 'unknown';

  return {
    source: 'transcript',
    author: participantsLabel,
    content: (data.content ?? '').trim(),
    timestamp: data.meeting_date || new Date().toISOString(),
    external_id: data.transcript_id,
    metadata: {
      submission_type: 'meeting_transcript',
      platform: data.platform,
      meeting_title: data.meeting_title,
      participants,
      duration_seconds: data.duration_seconds || null,
      transcript_id: data.transcript_id,
    },
  };
}

// ─── Sentry / PostHog Observability Alert Normalizer ─────────

/**
 * Normalizes an observability alert from Sentry or PostHog.
 * Preserves: error_count, impacted_users, stack_trace.
 */
export function normalizeObservabilityAlert(data: ObservabilityAlertInput): FeedbackItem {
  const source = data.platform === 'posthog' ? 'posthog' : 'sentry';
  // Include title + content + truncated stack trace for context
  let fullContent = [data.title, data.content].filter(Boolean).join(': ');
  if (data.stack_trace) {
    // Keep first 2000 chars of stack trace
    const truncatedTrace = data.stack_trace.slice(0, 2000);
    fullContent += `\n\nStack trace:\n${truncatedTrace}`;
  }

  return {
    source,
    author: `${source}-bot`,
    content: fullContent.trim(),
    timestamp: data.last_seen || data.first_seen || new Date().toISOString(),
    external_id: data.alert_id,
    metadata: {
      submission_type: 'observability_alert',
      platform: data.platform,
      alert_id: data.alert_id,
      level: data.level || 'error',
      error_count: data.error_count || null,
      impacted_users: data.impacted_users || null,
      has_stack_trace: Boolean(data.stack_trace),
      project: data.project || null,
      first_seen: data.first_seen || null,
      last_seen: data.last_seen || null,
    },
  };
}
