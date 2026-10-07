CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "DocumentChunk"
ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
ON "DocumentChunk"
USING hnsw ("embedding" vector_cosine_ops);

DROP INDEX IF EXISTS "DocumentChunk_chromaId_idx";

ALTER TABLE "DocumentChunk"
DROP COLUMN IF EXISTS "chromaId";
