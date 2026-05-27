/**
 * ApeAI — TypeScript Types for Feedback
 *
 * Mirrors Python Pydantic models in models/feedback.py.
 * Every feedback source normalizes into FeedbackItem before storage.
 */

export interface ManualFeedbackInput {
  content: string;
  author?: string;
}

export interface CSVFeedbackRow {
  content: string;
  author?: string;
  source?: string;
  [key: string]: string | undefined;
}

export interface FeedbackItem {
  userId?: string;
  source: string;
  author: string;
  content: string;
  timestamp: string; // ISO string
  metadata: Record<string, unknown>;
}

export function feedbackItemToDbDict(item: FeedbackItem): Record<string, unknown> {
  const data: Record<string, unknown> = {
    source: item.source,
    author: item.author,
    content: item.content,
    timestamp: item.timestamp,
    metadata: item.metadata,
  };
  if (item.userId) {
    data['user_id'] = item.userId;
  }
  return data;
}

// ─── Response Types ───────────────────────────────────────────

export interface FeedbackResponse {
  id: string;
  source: string;
  author: string;
  content: string;
  timestamp: string;
  message: string;
}

export interface BatchFeedbackResponse {
  total_rows: number;
  saved: number;
  errors: Array<Record<string, unknown>>;
  message: string;
}

export interface HealthResponse {
  status: string;
  supabase: string;
  version: string;
}

export interface StatsResponse {
  total: number;
  by_source: Record<string, number>;
}
