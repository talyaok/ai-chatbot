-- Optional reference: enable pgvector on PostgreSQL.
-- This project stores embeddings in PostgreSQL using pgvector.
-- Keep this file if you later add a pgvector fallback.
CREATE EXTENSION IF NOT EXISTS vector;
