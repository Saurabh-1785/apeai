/**
 * ApeAI — Duplicate & Related Ticket Detection Service
 *
 * Detects existing published tickets that are semantically similar
 * to a new cluster's feedback content. Uses Supabase pgvector
 * cosine similarity via the match_tickets RPC function.
 *
 * When a new cluster is formed:
 *   1. Compute a representative embedding for the cluster
 *      (average of its feedback item embeddings)
 *   2. Call match_tickets to search published tickets
 *   3. Return matches above the similarity threshold (default 0.80)
 */

import { getSupabaseClient, chunk } from '../db/supabase';
import { generateEmbedding } from './embeddingService';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '../ai/geminiClient';
import { getOwnedCluster, getOwnedDocument } from './ownership';
import { refreshClusterCount } from './clusterService';
import { BadRequestError } from '../utils/errors';

type DbRow = Record<string, unknown>;

// ─── Types ────────────────────────────────────────────────────

export interface DuplicateMatch {
  ticket_link_id: string;
  document_id: string;
  external_id: string;
  external_url: string | null;
  external_status: string | null;
  document_title: string | null;
  document_type: string | null;
  cluster_id: string;
  similarity: number;
}

// ─── Constants ────────────────────────────────────────────────

const DEFAULT_SIMILARITY_THRESHOLD = 0.80;
const DEFAULT_MATCH_COUNT = 10;

// ─── Cluster Embedding Computation ────────────────────────────

/**
 * Computes a representative embedding for a cluster by averaging
 * the embeddings of all its feedback items.
 *
 * Falls back to generating an embedding from concatenated feedback
 * content if no pre-computed embeddings exist.
 */
async function computeClusterEmbedding(clusterId: string): Promise<number[]> {
  const db = getSupabaseClient();

  // Get feedback IDs linked to this cluster
  const { data: links } = await db
    .from('cluster_feedback')
    .select('feedback_id')
    .eq('cluster_id', clusterId);

  if (!links || links.length === 0) {
    throw new Error(`No feedback items found in cluster ${clusterId}`);
  }

  const feedbackIds = links.map((l: DbRow) => l['feedback_id'] as string);

  // Try to get existing embeddings for these feedback items
  const embeddingRows: DbRow[] = [];
  for (const part of chunk(feedbackIds)) {
    const { data } = await db
      .from('embeddings')
      .select('embedding')
      .eq('model', EMBEDDING_MODEL)
      .in('feedback_id', part);
    embeddingRows.push(...((data ?? []) as DbRow[]));
  }

  if (embeddingRows.length > 0) {
    // Average the existing embeddings
    const dimension = EMBEDDING_DIMENSIONS;
    const avgEmbedding = new Array(dimension).fill(0);
    let count = 0;

    for (const row of embeddingRows as DbRow[]) {
      const raw = row['embedding'];
      let values: number[];

      try {
        // pgvector comes back from PostgREST as the string "[0.1,0.2,...]"
        values = Array.isArray(raw) ? (raw as number[]) : JSON.parse(String(raw));
      } catch {
        continue;
      }

      for (let i = 0; i < Math.min(values.length, dimension); i++) {
        avgEmbedding[i] += values[i];
      }
      count++;
    }

    if (count > 0) {
      for (let i = 0; i < dimension; i++) {
        avgEmbedding[i] /= count;
      }
      console.info(`📐 Computed cluster embedding by averaging ${count} feedback embeddings`);
      return avgEmbedding;
    }
  }

  // Fallback: generate embedding from concatenated feedback content
  console.info('📐 No pre-computed embeddings found — generating from feedback content');

  const { data: feedbackData } = await db
    .from('feedback')
    .select('content')
    .in('id', feedbackIds.slice(0, 200));

  if (!feedbackData || feedbackData.length === 0) {
    throw new Error('No feedback content found for cluster embedding');
  }

  const concatenatedContent = (feedbackData as DbRow[])
    .map((f) => f['content'] as string)
    .join('\n')
    .slice(0, 5000); // Limit to 5000 chars for embedding

  return generateEmbedding(concatenatedContent);
}

// ─── Duplicate Detection ──────────────────────────────────────

/**
 * Finds published tickets that are semantically similar to a cluster.
 *
 * @param clusterId - The cluster to check for duplicates
 * @param threshold - Minimum similarity score (default 0.80)
 * @param maxResults - Maximum number of results to return
 * @returns Array of matching tickets sorted by similarity descending
 */
export async function findDuplicateTickets(
  clusterId: string,
  userId: string,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD,
  maxResults: number = DEFAULT_MATCH_COUNT,
): Promise<DuplicateMatch[]> {
  const db = getSupabaseClient();
  await getOwnedCluster(clusterId, userId);

  try {
    // Step 1: Compute cluster embedding
    const clusterEmbedding = await computeClusterEmbedding(clusterId);
    const vectorStr = `[${clusterEmbedding.join(',')}]`;

    // Step 2: Search for matching tickets via pgvector RPC
    const { data: matches, error } = await db.rpc('match_tickets', {
      query_embedding: vectorStr,
      // Ask for extra rows: tickets from this same cluster are filtered out below.
      match_count: maxResults + 5,
      match_threshold: threshold,
      filter_user_id: userId,
      filter_model: EMBEDDING_MODEL,
    });

    if (error) {
      console.error('❌ Duplicate ticket search failed:', error);
      // Don't throw — duplicate detection is non-critical
      return [];
    }

    if (!matches || (matches as DbRow[]).length === 0) {
      console.info(`✅ No duplicate tickets found for cluster ${clusterId}`);
      return [];
    }

    // Step 3: Filter out tickets belonging to the same cluster
    const results: DuplicateMatch[] = (matches as DbRow[])
      .filter((m) => (m['cluster_id'] as string) !== clusterId)
      .map((m) => ({
        ticket_link_id: m['ticket_link_id'] as string,
        document_id: m['document_id'] as string,
        external_id: m['external_id'] as string,
        external_url: (m['external_url'] as string) || null,
        external_status: (m['external_status'] as string) || null,
        document_title: (m['document_title'] as string) || null,
        document_type: (m['document_type'] as string) || null,
        cluster_id: m['cluster_id'] as string,
        similarity: Math.round(((m['similarity'] as number) ?? 0) * 100) / 100,
      }))
      .slice(0, maxResults);

    if (results.length > 0) {
      console.info(
        `⚠️ Found ${results.length} duplicate ticket(s) for cluster ${clusterId} ` +
        `(highest similarity: ${(results[0].similarity * 100).toFixed(0)}%)`,
      );
    }

    return results;
  } catch (err) {
    console.error('❌ Duplicate detection error:', err);
    // Non-critical — return empty array rather than blocking the pipeline
    return [];
  }
}

/**
 * Moves a cluster's feedback items into the cluster of an existing
 * document/ticket. Used when a PM chooses "Append to Existing Ticket"
 * instead of generating a new PRD. The source cluster is archived.
 */
export async function appendClusterToExistingDocument(
  clusterId: string,
  targetDocumentId: string,
  userId: string,
): Promise<DbRow> {
  const db = getSupabaseClient();

  await getOwnedCluster(clusterId, userId);
  const targetDoc = await getOwnedDocument(targetDocumentId, userId);
  const targetClusterId = targetDoc['cluster_id'] as string;

  if (targetClusterId === clusterId) {
    throw new BadRequestError('Target document already belongs to this cluster');
  }

  const { data: sourceLinks } = await db
    .from('cluster_feedback')
    .select('feedback_id, similarity_score')
    .eq('cluster_id', clusterId);
  if (!sourceLinks || sourceLinks.length === 0) {
    throw new BadRequestError('No feedback items in source cluster');
  }

  const feedbackIds = (sourceLinks as DbRow[]).map((l) => l['feedback_id'] as string);

  // Skip items already in the target cluster.
  const { data: alreadyInTarget } = await db
    .from('cluster_feedback')
    .select('feedback_id')
    .eq('cluster_id', targetClusterId)
    .in('feedback_id', feedbackIds);
  const skip = new Set(((alreadyInTarget ?? []) as DbRow[]).map((r) => r['feedback_id'] as string));

  const newLinks = (sourceLinks as DbRow[])
    .filter((l) => !skip.has(l['feedback_id'] as string))
    .map((l) => ({
      cluster_id: targetClusterId,
      feedback_id: l['feedback_id'],
      similarity_score: l['similarity_score'] ?? null,
    }));

  if (newLinks.length > 0) {
    const { error } = await db.from('cluster_feedback').insert(newLinks);
    if (error) throw new Error(`Failed to link feedback to target cluster: ${error.message}`);
  }

  // Move, don't copy: remove links from the source cluster.
  const { error: delError } = await db.from('cluster_feedback').delete().eq('cluster_id', clusterId);
  if (delError) throw new Error(`Failed to unlink feedback from source cluster: ${delError.message}`);

  await refreshClusterCount(targetClusterId);
  await db.from('clusters').update({ status: 'archived', feedback_count: 0 }).eq('id', clusterId);

  console.info(
    `✅ Moved ${feedbackIds.length} feedback items from cluster ${clusterId} ` +
      `to "${targetDoc['title']}" (cluster ${targetClusterId})`,
  );

  return {
    merged_feedback_count: feedbackIds.length,
    target_document_id: targetDocumentId,
    target_cluster_id: targetClusterId,
    source_cluster_archived: true,
    message: `Appended ${feedbackIds.length} feedback items to existing ticket`,
  };
}
