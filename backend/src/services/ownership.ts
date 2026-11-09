/**
 * ApeAI — Ownership Checks
 *
 * Every user-facing resource is scoped to the authenticated user.
 * Clusters, documents and integrations carry a `user_id` column; these
 * helpers load a row only if it belongs to the caller.
 *
 * All "not found" errors deliberately use the same message whether the
 * row is missing or owned by someone else, so IDs cannot be probed.
 */

import { getSupabaseClient, fetchAllRows } from '../db/supabase';
import { NotFoundError } from '../utils/errors';

type DbRow = Record<string, unknown>;

export async function getOwnedCluster(clusterId: string, userId: string): Promise<DbRow> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('clusters')
    .select('*')
    .eq('id', clusterId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new NotFoundError(`Cluster not found: ${clusterId}`);
  return data as DbRow;
}

export async function getOwnedDocument(documentId: string, userId: string): Promise<DbRow> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new NotFoundError(`Document not found: ${documentId}`);
  return data as DbRow;
}

export async function getOwnedIntegration(integrationId: string, userId: string): Promise<DbRow> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('integrations')
    .select('*')
    .eq('id', integrationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new NotFoundError(`Integration not found: ${integrationId}`);
  return data as DbRow;
}

/** Throws unless every feedback id belongs to the user. */
export async function assertOwnsFeedback(feedbackIds: string[], userId: string): Promise<void> {
  if (feedbackIds.length === 0) return;
  const db = getSupabaseClient();
  const unique = [...new Set(feedbackIds)];
  const { data, error } = await db
    .from('feedback')
    .select('id')
    .eq('user_id', userId)
    .in('id', unique);
  if (error) throw new Error(`Failed to verify feedback ownership: ${error.message}`);
  if ((data ?? []).length !== unique.length) {
    throw new NotFoundError('One or more feedback items not found');
  }
}

/** All cluster ids owned by the user. */
export async function listOwnedClusterIds(userId: string): Promise<string[]> {
  const db = getSupabaseClient();
  const rows = await fetchAllRows<DbRow>((from, to) =>
    db.from('clusters').select('id').eq('user_id', userId).range(from, to),
  );
  return rows.map((r) => r['id'] as string);
}

// ─── Cluster Status Progression ───────────────────────────────

/**
 * Pipeline stages in order. A cluster's status may only move forward;
 * re-running or re-approving an earlier stage never rewinds it.
 * 'archived' is terminal and is never overwritten.
 */
export const CLUSTER_STATUS_ORDER = [
  'new',
  'clustered',
  'brd_generated',
  'prd_generated',
  'stories_generated',
  'tasks_generated',
  'approved',
  'tickets_created',
] as const;

export async function advanceClusterStatus(clusterId: string, target: string): Promise<void> {
  const db = getSupabaseClient();
  const { data } = await db.from('clusters').select('status').eq('id', clusterId).maybeSingle();
  if (!data) return;
  const current = (data as DbRow)['status'] as string;
  if (current === 'archived') return;

  const order = CLUSTER_STATUS_ORDER as readonly string[];
  const currentIdx = order.indexOf(current);
  const targetIdx = order.indexOf(target);
  if (targetIdx === -1) return;
  if (currentIdx !== -1 && targetIdx <= currentIdx) return;

  await db.from('clusters').update({ status: target }).eq('id', clusterId);
}

/** Parses a positive integer query param with bounds; falls back on bad input. */
export function parseIntParam(value: unknown, fallback: number, max = 500): number {
  const n = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}
