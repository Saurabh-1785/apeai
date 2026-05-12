-- ===========================================
-- ApeAI — Layer 2: Complete Database Schema
-- ===========================================
-- Run this in your Supabase SQL Editor:
--   https://supabase.com → your project → SQL Editor
--
-- This creates ALL tables needed for the ApeAI platform.
-- ===========================================

-- ─── Enable pgvector Extension ─────────────────────────────
-- This turns PostgreSQL into a vector database.
-- Required for embedding storage and similarity search.

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Table 1: feedback ──────────────────────────────────────
-- Raw normalized feedback from all sources (Layer 1).
-- Already in use from Layer 1 ingestion.

CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'anonymous',
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_source ON feedback(source);
CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON feedback(timestamp);

-- ─── Table 2: embeddings ────────────────────────────────────
-- Vector embeddings for each feedback item.
-- Uses OpenAI text-embedding-3-small (1536 dimensions).
-- Separate from feedback table for performance: vector queries
-- are heavy and this keeps them isolated.

CREATE TABLE IF NOT EXISTS embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    embedding VECTOR(1536) NOT NULL,
    model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(feedback_id)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_feedback_id ON embeddings(feedback_id);

-- IVFFlat index for fast approximate nearest neighbor search.
-- The lists parameter (100) is tuned for datasets up to ~100k rows.
-- Recreate with more lists as your data grows.
-- NOTE: This index requires at least some data to exist before creation.
-- Run this AFTER inserting your first batch of embeddings:
--
-- CREATE INDEX IF NOT EXISTS idx_embeddings_vector
--   ON embeddings USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- ─── Table 3: clusters ──────────────────────────────────────
-- Groups of related feedback items. Created by the AI pipeline
-- after similarity analysis. Each cluster represents a "theme"
-- or "topic" that multiple users are talking about.

CREATE TABLE IF NOT EXISTS clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT,
    summary TEXT,
    feedback_count INT DEFAULT 0,
    confidence_score FLOAT DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN (
            'new',
            'clustered',
            'brd_generated',
            'prd_generated',
            'stories_generated',
            'tasks_generated',
            'approved',
            'tickets_created',
            'archived'
        )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clusters_status ON clusters(status);

-- ─── Table 4: cluster_feedback ──────────────────────────────
-- Many-to-many relationship: one cluster contains many feedback
-- items, and one feedback item could theoretically appear in
-- multiple clusters (though usually just one).

CREATE TABLE IF NOT EXISTS cluster_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    similarity_score FLOAT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(cluster_id, feedback_id)
);

CREATE INDEX IF NOT EXISTS idx_cf_cluster ON cluster_feedback(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cf_feedback ON cluster_feedback(feedback_id);

-- ─── Table 5: documents ─────────────────────────────────────
-- AI-generated outputs: BRD, PRD, epics, stories, tasks.
-- Content is stored as JSONB for flexibility — AI output
-- structure evolves frequently and JSONB handles that.

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    type TEXT NOT NULL
        CHECK (type IN ('brd', 'prd', 'epic', 'story', 'task', 'sprint_plan')),
    title TEXT,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INT NOT NULL DEFAULT 1,
    parent_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_cluster ON documents(cluster_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_id);

-- ─── Table 6: approvals ─────────────────────────────────────
-- Human review gate. Tracks who approved/rejected what and when.
-- Also stores the original + edited versions for the feedback
-- loop (used to improve AI prompts over time).

CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    approved BOOLEAN,
    reviewed_by TEXT,
    review_notes TEXT,
    original_content JSONB,
    edited_content JSONB,
    reviewed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_document ON approvals(document_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approved ON approvals(approved);

-- ─── Table 7: integrations ──────────────────────────────────
-- Stores API credentials for external tools (Jira, GitHub, Linear).
-- Each row is one configured integration. Users can have multiple
-- integrations of the same type (e.g., two Jira projects).

CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL
        CHECK (type IN ('jira', 'github', 'linear', 'notion')),
    name TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_url TEXT,
    project_id TEXT,
    config JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type);
CREATE INDEX IF NOT EXISTS idx_integrations_active ON integrations(is_active);

-- ─── Table 8: ticket_links ──────────────────────────────────
-- Tracks which documents have been pushed to which external tool.
-- Prevents duplicate ticket creation and enables status sync.

CREATE TABLE IF NOT EXISTS ticket_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    external_url TEXT,
    external_status TEXT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tl_document ON ticket_links(document_id);
CREATE INDEX IF NOT EXISTS idx_tl_integration ON ticket_links(integration_id);

-- ─── Helper Function: auto-update updated_at ────────────────
-- Automatically sets updated_at on row update.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to tables with updated_at
CREATE OR REPLACE TRIGGER update_clusters_updated_at
    BEFORE UPDATE ON clusters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_integrations_updated_at
    BEFORE UPDATE ON integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Similarity Search Function ─────────────────────────────
-- Convenience function to find the N most similar feedback items
-- to a given embedding vector using cosine distance.

CREATE OR REPLACE FUNCTION match_feedback(
    query_embedding VECTOR(1536),
    match_count INT DEFAULT 10,
    match_threshold FLOAT DEFAULT 0.8
)
RETURNS TABLE (
    feedback_id UUID,
    content TEXT,
    source TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.feedback_id,
        f.content,
        f.source,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM embeddings e
    JOIN feedback f ON f.id = e.feedback_id
    WHERE 1 - (e.embedding <=> query_embedding) > match_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
