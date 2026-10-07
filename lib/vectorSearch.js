import prisma from "./db";
import { AppError } from "./errors";

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SIMILARITY = 0.22;

function vectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length !== 1536) {
    throw new AppError("A valid 1536-dimensional embedding is required.", {
      status: 400,
      code: "INVALID_EMBEDDING",
    });
  }

  return `[${embedding.map((value) => Number(value)).join(",")}]`;
}

function minSimilarity() {
  const configured = Number(process.env.RAG_MIN_SIMILARITY);

  if (Number.isFinite(configured) && configured >= 0 && configured <= 1) {
    return configured;
  }

  return DEFAULT_MIN_SIMILARITY;
}

export function chunkVectorId(documentId, chunkIndex) {
  return `${documentId}:${chunkIndex}`;
}

export async function addChunks(chunks, { batchSize = 50 } = {}) {
  if (!chunks?.length) return { added: 0 };

  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const params = [];

    const values = batch.map((chunk, index) => {
      const base = index * 3;

      params.push(
        String(chunk.documentId),
        Number(chunk.chunkIndex),
        vectorLiteral(chunk.embedding)
      );

      return `($${base + 1}::text, $${base + 2}::integer, $${base + 3}::vector)`;
    });

    await prisma.$executeRawUnsafe(
      `
        UPDATE "DocumentChunk" AS dc
        SET "embedding" = incoming.embedding
        FROM (
          VALUES ${values.join(", ")}
        ) AS incoming("documentId", "chunkIndex", embedding)
        WHERE dc."documentId" = incoming."documentId"
          AND dc."chunkIndex" = incoming."chunkIndex"
      `,
      ...params
    );
  }

  return { added: chunks.length };
}

export async function searchByEmbedding(
  embedding,
  { topK = DEFAULT_TOP_K, documentId, userId, minScore = minSimilarity() } = {}
) {
  const queryVector = vectorLiteral(embedding);
  const safeTopK = Math.max(1, Math.min(Number(topK) || DEFAULT_TOP_K, 20));
  const safeMinScore = Math.max(0, Math.min(Number(minScore) || 0, 1));

  const conditions = [
    `"dc"."embedding" IS NOT NULL`,
    `(1 - ("dc"."embedding" <=> $1::vector)) >= $2`,
  ];

  const params = [queryVector, safeMinScore];
  let parameterIndex = 3;

  if (documentId) {
    conditions.push(`"dc"."documentId" = $${parameterIndex}`);
    params.push(String(documentId));
    parameterIndex += 1;
  }

  if (userId) {
    conditions.push(`"d"."userId" = $${parameterIndex}`);
    params.push(String(userId));
    parameterIndex += 1;
  }

  params.push(safeTopK);
  const limitParameter = parameterIndex;

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        "dc"."id",
        "dc"."text",
        "dc"."documentId",
        "dc"."chunkIndex",
        "d"."name" AS "documentName",
        ("dc"."embedding" <=> $1::vector) AS "distance",
        (1 - ("dc"."embedding" <=> $1::vector)) AS "score"
      FROM "DocumentChunk" AS "dc"
      INNER JOIN "Document" AS "d"
        ON "d"."id" = "dc"."documentId"
      WHERE ${conditions.join(" AND ")}
      ORDER BY "dc"."embedding" <=> $1::vector
      LIMIT $${limitParameter}
    `,
    ...params
  );

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    documentId: row.documentId,
    documentName: row.documentName,
    chunkIndex: Number(row.chunkIndex),
    distance: Number(row.distance),
    score: Number(row.score),
  }));
}

export async function search(queryEmbedding, options) {
  return searchByEmbedding(queryEmbedding, options);
}

export async function deleteDocumentChunks(documentId) {
  await prisma.$executeRawUnsafe(
    `
      UPDATE "DocumentChunk"
      SET "embedding" = NULL
      WHERE "documentId" = $1
    `,
    String(documentId)
  );
}

export async function pingVectorStore() {
  try {
    const result = await prisma.$queryRawUnsafe(
      `SELECT extversion FROM pg_extension WHERE extname = 'vector'`
    );

    return {
      ok: result.length > 0,
      provider: "pgvector",
      version: result[0]?.extversion || null,
    };
  } catch (error) {
    const wrapped = new AppError("PostgreSQL pgvector is unavailable.", {
      status: 503,
      code: "PGVECTOR_UNAVAILABLE",
    });
    wrapped.cause = error;
    throw wrapped;
  }
}
