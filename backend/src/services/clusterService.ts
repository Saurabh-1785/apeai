/**
 * ApeAI — Cluster Service
 *
 * Manages feedback clusters — groups of related feedback items.
 * Functions that take a `userId` scope their query to that user; the
 * unscoped helpers are for internal callers that already verified ownership.
 */

import { getSupabaseClient, fetchAllRows } from '../db/supabase';
import { NotFoundError, BadRequestError } from '../utils/errors';

type DbRow = Record<string, unknown>;

export const VALID_CLUSTER_STATUSES = [
  'new',
  'clustered',
  'brd_generated',
  'prd_generated',
  'stories_generated',
  'tasks_generated',
  'approved',
  'tickets_created',
  'archived',
];

export async function createCluster(params: {
  title: string;
  userId: string;
  summary?: string;
  feedbackIds?: string[];
  similarityScores?: Array<number | null>;
  confidenceScore?: number;
}): Promise<DbRow> {
  const db = getSupabaseClient();
  const { title, summary, feedbackIds, similarityScores, confidenceScore = 0.0, userId } = params;

  const { data, error } = await db
    .from('clusters')
    .insert({
      title,
      summary: summary ?? null,
      confidence_score: confidenceScore,
      feedback_count: feedbackIds?.length ?? 0,
      status: 'new',
      user_id: userId,
    })
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to create cluster: ${error?.message}`);

  const cluster = data as DbRow;
  const clusterId = cluster['id'] as string;

  if (feedbackIds && feedbackIds.length > 0) {
    const links = feedbackIds.map((fid, i) => ({
      cluster_id: clusterId,
      feedback_id: fid,
      similarity_score: similarityScores?.[i] ?? null,
    }));
    const { error: linkError } = await db.from('cluster_feedback').insert(links);
    if (linkError) {
      // Don't leave an empty cluster behind.
      await db.from('clusters').delete().eq('id', clusterId);
      throw new Error(`Failed to link feedback to new cluster: ${linkError.message}`);
    }
  }

  console.info(`✅ Cluster created: ${clusterId} — '${title}' (${feedbackIds?.length ?? 0} items)`);
  return cluster;
}

export async function getCluster(
  clusterId: string,
  includeFeedback = true,
  userId?: string,
): Promise<DbRow> {
  const db = getSupabaseClient();

  let query = db.from('clusters').select('*').eq('id', clusterId);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new NotFoundError(`Cluster not found: ${clusterId}`);

  const cluster = data as DbRow;

  if (includeFeedback) {
    const links = await fetchAllRows<DbRow>((from, to) =>
      db
        .from('cluster_feedback')
        .select('feedback_id, similarity_score')
        .eq('cluster_id', clusterId)
        .range(from, to),
    );

    const feedbackItems: DbRow[] = [];
    if (links.length > 0) {
      const scores = new Map<string, unknown>();
      for (const l of links) scores.set(l['feedback_id'] as string, l['similarity_score']);

      const ids = [...scores.keys()];
      for (let i = 0; i < ids.length; i += 200) {
        const { data: feedbackData } = await db
          .from('feedback')
          .select('*')
          .in('id', ids.slice(i, i + 200));
        for (const f of (feedbackData ?? []) as DbRow[]) {
          feedbackItems.push({ ...f, similarity_score: scores.get(f['id'] as string) ?? null });
        }
      }
    }
    cluster['feedback_items'] = feedbackItems;
  }

  return cluster;
}

export async function listClusters(params: {
  userId: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ clusters: DbRow[]; total: number }> {
  const db = getSupabaseClient();
  const { status, userId, limit = 50, offset = 0 } = params;

  let query = db
    .from('clusters')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list clusters: ${error.message}`);

  return { clusters: (data ?? []) as DbRow[], total: count ?? (data ?? []).length };
}

/** Internal update — caller must have verified ownership. */
export async function updateCluster(
  clusterId: string,
  updates: { title?: string; summary?: string; status?: string; confidenceScore?: number },
): Promise<DbRow> {
  const db = getSupabaseClient();
  const updateData: DbRow = {};

  if (updates.title !== undefined) updateData['title'] = updates.title;
  if (updates.summary !== undefined) updateData['summary'] = updates.summary;
  if (updates.status !== undefined) {
    if (!VALID_CLUSTER_STATUSES.includes(updates.status)) {
      throw new BadRequestError(`Invalid cluster status: ${updates.status}`);
    }
    updateData['status'] = updates.status;
  }
  if (updates.confidenceScore !== undefined) updateData['confidence_score'] = updates.confidenceScore;

  if (Object.keys(updateData).length === 0) throw new BadRequestError('No fields to update');

  const { data, error } = await db
    .from('clusters')
    .update(updateData)
    .eq('id', clusterId)
    .select()
    .maybeSingle();

  if (error || !data) throw new NotFoundError(`Cluster not found: ${clusterId}`);
  return data as DbRow;
}

export async function deleteCluster(clusterId: string, userId: string): Promise<void> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('clusters')
    .delete()
    .eq('id', clusterId)
    .eq('user_id', userId)
    .select('id');

  if (error) throw new Error(`Failed to delete cluster: ${error.message}`);
  if (!data || data.length === 0) throw new NotFoundError(`Cluster not found: ${clusterId}`);
}

/** Recounts links and stores feedback_count. Returns the new count. */
export async function refreshClusterCount(clusterId: string): Promise<number> {
  const db = getSupabaseClient();
  const { count, error } = await db
    .from('cluster_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('cluster_id', clusterId);
  if (error) throw new Error(`Failed to count cluster feedback: ${error.message}`);
  const n = count ?? 0;
  await db.from('clusters').update({ feedback_count: n }).eq('id', clusterId);
  return n;
}

/** Internal — caller must have verified ownership of cluster and feedback. */
export async function addFeedbackToCluster(
  clusterId: string,
  feedbackIds: string[],
  similarityScores?: Array<number | null>,
): Promise<{ added: number; total_in_cluster: number }> {
  const db = getSupabaseClient();

  // Skip feedback already linked to this cluster.
  const { data: existing } = await db
    .from('cluster_feedback')
    .select('feedback_id')
    .eq('cluster_id', clusterId)
    .in('feedback_id', feedbackIds);
  const already = new Set(((existing ?? []) as DbRow[]).map((e) => e['feedback_id'] as string));

  const links = feedbackIds
    .map((fid, i) => ({
      cluster_id: clusterId,
      feedback_id: fid,
      similarity_score: similarityScores?.[i] ?? null,
    }))
    .filter((l) => !already.has(l.feedback_id));

  let added = 0;
  if (links.length > 0) {
    const { data, error } = await db.from('cluster_feedback').insert(links).select('id');
    if (error) throw new Error(`Failed to add feedback to cluster: ${error.message}`);
    added = (data ?? []).length;
  }

  const total = await refreshClusterCount(clusterId);
  return { added, total_in_cluster: total };
}

/** Internal — caller must have verified ownership. */
export async function removeFeedbackFromCluster(
  clusterId: string,
  feedbackIds: string[],
): Promise<{ removed: number; total_in_cluster: number }> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('cluster_feedback')
    .delete()
    .eq('cluster_id', clusterId)
    .in('feedback_id', feedbackIds)
    .select('id');
  if (error) throw new Error(`Failed to remove feedback from cluster: ${error.message}`);

  const total = await refreshClusterCount(clusterId);
  return { removed: (data ?? []).length, total_in_cluster: total };
}

export async function getClusterStats(
  userId: string,
): Promise<{ total: number; by_status: Record<string, number> }> {
  const db = getSupabaseClient();
  const rows = await fetchAllRows<DbRow>((from, to) =>
    db.from('clusters').select('status').eq('user_id', userId).range(from, to),
  );

  const byStatus: Record<string, number> = {};
  for (const row of rows) {
    const s = (row['status'] as string) ?? 'unknown';
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  return { total: rows.length, by_status: byStatus };
}
