export type ClusterStatus =
  | 'new'
  | 'clustered'
  | 'brd_generated'
  | 'prd_generated'
  | 'stories_generated'
  | 'tasks_generated'
  | 'approved'
  | 'tickets_created'
  | 'archived';

export interface FeedbackItem {
  id: string;
  content: string;
  source: string;
  author: string;
  timestamp: string;
  external_id?: string | null;
  metadata?: Record<string, unknown>;
  similarity_score?: number | null;
  created_at?: string;
}

export interface Cluster {
  id: string;
  title: string;
  summary: string | null;
  status: ClusterStatus | string;
  feedback_count?: number;
  confidence_score?: number;
  created_at: string;
  updated_at: string;
  feedback_items?: FeedbackItem[];
}

export type DocumentType = 'brd' | 'prd' | 'epic' | 'story' | 'task' | 'sprint_plan';
export type DocumentStatus = 'draft' | 'review' | 'approved' | 'rejected' | 'published';

export interface Document {
  id: string;
  cluster_id: string;
  type: DocumentType;
  title: string | null;
  content: any;
  version: number;
  parent_id: string | null;
  status: DocumentStatus;
  created_at: string;
  updated_at: string;
}

export interface Integration {
  id: string;
  type: 'jira' | 'github' | 'linear' | 'notion';
  name: string;
  api_key?: string;
  project_id: string | null;
  api_url: string | null;
  config: any;
  is_active: boolean;
  created_at: string;
}

export interface TicketLink {
  id: string;
  document_id: string;
  integration_id: string;
  external_id: string;
  external_url: string | null;
  external_status: string | null;
  created_at?: string;
  synced_at?: string;
}

export interface DuplicateTicket {
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

export interface PublishResult {
  success: boolean;
  external_id: string;
  external_url: string;
  ticket_link: TicketLink | null;
  warning?: string;
}
