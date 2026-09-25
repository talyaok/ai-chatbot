-- Optional reference: enable pgvector on PostgreSQL.
-- This project stores embeddings in Chroma, not PostgreSQL.
-- Keep this file if you later add a pgvector fallback.
CREATE EXTENSION IF NOT EXISTS vector;
