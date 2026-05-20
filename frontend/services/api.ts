import { Cluster, Document, Integration, IngestedFeedback } from '../types/models';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    let errMsg = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      errMsg = data.detail || data.message || errMsg;
    } catch {
      // Ignored if not JSON
    }
    throw new Error(errMsg);
  }

  // Handle empty bodies (e.g. 204 No Content)
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  // --- INGESTION (Layer 1) ---
  async ingestManualFeedback(content: string, author: string = 'anonymous'): Promise<any> {
    return request<any>('/feedback/manual', {
      method: 'POST',
      body: JSON.stringify({ content, author }),
    });
  },

  async getFeedbackStats(): Promise<any> {
    return request<any>('/feedback/stats');
  },

  // --- CLUSTERING & PIPELINE (Layer 3) ---
  async getClusters(): Promise<{ clusters: Cluster[] }> {
    return request<{ clusters: Cluster[] }>('/clusters/');
  },

  async triggerClustering(): Promise<any> {
    return request<any>('/pipeline/cluster', { method: 'POST' });
  },

  async getPipelineStatus(): Promise<any> {
    return request<any>('/pipeline/status');
  },

  async triggerSummarization(clusterId: string): Promise<any> {
    return request<any>(`/pipeline/summarize/${clusterId}`, { method: 'POST' });
  },

  async triggerBRD(clusterId: string): Promise<any> {
    return request<any>(`/pipeline/generate-brd/${clusterId}`, { method: 'POST' });
  },

  async triggerPRD(clusterId: string, brdId: string): Promise<any> {
    return request<any>(`/pipeline/generate-prd/${clusterId}?brd_id=${brdId}`, { method: 'POST' });
  },

  async triggerStories(clusterId: string, prdId: string): Promise<any> {
    return request<any>(`/pipeline/generate-stories/${clusterId}?prd_id=${prdId}`, { method: 'POST' });
  },

  async triggerTasks(storyId: string, clusterId: string): Promise<any> {
    return request<any>(`/pipeline/generate-tasks/${storyId}?cluster_id=${clusterId}`, { method: 'POST' });
  },

  // --- DOCUMENTS (Human-in-the-Loop) ---
  async getDocuments(clusterId?: string, type?: string): Promise<{ documents: Document[] }> {
    const params = new URLSearchParams();
    if (clusterId) params.append('cluster_id', clusterId);
    if (type) params.append('type', type);
    return request<{ documents: Document[] }>(`/documents/?${params.toString()}`);
  },

  async getDocument(documentId: string): Promise<Document> {
    return request<Document>(`/documents/${documentId}`);
  },

  async updateDocument(documentId: string, payload: { title?: string; content?: any; status?: string }): Promise<Document> {
    return request<Document>(`/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async approveDocument(documentId: string, approvedBy: string = 'Human Admin'): Promise<any> {
    // Creates an approval entry
    return request<any>('/approvals/', {
      method: 'POST',
      body: JSON.stringify({
        document_id: documentId,
        approved: true,
        reviewed_by: approvedBy,
        review_notes: 'Approved via human review portal'
      }),
    });
  },

  // --- INTEGRATIONS & PUBLISHING (Layer 4) ---
  async getIntegrations(): Promise<{ integrations: Integration[] }> {
    return request<{ integrations: Integration[] }>('/integrations/');
  },

  async createIntegration(payload: Partial<Integration>): Promise<Integration> {
    return request<Integration>('/integrations/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deleteIntegration(integrationId: string): Promise<any> {
    return request<any>(`/integrations/${integrationId}`, {
      method: 'DELETE',
    });
  },

  async publishToGitHub(documentId: string, integrationId?: string): Promise<any> {
    const url = `/publish/github/${documentId}${integrationId ? `?integration_id=${integrationId}` : ''}`;
    return request<any>(url, { method: 'POST' });
  },

  async publishToJira(documentId: string, integrationId?: string): Promise<any> {
    const url = `/publish/jira/${documentId}${integrationId ? `?integration_id=${integrationId}` : ''}`;
    return request<any>(url, { method: 'POST' });
  },

  async publishToLinear(documentId: string, integrationId?: string): Promise<any> {
    const url = `/publish/linear/${documentId}${integrationId ? `?integration_id=${integrationId}` : ''}`;
    return request<any>(url, { method: 'POST' });
  },
};
