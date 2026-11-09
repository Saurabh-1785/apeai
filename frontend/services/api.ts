import {
  Cluster,
  Document,
  Integration,
  TicketLink,
  DuplicateTicket,
  PublishResult,
  FeedbackItem,
} from '../types/models';
import { supabase } from '../lib/supabase';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

async function getAuthToken(): Promise<string | undefined> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token;
}

/** Turns a failed response into an Error carrying the backend's `detail` message. */
async function toError(response: Response): Promise<Error> {
  let message = `Request failed with status ${response.status}`;
  try {
    const data = await response.json();
    message = data.detail || data.message || message;
  } catch {
    // body was not JSON
  }
  if (response.status === 401) message = 'Your session has expired. Please sign in again.';
  const err = new Error(message) as Error & { status?: number };
  err.status = response.status;
  return err;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { ...((options.headers as Record<string, string>) || {}) };

  // Only JSON bodies get a JSON content type (FormData sets its own boundary).
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  // --- INGESTION (Layer 1) ---
  ingestManualFeedback(content: string, author = 'anonymous'): Promise<any> {
    return request('/feedback/manual', { method: 'POST', body: JSON.stringify({ content, author }) });
  },

  ingestCSVFeedback(file: File): Promise<{ total_rows: number; saved: number; errors: Array<{ row: number; error: string }>; message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return request('/feedback/csv', { method: 'POST', body: formData });
  },

  getFeedbackStats(): Promise<{ total: number; by_source: Record<string, number> }> {
    return request('/feedback/stats');
  },

  getRecentFeedbacks(limit = 50): Promise<{ feedbacks: FeedbackItem[] }> {
    return request(`/feedback/recent?limit=${limit}`);
  },

  // --- MULTI-SOURCE INGESTION (Layer 1) ---
  simulateIngestion(source: string): Promise<any> {
    return request(`/api/ingestion/simulate/${enc(source)}`, { method: 'POST' });
  },

  getIngestionStatus(): Promise<any> {
    return request('/api/ingestion/status');
  },

  ingestAppStoreReviews(reviews: any[]): Promise<any> {
    return request('/api/ingestion/appstore', { method: 'POST', body: JSON.stringify(reviews) });
  },

  ingestRedditPosts(posts: any[]): Promise<any> {
    return request('/api/ingestion/reddit', { method: 'POST', body: JSON.stringify(posts) });
  },

  // --- CLUSTERS ---
  getClusters(params: { limit?: number; offset?: number; status?: string } = {}): Promise<{ clusters: Cluster[]; total: number }> {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    if (params.status) qs.set('status', params.status);
    const q = qs.toString();
    return request(`/clusters${q ? `?${q}` : ''}`);
  },

  getCluster(clusterId: string): Promise<Cluster> {
    return request(`/clusters/${enc(clusterId)}`);
  },

  getClusterDuplicates(clusterId: string, threshold = 0.8): Promise<{ duplicates: DuplicateTicket[]; count: number }> {
    return request(`/clusters/${enc(clusterId)}/duplicates?threshold=${threshold}`);
  },

  appendClusterToTicket(clusterId: string, targetDocumentId: string): Promise<any> {
    return request(`/clusters/${enc(clusterId)}/append`, {
      method: 'POST',
      body: JSON.stringify({ target_document_id: targetDocumentId }),
    });
  },

  // --- PIPELINE (Layer 3) ---
  triggerClustering(): Promise<any> {
    return request('/pipeline/cluster', { method: 'POST' });
  },

  getPipelineStatus(): Promise<any> {
    return request('/pipeline/status');
  },

  triggerSummarization(clusterId: string): Promise<any> {
    return request(`/pipeline/summarize/${enc(clusterId)}`, { method: 'POST' });
  },

  triggerBRD(clusterId: string): Promise<Document> {
    return request(`/pipeline/generate-brd/${enc(clusterId)}`, { method: 'POST' });
  },

  triggerPRD(clusterId: string, brdId: string): Promise<Document> {
    return request(`/pipeline/generate-prd/${enc(clusterId)}?brd_id=${enc(brdId)}`, { method: 'POST' });
  },

  triggerStories(clusterId: string, prdId: string): Promise<Document[]> {
    return request(`/pipeline/generate-stories/${enc(clusterId)}?prd_id=${enc(prdId)}`, { method: 'POST' });
  },

  triggerTasks(storyId: string, clusterId: string): Promise<Document> {
    return request(`/pipeline/generate-tasks/${enc(storyId)}?cluster_id=${enc(clusterId)}`, { method: 'POST' });
  },

  // --- DOCUMENTS (Human-in-the-Loop) ---
  getDocuments(clusterId?: string, type?: string): Promise<{ documents: Document[]; total: number }> {
    const params = new URLSearchParams({ limit: '500' });
    if (clusterId) params.append('cluster_id', clusterId);
    if (type) params.append('type', type);
    return request(`/documents?${params.toString()}`);
  },

  getDocument(documentId: string): Promise<Document> {
    return request(`/documents/${enc(documentId)}`);
  },

  updateDocument(documentId: string, payload: { title?: string; content?: any; status?: 'draft' | 'review' }): Promise<Document> {
    return request(`/documents/${enc(documentId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  /** Approve a document. Pass `editedContent` to approve with reviewer edits. Reviewer = signed-in user. */
  approveDocument(documentId: string, opts: { editedContent?: any; notes?: string } = {}): Promise<any> {
    return request('/approvals', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        approved: true,
        review_notes: opts.notes ?? 'Approved via human review portal',
        edited_content: opts.editedContent,
      }),
    });
  },

  rejectDocument(documentId: string, notes?: string): Promise<any> {
    return request('/approvals', {
      method: 'POST',
      body: JSON.stringify({ document_id: documentId, approved: false, review_notes: notes || null }),
    });
  },

  getTicketLinks(documentId: string): Promise<{ ticket_links: TicketLink[]; total: number }> {
    return request(`/ticket-links?document_id=${enc(documentId)}`);
  },

  // --- INTEGRATIONS & PUBLISHING (Layer 4) ---
  getIntegrations(): Promise<{ integrations: Integration[] }> {
    return request('/integrations');
  },

  createIntegration(payload: Partial<Integration>): Promise<Integration> {
    return request('/integrations', { method: 'POST', body: JSON.stringify(payload) });
  },

  deleteIntegration(integrationId: string): Promise<any> {
    return request(`/integrations/${enc(integrationId)}`, { method: 'DELETE' });
  },

  /** Jira is the only publisher implemented on the backend. */
  publishToJira(documentId: string, integrationId?: string): Promise<PublishResult> {
    const qs = integrationId ? `?integration_id=${enc(integrationId)}` : '';
    return request(`/publish/jira/${enc(documentId)}${qs}`, { method: 'POST' });
  },
};
