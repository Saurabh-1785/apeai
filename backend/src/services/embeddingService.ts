/**
 * ApeAI — Embedding Service (Google Gemini Edition)
 *
 * Generates vector embeddings with Gemini and stores them in Supabase
 * pgvector for similarity search. All operations are scoped to a user.
 *
 * Embeddings produced by a different model than EMBEDDING_MODEL are
 * considered stale (vectors from different models are not comparable)
 * and are regenerated in place by createEmbeddingsBatch.
 */

import { getSupabaseClient, fetchAllRows, chunk } from '../db/supabase';
import { geminiClient, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '../ai/geminiClient';
import { NotFoundError, BadRequestError } from '../utils/errors';

type DbRow = Record<string, unknown>;

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    return await geminiClient.embedText(text);
  } catch (err) {
    console.error('❌ Failed to generate Gemini embedding:', err);
    throw new Error(`Gemini embedding generation failed: ${err instanceof Error ? err.message : err}`);
  }
}

export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Creates (or refreshes, if stale) the embedding for one feedback item.
 * Returns the stored row plus `skipped: true` if it was already current.
 */
export async function createEmbeddingForFeedback(
  feedbackId: string,
  userId?: string,
): Promise<DbRow & { skipped?: boolean }> {
  const db = getSupabaseClient();

  let feedbackQuery = db.from('feedback').select('id, content').eq('id', feedbackId);
  if (userId) feedbackQuery = feedbackQuery.eq('user_id', userId);
  const { data: feedbackData } = await feedbackQuery.maybeSingle();
  if (!feedbackData) throw new NotFoundError(`Feedback not found: ${feedbackId}`);

  const { data: existingRows } = await db
    .from('embeddings')
    .select('id, feedback_id, model, created_at')
    .eq('feedback_id', feedbackId);
  const existing = (existingRows ?? []) as DbRow[];

  const current = existing.find((e) => e['model'] === EMBEDDING_MODEL);
  if (current) return { ...current, skipped: true };

  const content = (feedbackData as DbRow)['content'] as string;
  const embedding = await generateEmbedding(content);
  const row = {
    feedback_id: feedbackId,
    embedding: toVectorLiteral(embedding),
    model: EMBEDDING_MODEL,
  };

  if (existing.length > 0) {
    // Stale embedding from an older model — replace it in place.
    const { data, error } = await db
      .from('embeddings')
      .update(row)
      .eq('feedback_id', feedbackId)
      .select('id, feedback_id, model, created_at')
      .limit(1);
    if (error || !data || data.length === 0) {
      throw new Error(`Failed to refresh embedding for ${feedbackId}: ${error?.message}`);
    }
    return data[0] as DbRow;
  }

  const { data, error } = await db
    .from('embeddings')
    .insert(row)
    .select('id, feedback_id, model, created_at')
    .single();
  if (error || !data) throw new Error(`Failed to store embedding for ${feedbackId}: ${error?.message}`);
  return data as DbRow;
}

/** Feedback ids (for the user) that have no embedding from the current model. */
export async function findFeedbackNeedingEmbedding(userId: string): Promise<string[]> {
  const db = getSupabaseClient();

  const feedback = await fetchAllRows<DbRow>((from, to) =>
    db.from('feedback').select('id').eq('user_id', userId).order('id').range(from, to),
  );
  const ids = feedback.map((f) => f['id'] as string);

  const current = new Set<string>();
  for (const part of chunk(ids)) {
    const { data, error } = await db
      .from('embeddings')
      .select('feedback_id')
      .eq('model', EMBEDDING_MODEL)
      .in('feedback_id', part);
    if (error) throw new Error(`Failed to read embeddings: ${error.message}`);
    for (const e of (data ?? []) as DbRow[]) current.add(e['feedback_id'] as string);
  }

  return ids.filter((id) => !current.has(id));
}

export async function createEmbeddingsBatch(
  userId: string,
  feedbackIds?: string[],
): Promise<{ total: number; created: number; skipped: number; errors: DbRow[] }> {
  const ids = feedbackIds ?? (await findFeedbackNeedingEmbedding(userId));
  if (ids.length === 0) return { total: 0, created: 0, skipped: 0, errors: [] };

  let created = 0;
  let skipped = 0;
  const errors: DbRow[] = [];

  console.info(`🧠 Batch embedding (${EMBEDDING_MODEL}): ${ids.length} items to process`);

  for (const fid of ids) {
    try {
      const result = await createEmbeddingForFeedback(fid, userId);
      if (result.skipped) skipped++;
      else created++;
    } catch (err) {
      console.error(`Error embedding ${fid}:`, err);
      errors.push({ feedback_id: fid, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { total: ids.length, created, skipped, errors };
}

export async function searchSimilar(params: {
  userId: string;
  text?: string;
  feedbackId?: string;
  matchCount?: number;
  matchThreshold?: number;
}): Promise<DbRow[]> {
  const db = getSupabaseClient();
  const { userId, text, feedbackId, matchCount = 10, matchThreshold = 0.5 } = params;

  let vectorStr: string;

  if (text) {
    vectorStr = toVectorLiteral(await generateEmbedding(text));
  } else if (feedbackId) {
    const { data: owned } = await db
      .from('feedback')
      .select('id')
      .eq('id', feedbackId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!owned) throw new NotFoundError(`Feedback not found: ${feedbackId}`);

    const { data } = await db
      .from('embeddings')
      .select('embedding')
      .eq('feedback_id', feedbackId)
      .eq('model', EMBEDDING_MODEL)
      .maybeSingle();
    if (!data) throw new NotFoundError(`No current embedding found for feedback ${feedbackId}`);
    vectorStr = (data as DbRow)['embedding'] as string;
  } else {
    throw new BadRequestError("Either 'text' or 'feedback_id' must be provided");
  }

  const { data: results, error } = await db.rpc('match_feedback', {
    query_embedding: vectorStr,
    match_count: matchCount,
    match_threshold: matchThreshold,
    filter_user_id: userId,
    filter_model: EMBEDDING_MODEL,
  });

  if (error) throw new Error(`Similarity search failed: ${error.message}`);
  return ((results ?? []) as DbRow[]).filter((r) => r['feedback_id'] !== feedbackId);
}

export async function getEmbeddingStats(userId: string): Promise<DbRow> {
  const db = getSupabaseClient();

  const { count: feedbackCount } = await db
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const pending = await findFeedbackNeedingEmbedding(userId);
  const fc = feedbackCount ?? 0;

  return {
    total_feedback: fc,
    total_embedded: fc - pending.length,
    total_unembedded: pending.length,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  };
}
