/**
 * ApeAI — Feedback Storage Service
 *
 * Handles saving normalized FeedbackItems to Supabase.
 * Mirrors Python services/save_feedback.py.
 */

import { getSupabaseClient, chunk, fetchAllRows } from '../db/supabase';
import { FeedbackItem, feedbackItemToDbDict } from '../types/feedback';

type DbRow = Record<string, unknown>;

/**
 * Returns the subset of `items` that are not already stored.
 * An item is a duplicate when another row has the same
 * (user_id, source, external_id). Items without an external_id are never
 * treated as duplicates (manual/CSV feedback has no stable source id).
 * Also removes duplicates *within* the batch.
 */
async function dropExistingItems(items: FeedbackItem[]): Promise<{ fresh: FeedbackItem[]; existing: DbRow[] }> {
  const client = getSupabaseClient();
  const seen = new Set<string>();
  const keyOf = (userId: string | undefined | null, source: string, externalId: string) =>
    `${userId ?? ''}|${source}|${externalId}`;

  // Group items with external ids by (user, source) so each group is one query.
  const groups = new Map<string, { userId?: string; source: string; ids: string[] }>();
  for (const item of items) {
    if (!item.external_id) continue;
    const g = `${item.userId ?? ''}|${item.source}`;
    if (!groups.has(g)) groups.set(g, { userId: item.userId, source: item.source, ids: [] });
    groups.get(g)!.ids.push(item.external_id);
  }

  const existingKeys = new Set<string>();
  const existing: DbRow[] = [];
  for (const { userId, source, ids } of groups.values()) {
    for (const part of chunk([...new Set(ids)])) {
      let q = client.from('feedback').select('*').eq('source', source).in('external_id', part);
      q = userId ? q.eq('user_id', userId) : q.is('user_id', null);
      const { data, error } = await q;
      if (error) throw new Error(`Failed to check for duplicate feedback: ${error.message}`);
      for (const row of (data ?? []) as DbRow[]) {
        existingKeys.add(keyOf(row['user_id'] as string | null, source, row['external_id'] as string));
        existing.push(row);
      }
    }
  }

  const fresh: FeedbackItem[] = [];
  for (const item of items) {
    if (item.external_id) {
      const key = keyOf(item.userId, item.source, item.external_id);
      if (existingKeys.has(key) || seen.has(key)) continue;
      seen.add(key);
    }
    fresh.push(item);
  }
  return { fresh, existing };
}

/**
 * Saves a single item. If an identical (user, source, external_id) row
 * already exists, that row is returned with `duplicate: true` instead.
 */
export async function saveFeedback(item: FeedbackItem): Promise<DbRow> {
  const client = getSupabaseClient();

  const { fresh, existing } = await dropExistingItems([item]);
  if (fresh.length === 0) {
    console.info(`⏭️  Duplicate feedback skipped: source=${item.source}, external_id=${item.external_id}`);
    return { ...(existing[0] ?? {}), duplicate: true };
  }

  console.info(`💾 Saving feedback: source=${item.source}, content_length=${item.content.length} chars`);

  const { data, error } = await client.from('feedback').insert(feedbackItemToDbDict(item)).select().single();
  if (error) {
    console.error('❌ Failed to save feedback:', error);
    throw new Error(`Failed to save feedback: ${error.message}`);
  }
  return data as DbRow;
}

/** Saves a batch, skipping duplicates. Returns saved rows and the skipped count. */
export async function saveFeedbackBatchDeduped(
  items: FeedbackItem[],
): Promise<{ saved: DbRow[]; skipped: number }> {
  if (items.length === 0) return { saved: [], skipped: 0 };

  const client = getSupabaseClient();
  const { fresh } = await dropExistingItems(items);
  const skipped = items.length - fresh.length;
  if (fresh.length === 0) return { saved: [], skipped };

  console.info(`💾 Batch saving ${fresh.length} feedback items (${skipped} duplicates skipped)`);

  const { data, error } = await client.from('feedback').insert(fresh.map(feedbackItemToDbDict)).select();
  if (error) {
    console.error('❌ Batch save failed:', error);
    throw new Error(`Batch save failed: ${error.message}`);
  }
  return { saved: (data ?? []) as DbRow[], skipped };
}

/** Backwards-compatible wrapper: saves a batch (deduplicated) and returns saved rows. */
export async function saveFeedbackBatch(items: FeedbackItem[]): Promise<DbRow[]> {
  return (await saveFeedbackBatchDeduped(items)).saved;
}

export async function getFeedbackStats(
  userId: string,
): Promise<{ total: number; by_source: Record<string, number> }> {
  const client = getSupabaseClient();
  const rows = await fetchAllRows<DbRow>((from, to) =>
    client.from('feedback').select('source').eq('user_id', userId).range(from, to),
  );

  const bySource: Record<string, number> = {};
  for (const row of rows) {
    const src = (row['source'] as string) ?? 'unknown';
    bySource[src] = (bySource[src] ?? 0) + 1;
  }
  return { total: rows.length, by_source: bySource };
}

export async function getRecentFeedbacks(
  userId: string,
  limit = 50,
): Promise<Array<Record<string, unknown>>> {
  const client = getSupabaseClient();

  const query = client
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .eq('user_id', userId)
    .limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch recent feedback: ${error.message}`);

  return (data ?? []) as Array<Record<string, unknown>>;
}
