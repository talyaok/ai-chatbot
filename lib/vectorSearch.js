import { ChromaClient } from "chromadb";
import { AppError } from "./errors";

function collectionName() {
  return process.env.CHROMA_COLLECTION || "smart_chatbot_chunks";
}

let cachedClient;
let cachedCollection;

class ExplicitEmbeddingFunction {
  async generate() {
    throw new AppError("Chroma was asked to embed text locally. This project uses OpenAI embeddings instead.", {
      status: 500,
      code: "CHROMA_EMBEDDING_MISUSE",
    });
  }
}

function chromaUrl() {
  return process.env.CHROMA_URL || "http://localhost:8000";
}

function wrapChromaError(error, fallbackMessage) {
  if (error instanceof AppError) return error;
  const wrapped = new AppError(fallbackMessage, {
    status: 503,
    code: "CHROMA_UNAVAILABLE",
  });
  wrapped.cause = error;
  return wrapped;
}

async function getClient() {
  if (cachedClient) return cachedClient;
  try {
    cachedClient = new ChromaClient({ path: chromaUrl() });
    await cachedClient.heartbeat();
    return cachedClient;
  } catch (error) {
    cachedClient = null;
    throw wrapChromaError(
      error,
      `Chroma is unavailable at ${chromaUrl()}. Start Chroma or set CHROMA_URL.`
    );
  }
}

async function getCollection() {
  if (cachedCollection) return cachedCollection;
  const client = await getClient();
  try {
    cachedCollection = await client.getOrCreateCollection({
      name: collectionName(),
      metadata: { "hnsw:space": "cosine", source: "finlatics-smart-chatbot" },
      embeddingFunction: new ExplicitEmbeddingFunction(),
    });
    return cachedCollection;
  } catch (error) {
    cachedCollection = null;
    throw wrapChromaError(error, "Could not open the Chroma collection.");
  }
}

export function chunkVectorId(documentId, chunkIndex) {
  return `${documentId}:${chunkIndex}`;
}

export async function addChunks(chunks) {
  if (!chunks?.length) return { added: 0 };
  const collection = await getCollection();

  try {
    await collection.add({
      ids: chunks.map((chunk) => chunk.id),
      embeddings: chunks.map((chunk) => chunk.embedding),
      documents: chunks.map((chunk) => chunk.text),
      metadatas: chunks.map((chunk) => ({
        documentId: String(chunk.documentId),
        documentName: String(chunk.documentName || "Untitled"),
        chunkIndex: Number(chunk.chunkIndex),
        userId: String(chunk.userId || ""),
      })),
    });
  } catch (error) {
    throw wrapChromaError(error, "Failed to store document chunks in Chroma.");
  }

  return { added: chunks.length };
}

export async function searchByEmbedding(embedding, { topK = 5, documentId, userId } = {}) {
  if (!Array.isArray(embedding) || !embedding.length) {
    throw new AppError("A query embedding is required for vector search.", {
      status: 400,
      code: "EMPTY_EMBEDDING",
    });
  }

  const collection = await getCollection();
  const where = {};
  if (documentId) where.documentId = String(documentId);
  if (userId) where.userId = String(userId);

  let result;
  try {
    result = await collection.query({
      queryEmbeddings: [embedding],
      nResults: topK,
      where: Object.keys(where).length ? where : undefined,
    });
  } catch (error) {
    throw wrapChromaError(error, "Failed to search Chroma.");
  }

  const ids = result.ids?.[0] || [];
  const documents = result.documents?.[0] || [];
  const metadatas = result.metadatas?.[0] || [];
  const distances = result.distances?.[0] || [];

  return ids.map((id, index) => ({
    id,
    text: documents[index] || "",
    documentId: metadatas[index]?.documentId,
    documentName: metadatas[index]?.documentName,
    chunkIndex: Number(metadatas[index]?.chunkIndex),
    distance: distances[index],
  })).filter((item) => item.text);
}

export async function search(queryEmbedding, options) {
  return searchByEmbedding(queryEmbedding, options);
}

export async function deleteDocumentChunks(documentId) {
  const collection = await getCollection();
  try {
    await collection.delete({
      where: { documentId: String(documentId) },
    });
  } catch (error) {
    throw wrapChromaError(error, "Failed to delete document chunks from Chroma.");
  }
}

export async function pingChroma() {
  await getClient();
  return { ok: true, url: chromaUrl(), collection: collectionName() };
}
