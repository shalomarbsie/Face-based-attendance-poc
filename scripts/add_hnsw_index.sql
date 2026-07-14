-- Production migration: add HNSW index on face_embeddings.embedding
--
-- Run this manually against the production database BEFORE deploying
-- the application code that expects the index to exist.
--
-- CONCURRENTLY builds the index without locking the table, so it can
-- run against a live database with active connections. It takes longer
-- than a standard CREATE INDEX but does not block reads or writes.
--
-- Usage:
--   docker exec -i <postgres_container> psql -U attendance -d attendance_db \
--     < scripts/add_hnsw_index.sql
--
-- Must be run outside a transaction block (psql does this automatically
-- when you pipe a file). Do NOT wrap this in BEGIN/COMMIT.

-- Verify pgvector version supports HNSW (requires 0.5.0+)
SELECT extversion AS pgvector_version FROM pg_extension WHERE extname = 'vector';

-- Create the index (safe to run multiple times — IF NOT EXISTS)
CREATE INDEX CONCURRENTLY IF NOT EXISTS face_embeddings_embedding_hnsw_idx
ON face_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Verify the index was created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'face_embeddings'
  AND indexname = 'face_embeddings_embedding_hnsw_idx';