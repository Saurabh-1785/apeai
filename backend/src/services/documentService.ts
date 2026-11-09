/**
 * ApeAI — Document Service
 *
 * Manages AI-generated documents (BRD, PRD, stories, tasks), the human
 * review/approval gate, integrations and ticket links. Every public
 * function is scoped to the authenticated user.
 */

import { getSupabaseClient, fetchAllRows } from '../db/supabase';
import {
  advanceClusterStatus,
  getOwnedDocument,
  getOwnedIntegration,
} from './ownership';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';

type DbRow = Record<string, unknown>;

export const DOCUMENT_TYPES = ['brd', 'prd', 'epic', 'story', 'task', 'sprint_plan'];
export const INTEGRATION_TYPES = ['jira', 'github', 'linear', 'notion'];

/** Statuses a client may set directly via PATCH. Approval/rejection/publishing go through their own flows. */
const CLIENT_SETTABLE_STATUSES = ['draft', 'review'];

// ─── Document CRUD ─────────────────────────────────────────────

export async function createDocument(params: {
  clusterId: string;
  userId: string;
  docType: string;
  title?: string;
  content?: DbRow;
  parentId?: string;
}): Promise<DbRow> {
  const db = getSupabaseClient();
  const { clusterId, userId, docType, title, content, parentId } = params;

  if (!DOCUMENT_TYPES.includes(docType)) throw new BadRequestError(`Invalid document type: ${docType}`);

  const { data, error } = await db
    .from('documents')
    .insert({
      cluster_id: clusterId,
      user_id: userId,
      type: docType,
      title: title ?? null,
      content: content ?? {},
      parent_id: parentId ?? null,
      status: 'draft',
      version: 1,
    })
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to create document: ${error?.message}`);

  const doc = data as DbRow;
  console.info(`✅ Document created: ${doc['id']} — type=${docType}, cluster=${clusterId}`);
  return doc;
}

/** Internal, unscoped fetch. Use getOwnedDocument for user-facing reads. */
export async function getDocument(documentId: string): Promise<DbRow> {
  const db = getSupabaseClient();
  const { data, error } = await db.from('documents').select('*').eq('id', documentId).maybeSingle();
  if (error || !data) throw new NotFoundError(`Document not found: ${documentId}`);
  return data as DbRow;
}

export async function listDocuments(params: {
  userId: string;
  clusterId?: string;
  docType?: string;
  status?: string;
  parentId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ documents: DbRow[]; total: number }> {
  const db = getSupabaseClient();
  const { userId, clusterId, docType, status, parentId, limit = 50, offset = 0 } = params;

  let query = db
    .from('documents')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (clusterId) query = query.eq('cluster_id', clusterId);
  if (docType) query = query.eq('type', docType);
  if (status) query = query.eq('status', status);
  if (parentId) query = query.eq('parent_id', parentId);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list documents: ${error.message}`);
  return { documents: (data ?? []) as DbRow[], total: count ?? (data ?? []).length };
}

export async function updateDocument(
  documentId: string,
  userId: string,
  updates: { title?: string; content?: DbRow; status?: string },
): Promise<DbRow> {
  const db = getSupabaseClient();
  const current = await getOwnedDocument(documentId, userId);

  if (current['status'] === 'published') {
    throw new ConflictError('Published documents cannot be edited');
  }
  if (updates.status !== undefined && !CLIENT_SETTABLE_STATUSES.includes(updates.status)) {
    throw new BadRequestError(
      `Status '${updates.status}' cannot be set directly. Use POST /approvals to approve or reject.`,
    );
  }
  if (updates.content !== undefined && !(typeof updates.content === 'object' && updates.content !== null && !Array.isArray(updates.content))) {
    throw new BadRequestError("'content' must be a JSON object");
  }

  const updateData: DbRow = {};
  if (updates.title !== undefined) updateData['title'] = updates.title;
  if (updates.status !== undefined) updateData['status'] = updates.status;

  const contentChanged =
    updates.content !== undefined && JSON.stringify(updates.content) !== JSON.stringify(current['content']);
  const titleChanged = updates.title !== undefined && updates.title !== current['title'];

  if (contentChanged) {
    updateData['content'] = updates.content;
    updateData['version'] = ((current['version'] as number) ?? 1) + 1;
  }
  // Editing an approved/rejected document invalidates the review decision.
  if ((contentChanged || titleChanged) && ['approved', 'rejected'].includes(current['status'] as string)) {
    updateData['status'] = 'draft';
  }

  if (Object.keys(updateData).length === 0) return current;

  const { data, error } = await db
    .from('documents')
    .update(updateData)
    .eq('id', documentId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to update document: ${error?.message}`);
  return data as DbRow;
}

export async function deleteDocument(documentId: string, userId: string): Promise<void> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('user_id', userId)
    .select('id');
  if (error) throw new Error(`Failed to delete document: ${error.message}`);
  if (!data || data.length === 0) throw new NotFoundError(`Document not found: ${documentId}`);
}

// ─── Approval / Review Gate ────────────────────────────────────

const APPROVAL_CLUSTER_STATUS: Record<string, string> = {
  brd: 'brd_generated',
  prd: 'prd_generated',
  story: 'stories_generated',
  task: 'tasks_generated',
};

export async function createApproval(params: {
  documentId: string;
  userId: string;
  approved: boolean;
  reviewNotes?: string;
  editedContent?: DbRow;
}): Promise<DbRow> {
  const db = getSupabaseClient();
  const { documentId, userId, approved, reviewNotes, editedContent } = params;

  const doc = await getOwnedDocument(documentId, userId);
  if (doc['status'] === 'published') {
    throw new ConflictError('Document is already published; its review decision can no longer change');
  }
  if (editedContent !== undefined && editedContent !== null && (typeof editedContent !== 'object' || Array.isArray(editedContent))) {
    throw new BadRequestError("'edited_content' must be a JSON object");
  }

  const { data, error } = await db
    .from('approvals')
    .insert({
      document_id: documentId,
      approved,
      reviewed_by: userId,
      review_notes: reviewNotes ?? null,
      original_content: doc['content'],
      edited_content: editedContent ?? null,
    })
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to create approval: ${error?.message}`);

  const docUpdate: DbRow = { status: approved ? 'approved' : 'rejected' };
  if (approved && editedContent && JSON.stringify(editedContent) !== JSON.stringify(doc['content'])) {
    docUpdate['content'] = editedContent;
    docUpdate['version'] = ((doc['version'] as number) ?? 1) + 1;
  }
  const { error: updErr } = await db.from('documents').update(docUpdate).eq('id', documentId);
  if (updErr) throw new Error(`Approval recorded but document update failed: ${updErr.message}`);

  // Forward-only: approving an earlier-stage document never rewinds the cluster.
  const target = APPROVAL_CLUSTER_STATUS[doc['type'] as string];
  if (approved && target && doc['cluster_id']) {
    await advanceClusterStatus(doc['cluster_id'] as string, target);
  }

  console.info(`✅ Document ${documentId} ${approved ? 'approved' : 'rejected'} by ${userId}`);
  return data as DbRow;
}

export async function listApprovals(params: {
  userId: string;
  documentId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ approvals: DbRow[]; total: number }> {
  const db = getSupabaseClient();
  const { userId, documentId, limit = 50, offset = 0 } = params;

  let query = db
    .from('approvals')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (documentId) {
    await getOwnedDocument(documentId, userId);
    query = query.eq('document_id', documentId);
  } else {
    query = query.eq('reviewed_by', userId);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to list approvals: ${error.message}`);
  return { approvals: (data ?? []) as DbRow[], total: count ?? (data ?? []).length };
}

// ─── Integration Config ────────────────────────────────────────

function maskIntegration(row: DbRow): DbRow {
  return { ...row, api_key: row['api_key'] ? '***masked***' : null };
}

export async function createIntegration(params: {
  userId: string;
  intType: string;
  name: string;
  apiKey: string;
  apiUrl?: string;
  projectId?: string;
  config?: DbRow;
}): Promise<DbRow> {
  const db = getSupabaseClient();
  if (!INTEGRATION_TYPES.includes(params.intType)) throw new BadRequestError(`Invalid integration type: ${params.intType}`);
  if (!params.name?.trim()) throw new BadRequestError("'name' is required");
  if (!params.apiKey?.trim()) throw new BadRequestError("'api_key' is required");

  const { data, error } = await db
    .from('integrations')
    .insert({
      user_id: params.userId,
      type: params.intType,
      name: params.name.trim(),
      api_key: params.apiKey,
      api_url: params.apiUrl ?? null,
      project_id: params.projectId ?? null,
      config: params.config ?? {},
      is_active: true,
    })
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to create integration: ${error?.message}`);
  return maskIntegration(data as DbRow);
}

export async function listIntegrations(params: {
  userId: string;
  intType?: string;
  activeOnly?: boolean;
}): Promise<{ integrations: DbRow[]; total: number }> {
  const db = getSupabaseClient();
  const { userId, intType, activeOnly = true } = params;

  let query = db
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (intType) query = query.eq('type', intType);
  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list integrations: ${error.message}`);
  const integrations = ((data ?? []) as DbRow[]).map(maskIntegration);
  return { integrations, total: integrations.length };
}

export async function updateIntegration(
  integrationId: string,
  userId: string,
  updates: {
    name?: string;
    apiKey?: string;
    apiUrl?: string;
    projectId?: string;
    config?: DbRow;
    isActive?: boolean;
  },
): Promise<DbRow> {
  const db = getSupabaseClient();
  await getOwnedIntegration(integrationId, userId);

  const updateData: DbRow = {};
  if (updates.name !== undefined) updateData['name'] = updates.name;
  if (updates.apiKey !== undefined && updates.apiKey !== '***masked***') updateData['api_key'] = updates.apiKey;
  if (updates.apiUrl !== undefined) updateData['api_url'] = updates.apiUrl;
  if (updates.projectId !== undefined) updateData['project_id'] = updates.projectId;
  if (updates.config !== undefined) updateData['config'] = updates.config;
  if (updates.isActive !== undefined) updateData['is_active'] = updates.isActive;
  if (Object.keys(updateData).length === 0) throw new BadRequestError('No fields to update');

  const { data, error } = await db
    .from('integrations')
    .update(updateData)
    .eq('id', integrationId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error || !data) throw new Error(`Failed to update integration: ${error?.message}`);
  return maskIntegration(data as DbRow);
}

export async function deleteIntegration(integrationId: string, userId: string): Promise<void> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('integrations')
    .delete()
    .eq('id', integrationId)
    .eq('user_id', userId)
    .select('id');
  if (error) throw new Error(`Failed to delete integration: ${error.message}`);
  if (!data || data.length === 0) throw new NotFoundError(`Integration not found: ${integrationId}`);
}

// ─── Ticket Links ──────────────────────────────────────────────

/** Internal — caller must have verified ownership of the document and integration. */
export async function createTicketLink(params: {
  documentId: string;
  integrationId: string;
  externalId: string;
  externalUrl?: string;
  externalStatus?: string;
}): Promise<DbRow> {
  const db = getSupabaseClient();

  const { data, error } = await db
    .from('ticket_links')
    .insert({
      document_id: params.documentId,
      integration_id: params.integrationId,
      external_id: params.externalId,
      external_url: params.externalUrl ?? null,
      external_status: params.externalStatus ?? null,
    })
    .select()
    .single();
  if (error || !data) {
    if (error?.code === '23505') {
      throw new ConflictError(`Document ${params.documentId} is already linked to integration ${params.integrationId}`);
    }
    throw new Error(`Failed to create ticket link: ${error?.message}`);
  }

  const doc = await getDocument(params.documentId);
  if (doc['cluster_id']) await advanceClusterStatus(doc['cluster_id'] as string, 'tickets_created');

  console.info(`✅ Ticket link created: doc=${params.documentId} → ${params.externalUrl ?? params.externalId}`);
  return data as DbRow;
}

/** User-facing manual link creation (verifies ownership). */
export async function createOwnedTicketLink(
  userId: string,
  params: Parameters<typeof createTicketLink>[0],
): Promise<DbRow> {
  if (!params.documentId || !params.integrationId || !params.externalId) {
    throw new BadRequestError("'document_id', 'integration_id' and 'external_id' are required");
  }
  await getOwnedDocument(params.documentId, userId);
  await getOwnedIntegration(params.integrationId, userId);
  return createTicketLink(params);
}

export async function listTicketLinks(userId: string, documentId?: string): Promise<DbRow[]> {
  const db = getSupabaseClient();

  let query = db.from('ticket_links').select('*').order('created_at', { ascending: false });

  if (documentId) {
    await getOwnedDocument(documentId, userId);
    query = query.eq('document_id', documentId);
  } else {
    const { data: ints } = await db.from('integrations').select('id').eq('user_id', userId);
    const ids = ((ints ?? []) as DbRow[]).map((i) => i['id'] as string);
    if (ids.length === 0) return [];
    query = query.in('integration_id', ids);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list ticket links: ${error.message}`);
  return (data ?? []) as DbRow[];
}

// ─── Pipeline Overview ─────────────────────────────────────────

export async function getPipelineStatus(userId: string): Promise<DbRow> {
  const db = getSupabaseClient();
  const { findFeedbackNeedingEmbedding } = await import('./embeddingService');

  const { count: feedbackCount } = await db
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  const unembedded = (await findFeedbackNeedingEmbedding(userId)).length;

  const clusters = await fetchAllRows<DbRow>((from, to) =>
    db.from('clusters').select('status').eq('user_id', userId).range(from, to),
  );
  const clustersByStatus: Record<string, number> = {};
  for (const row of clusters) {
    const s = (row['status'] as string) ?? 'unknown';
    clustersByStatus[s] = (clustersByStatus[s] ?? 0) + 1;
  }

  const documents = await fetchAllRows<DbRow>((from, to) =>
    db.from('documents').select('type, status').eq('user_id', userId).range(from, to),
  );
  const docsByType: Record<string, number> = {};
  const docsByStatus: Record<string, number> = {};
  for (const row of documents) {
    const t = (row['type'] as string) ?? 'unknown';
    const s = (row['status'] as string) ?? 'unknown';
    docsByType[t] = (docsByType[t] ?? 0) + 1;
    docsByStatus[s] = (docsByStatus[s] ?? 0) + 1;
  }

  const { count: approvalCount } = await db
    .from('approvals')
    .select('id', { count: 'exact', head: true })
    .eq('reviewed_by', userId);

  const fc = feedbackCount ?? 0;

  return {
    total_feedback: fc,
    total_embedded: fc - unembedded,
    total_unembedded: unembedded,
    total_clusters: clusters.length,
    clusters_by_status: clustersByStatus,
    total_documents: documents.length,
    documents_by_type: docsByType,
    documents_by_status: docsByStatus,
    total_approvals: approvalCount ?? 0,
    // New documents are created as 'draft' and await human review.
    pending_reviews: (docsByStatus['draft'] ?? 0) + (docsByStatus['review'] ?? 0),
  };
}
