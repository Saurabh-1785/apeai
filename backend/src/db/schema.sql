-- =============================================================
-- ApeAI — Database Schema (Supabase / PostgreSQL + pgvector)
--
-- Idempotent: safe to run on a fresh project AND on an existing
-- ApeAI database. Re-running it upgrades older installs:
--   * adds user_id ownership columns and backfills documents.user_id
--   * removes duplicate rows before adding unique constraints
--   * replaces match_feedback / match_tickets with user-scoped versions
--   * enables Row Level Security (the backend uses the service_role key,
--     which bypasses RLS; the browser's anon key can only touch its own
--     profile and avatar)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- =============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── updated_at trigger helper ───────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── profiles (one row per auth user; written by the frontend) ─

CREATE TABLE IF NOT EXISTS profiles (
  id                uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email             text,
  user_id           text,             -- public handle / username
  full_name         text,
  dob               date,
  about_description text,
  avatar_url        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── feedback (Layer 1 — normalized ingested items) ──────────

CREATE TABLE IF NOT EXISTS feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  source      text NOT NULL,
  author      text NOT NULL DEFAULT 'anonymous',
  content     text NOT NULL,
  timestamp   timestamptz NOT NULL DEFAULT now(),
  external_id text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS external_id text;

CREATE INDEX IF NOT EXISTS feedback_user_created_idx ON feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_external_idx ON feedback (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

-- ─── embeddings (Layer 2 — one current vector per feedback) ──

CREATE TABLE IF NOT EXISTS embeddings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback (id) ON DELETE CASCADE,
  embedding   vector(768) NOT NULL,
  model       text NOT NULL DEFAULT 'gemini-embedding-001',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'text-embedding-004';

-- Keep only the newest embedding per feedback item, then enforce it.
DELETE FROM embeddings e
USING embeddings newer
WHERE e.feedback_id = newer.feedback_id
  AND (e.created_at, e.id) < (newer.created_at, newer.id);
CREATE UNIQUE INDEX IF NOT EXISTS embeddings_feedback_uniq ON embeddings (feedback_id);
CREATE INDEX IF NOT EXISTS embeddings_model_idx ON embeddings (model);
CREATE INDEX IF NOT EXISTS embeddings_hnsw_idx ON embeddings USING hnsw (embedding vector_cosine_ops);

-- ─── clusters (groups of similar feedback) ───────────────────

CREATE TABLE IF NOT EXISTS clusters (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  title            text,
  summary          text,
  feedback_count   integer NOT NULL DEFAULT 0,
  confidence_score double precision NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'new',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE clusters ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS clusters_user_created_idx ON clusters (user_id, created_at DESC);

-- ─── cluster_feedback (cluster ↔ feedback links) ─────────────

CREATE TABLE IF NOT EXISTS cluster_feedback (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id       uuid NOT NULL REFERENCES clusters (id) ON DELETE CASCADE,
  feedback_id      uuid NOT NULL REFERENCES feedback (id) ON DELETE CASCADE,
  similarity_score double precision,
  created_at       timestamptz NOT NULL DEFAULT now()
);

DELETE FROM cluster_feedback a
USING cluster_feedback b
WHERE a.cluster_id = b.cluster_id
  AND a.feedback_id = b.feedback_id
  AND a.ctid > b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS cluster_feedback_uniq ON cluster_feedback (cluster_id, feedback_id);
CREATE INDEX IF NOT EXISTS cluster_feedback_feedback_idx ON cluster_feedback (feedback_id);

-- ─── documents (BRD / PRD / story / task — JSONB content) ────

CREATE TABLE IF NOT EXISTS documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES clusters (id) ON DELETE CASCADE,
  user_id    uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  type       text NOT NULL,
  title      text,
  content    jsonb NOT NULL DEFAULT '{}'::jsonb,
  version    integer NOT NULL DEFAULT 1,
  parent_id  uuid REFERENCES documents (id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

-- Backfill ownership of existing documents from their cluster.
UPDATE documents d
SET user_id = c.user_id
FROM clusters c
WHERE d.cluster_id = c.id
  AND d.user_id IS NULL
  AND c.user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS documents_cluster_type_idx ON documents (cluster_id, type);
CREATE INDEX IF NOT EXISTS documents_user_idx ON documents (user_id);
CREATE INDEX IF NOT EXISTS documents_parent_idx ON documents (parent_id);

-- ─── approvals (human review log) ────────────────────────────

CREATE TABLE IF NOT EXISTS approvals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  approved         boolean NOT NULL,
  reviewed_by      text NOT NULL,     -- auth user id of the reviewer
  review_notes     text,
  original_content jsonb,
  edited_content   jsonb,
  reviewed_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_document_idx ON approvals (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS approvals_reviewer_idx ON approvals (reviewed_by);

-- ─── integrations (Jira etc. — per user) ─────────────────────

CREATE TABLE IF NOT EXISTS integrations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  type       text NOT NULL,
  name       text NOT NULL,
  api_key    text,
  api_url    text,
  project_id text,
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS integrations_user_idx ON integrations (user_id, type);

-- ─── ticket_links (published external tickets) ───────────────

CREATE TABLE IF NOT EXISTS ticket_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  integration_id  uuid NOT NULL REFERENCES integrations (id) ON DELETE CASCADE,
  external_id     text NOT NULL,
  external_url    text,
  external_status text,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

DELETE FROM ticket_links a
USING ticket_links b
WHERE a.document_id = b.document_id
  AND a.integration_id = b.integration_id
  AND a.ctid > b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS ticket_links_doc_integration_uniq ON ticket_links (document_id, integration_id);

-- ─── updated_at triggers ─────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles', 'clusters', 'documents', 'integrations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;

-- ─── Similarity functions ────────────────────────────────────
-- Drop every existing overload first so PostgREST never sees an
-- ambiguous call after the signature change.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.proname IN ('match_feedback', 'match_tickets')
      AND p.pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END;
$$;

-- Feedback most similar to a query vector, for one user and one model.
CREATE FUNCTION match_feedback(
  query_embedding vector(768),
  match_count     int     DEFAULT 10,
  match_threshold float   DEFAULT 0.5,
  filter_user_id  uuid    DEFAULT NULL,
  filter_model    text    DEFAULT 'gemini-embedding-001'
)
RETURNS TABLE (feedback_id uuid, content text, source text, similarity float)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.id,
    f.content::text,
    f.source::text,
    (1 - (e.embedding <=> query_embedding))::float AS similarity
  FROM embeddings e
  JOIN feedback f ON f.id = e.feedback_id
  WHERE (filter_user_id IS NULL OR f.user_id = filter_user_id)
    AND e.model = filter_model
    AND 1 - (e.embedding <=> query_embedding) >= match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Published tickets whose cluster feedback is similar to a query vector.
-- One row per ticket (best-matching feedback item decides its score).
CREATE FUNCTION match_tickets(
  query_embedding vector(768),
  match_count     int   DEFAULT 5,
  match_threshold float DEFAULT 0.80,
  filter_user_id  uuid  DEFAULT NULL,
  filter_model    text  DEFAULT 'gemini-embedding-001'
)
RETURNS TABLE (
  ticket_link_id  uuid,
  document_id     uuid,
  external_id     text,
  external_url    text,
  external_status text,
  document_title  text,
  document_type   text,
  cluster_id      uuid,
  similarity      float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    tl.id,
    tl.document_id,
    tl.external_id::text,
    tl.external_url::text,
    tl.external_status::text,
    d.title::text,
    d.type::text,
    d.cluster_id,
    MAX(1 - (e.embedding <=> query_embedding))::float AS similarity
  FROM ticket_links tl
  JOIN documents d         ON d.id = tl.document_id
  JOIN cluster_feedback cf ON cf.cluster_id = d.cluster_id
  JOIN embeddings e        ON e.feedback_id = cf.feedback_id AND e.model = filter_model
  WHERE (filter_user_id IS NULL OR d.user_id = filter_user_id)
  GROUP BY tl.id, tl.document_id, tl.external_id, tl.external_url,
           tl.external_status, d.title, d.type, d.cluster_id
  HAVING MAX(1 - (e.embedding <=> query_embedding)) >= match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Only the backend (service_role) may call these.
REVOKE ALL ON FUNCTION match_feedback(vector, int, float, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION match_tickets(vector, int, float, uuid, text) FROM PUBLIC, anon, authenticated;

-- ─── Row Level Security ──────────────────────────────────────
-- App tables: RLS on with NO policies → unreachable with the anon key,
-- fully accessible to the backend's service_role key.

ALTER TABLE feedback         ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_links     ENABLE ROW LEVEL SECURITY;

-- profiles: each signed-in user can read and write only their own row.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ─── Avatar storage ──────────────────────────────────────────
-- Public-read bucket; users may only write files under "<their uid>/".

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
