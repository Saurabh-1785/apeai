-- =============================================================
-- ApeAI — match_tickets (standalone migration)
--
-- Same definition as in ../schema.sql. Run this on its own only if you
-- already applied schema.sql before match_tickets was added/fixed.
--
-- Fixes vs. the original draft:
--   * one row per ticket (MAX similarity) instead of one row per
--     feedback embedding, which produced duplicates and ate the LIMIT
--   * scoped to a user (filter_user_id) and to one embedding model
-- =============================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.proname = 'match_tickets'
      AND p.pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END;
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

REVOKE ALL ON FUNCTION match_tickets(vector, int, float, uuid, text) FROM PUBLIC, anon, authenticated;
