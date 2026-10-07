import OpenAI from "openai";
import { AppError, isPermanentError, isTransientError, sleep } from "./errors";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const MAX_INPUT_CHARS = 8000;

let client;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AppError("OPENAI_API_KEY is not configured.", {
      status: 500,
      code: "MISSING_API_KEY",
    });
  }
  if (!client) {
    client = new OpenAI({
      apiKey,
      timeout: DEFAULT_TIMEOUT_MS,
      maxRetries: 0,
    });
  }
  return client;
}

function embeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
}

function mapEmbeddingError(error) {
  if (error instanceof AppError) return error;
  const status = error?.status || error?.statusCode;
  if (status === 401) {
    return new AppError("OpenAI rejected the API key.", { status: 502, code: "INVALID_API_KEY" });
  }
  if (status === 429) {
    return new AppError("OpenAI rate limit reached while creating embeddings.", {
      status: 429,
      code: "RATE_LIMIT",
    });
  }
  return new AppError("Failed to create embeddings.", { status: 502, code: "EMBEDDING_ERROR" });
}

async function withRetry(operation) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (isPermanentError(error) || error?.name === "AbortError") {
        throw mapEmbeddingError(error);
      }
      if (!isTransientError(error) || attempt === MAX_RETRIES) {
        throw mapEmbeddingError(error);
      }
      await sleep(400 * 2 ** attempt);
    }
  }
  throw mapEmbeddingError(lastError);
}

export async function createEmbedding(text) {
  const value = String(text || "").trim();
  if (!value) {
    throw new AppError("Cannot embed empty text.", { status: 400, code: "EMPTY_TEXT" });
  }

  const openai = getClient();
  const response = await withRetry(() =>
    openai.embeddings.create({
      model: embeddingModel(),
      input: value.slice(0, MAX_INPUT_CHARS),
    })
  );

  const vector = response?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || !vector.length) {
    throw new AppError("OpenAI returned an empty embedding.", { status: 502, code: "EMBEDDING_ERROR" });
  }
  return vector;
}

export async function createEmbeddings(texts, { batchSize = 20 } = {}) {
  const openai = getClient();

  const inputs = (texts || []).map((text) =>
    String(text || "").trim().slice(0, MAX_INPUT_CHARS)
  );

  if (inputs.some((text) => !text)) {
    throw new AppError("Cannot embed empty text.", {
      status: 400,
      code: "EMPTY_TEXT",
    });
  }

  // Deduplicate identical text so the same content is not embedded
  // more than once during the same ingestion operation.
  const uniqueInputs = [...new Set(inputs)];
  const embeddingCache = new Map();

  for (let i = 0; i < uniqueInputs.length; i += batchSize) {
    const batch = uniqueInputs.slice(i, i + batchSize);

    const response = await withRetry(() =>
      openai.embeddings.create({
        model: embeddingModel(),
        input: batch,
      })
    );

    const ordered = [...(response.data || [])].sort(
      (a, b) => a.index - b.index
    );

    if (ordered.length !== batch.length) {
      throw new AppError("OpenAI returned an unexpected number of embeddings.", {
        status: 502,
        code: "EMBEDDING_ERROR",
      });
    }

    ordered.forEach((item, index) => {
      if (!Array.isArray(item.embedding) || !item.embedding.length) {
        throw new AppError("OpenAI returned an empty embedding.", {
          status: 502,
          code: "EMBEDDING_ERROR",
        });
      }

      embeddingCache.set(batch[index], item.embedding);
    });
  }

  return inputs.map((text) => embeddingCache.get(text));
}
