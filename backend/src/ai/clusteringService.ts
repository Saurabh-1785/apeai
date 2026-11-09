/**
 * ApeAI — AI Clustering Service
 *
 * Groups a user's unclustered feedback using pgvector similarity.
 *
 * For each unclustered item (using its *stored* embedding):
 *   1. Find the most similar feedback of the same user (match_feedback RPC).
 *   2. Walk matches from most to least similar; join the cluster of the
 *      first match that already belongs to one, recording that match's
 *      similarity as the link score.
 *   3. Otherwise start a new cluster.
 *
 * Items that could not be embedded (e.g. Gemini unavailable) fall back to
 * keyword grouping so they are not silently dropped.
 */

import { getSupabaseClient, fetchAllRows, chunk } from '../db/supabase';
import { createEmbeddingsBatch } from '../services/embeddingService';
import { createCluster, addFeedbackToCluster } from '../services/clusterService';
import { EMBEDDING_MODEL } from './geminiClient';

type DbRow = Record<string, unknown>;

const THRESHOLDS: Record<string, number> = {
  bug: 0.9,
  feature_request: 0.85,
  usability: 0.85,
  default: 0.8,
};

const MATCH_COUNT = 10;

// Whole-word matching so "address" ≠ "add", "debug" ≠ "bug", "news" ≠ "new".
const BUG_RE = /\b(bugs?|errors?|fail(s|ed|ing|ure)?|broken|crash(es|ed|ing)?|wrong)\b/i;
const FEATURE_RE = /\b(feature|add|new|want|wish|should|could|request|please add)\b/i;
const USABILITY_RE = /\b(confusing|hard to|difficult|unclear|ux|ui|intuitive|can't find|cannot find)\b/i;

export function classifyFeedback(content: string): string {
  if (BUG_RE.test(content)) return 'bug';
  if (USABILITY_RE.test(content)) return 'usability';
  if (FEATURE_RE.test(content)) return 'feature_request';
  return 'default';
}

function labelFor(fbType: string): string {
  return fbType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

/** Returns feedback ids of the given set that already belong to some cluster. */
async function findLinkedFeedback(feedbackIds: string[]): Promise<Map<string, string>> {
  const db = getSupabaseClient();
  const linked = new Map<string, string>();
  for (const part of chunk(feedbackIds)) {
    const rows = await fetchAllRows<DbRow>((from, to) =>
      db
        .from('cluster_feedback')
        .select('feedback_id, cluster_id')
        .in('feedback_id', part)
        .range(from, to),
    );
    for (const r of rows) {
      if (!linked.has(r['feedback_id'] as string)) {
        linked.set(r['feedback_id'] as string, r['cluster_id'] as string);
      }
    }
  }
  return linked;
}

export async function clusterUnprocessedFeedback(userId: string): Promise<DbRow> {
  const db = getSupabaseClient();

  // Step 1: Ensure the user's feedback has current-model embeddings.
  let embedErrors = 0;
  try {
    const embedResult = await createEmbeddingsBatch(userId);
    embedErrors = embedResult.errors.length;
    console.info(
      `📊 Embedding batch: ${embedResult.created} created, ${embedResult.skipped} skipped, ${embedErrors} failed`,
    );
  } catch (err) {
    console.error('Failed to create embeddings batch:', err);
  }

  // Step 2: Find the user's unclustered feedback (paged — no 1000-row cap).
  const allFeedback = await fetchAllRows<DbRow>((from, to) =>
    db.from('feedback').select('id, content').eq('user_id', userId).order('id').range(from, to),
  );
  const linked = await findLinkedFeedback(allFeedback.map((f) => f['id'] as string));
  const unprocessed = allFeedback.filter((f) => !linked.has(f['id'] as string));

  if (unprocessed.length === 0) {
    return { processed: 0, new_clusters: 0, linked: 0, failed: 0, message: 'All feedback is already clustered.' };
  }

  console.info(`🔄 Processing ${unprocessed.length} unclustered feedback items`);

  // Step 3: Load stored embeddings for the unprocessed items.
  const embeddingByFeedback = new Map<string, string>();
  for (const part of chunk(unprocessed.map((f) => f['id'] as string))) {
    const { data, error } = await db
      .from('embeddings')
      .select('feedback_id, embedding')
      .eq('model', EMBEDDING_MODEL)
      .in('feedback_id', part);
    if (error) throw new Error(`Failed to load embeddings: ${error.message}`);
    for (const e of (data ?? []) as DbRow[]) {
      embeddingByFeedback.set(e['feedback_id'] as string, e['embedding'] as string);
    }
  }

  let newClusters = 0;
  let linkedCount = 0;
  let failed = 0;
  const withoutEmbedding: DbRow[] = [];

  // Step 4: Vector clustering.
  for (const item of unprocessed) {
    const fid = item['id'] as string;
    const content = item['content'] as string;
    const embedding = embeddingByFeedback.get(fid);

    if (!embedding) {
      withoutEmbedding.push(item);
      continue;
    }

    const fbType = classifyFeedback(content);
    const threshold = THRESHOLDS[fbType] ?? THRESHOLDS['default'];

    try {
      const { data: matchData, error: matchError } = await db.rpc('match_feedback', {
        query_embedding: embedding,
        match_count: MATCH_COUNT,
        match_threshold: threshold,
        filter_user_id: userId,
        filter_model: EMBEDDING_MODEL,
      });
      if (matchError) throw new Error(`match_feedback failed: ${matchError.message}`);

      // Exclude the item itself (it always matches with similarity 1.0).
      const matches = ((matchData ?? []) as DbRow[])
        .filter((m) => m['feedback_id'] !== fid)
        .sort((a, b) => (b['similarity'] as number) - (a['similarity'] as number));

      let target: { clusterId: string; similarity: number } | null = null;
      if (matches.length > 0) {
        const matchLinks = await findLinkedFeedback(matches.map((m) => m['feedback_id'] as string));
        for (const m of matches) {
          const cid = matchLinks.get(m['feedback_id'] as string);
          if (cid) {
            target = { clusterId: cid, similarity: m['similarity'] as number };
            break;
          }
        }
      }

      if (target) {
        await addFeedbackToCluster(target.clusterId, [fid], [target.similarity]);
        linkedCount++;
      } else {
        await createCluster({
          title: `New ${labelFor(fbType)} Cluster`,
          feedbackIds: [fid],
          similarityScores: [1.0],
          confidenceScore: 0,
          userId,
        });
        newClusters++;
      }
    } catch (err) {
      failed++;
      console.error(`Failed to cluster feedback ${fid}:`, err);
    }
  }

  // Step 5: Keyword fallback for items that have no embedding.
  let fallbackClusters = 0;
  if (withoutEmbedding.length > 0) {
    console.warn(`⚠️ ${withoutEmbedding.length} items have no embedding — using keyword fallback`);
    fallbackClusters = await createFallbackClusters(withoutEmbedding, userId);
    newClusters += fallbackClusters;
  }

  const fallbackNote =
    withoutEmbedding.length > 0
      ? ` ${withoutEmbedding.length} grouped by keywords (embedding unavailable${embedErrors ? `: ${embedErrors} embedding errors` : ''}).`
      : '';

  return {
    processed: unprocessed.length,
    new_clusters: newClusters,
    linked: linkedCount,
    failed,
    fallback_items: withoutEmbedding.length,
    message:
      `Processed ${unprocessed.length} items: ${newClusters} new clusters, ${linkedCount} linked to existing` +
      `${failed ? `, ${failed} failed` : ''}.${fallbackNote}`,
  };
}

async function createFallbackClusters(items: DbRow[], userId: string): Promise<number> {
  const groups: Record<string, string[]> = {};
  for (const item of items) {
    const fbType = classifyFeedback(item['content'] as string);
    (groups[fbType] ??= []).push(item['id'] as string);
  }

  let created = 0;
  for (const [fbType, fids] of Object.entries(groups)) {
    try {
      await createCluster({
        title: `${labelFor(fbType)} Feedback Group`,
        feedbackIds: fids,
        confidenceScore: 0,
        userId,
      });
      created++;
    } catch (err) {
      console.error(`Fallback clustering failed for group ${fbType}:`, err);
    }
  }
  return created;
}
