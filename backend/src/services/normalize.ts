/**
 * ApeAI — Normalization Engine
 *
 * Converts source-specific data into the unified FeedbackItem format.
 * Mirrors Python services/normalize.py exactly.
 */

import { FeedbackItem, ManualFeedbackInput } from '../types/feedback';

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
  const content = (row['content'] ?? '').trim();
  if (!content) {
    throw new Error(`Row ${rowNumber}: 'content' column is empty or missing`);
  }

  const author = (row['author'] ?? 'anonymous').trim() || 'anonymous';

  // Store any extra columns in metadata
  const knownColumns = new Set(['content', 'author', 'source']);
  const extraData: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!knownColumns.has(key) && value) {
      extraData[key] = value;
    }
  }

  return {
    source: 'csv',
    author,
    content,
    timestamp: new Date().toISOString(),
    metadata: {
      submission_type: 'csv_upload',
      row_number: rowNumber,
      ...extraData,
    },
  };
}
