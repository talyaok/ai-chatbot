import Anthropic from "@anthropic-ai/sdk";
import { AppError, isPermanentError, isTransientError, sleep } from "./errors";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

let client;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AppError("ANTHROPIC_API_KEY is not configured.", {
      status: 500,
      code: "MISSING_API_KEY",
    });
  }
  if (!client) {
    client = new Anthropic({
      apiKey,
      timeout: DEFAULT_TIMEOUT_MS,
      maxRetries: 0,
    });
  }
  return client;
}

function defaultModel() {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
}

function defaultMaxTokens(options = {}) {
  if (Number.isFinite(options.maxTokens)) return options.maxTokens;
  const fromEnv = Number(process.env.ANTHROPIC_MAX_TOKENS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 1024;
}

export function normalizeClaudeMessages(messages) {
  const normalized = [];

  for (const message of messages || []) {
    if (!message || !message.role) continue;
    const role = message.role === "assistant" ? "assistant" : "user";
    const content = message.content;

    if (Array.isArray(content)) {
      const blocks = content.filter(Boolean);
      if (!blocks.length) continue;
      if (normalized.length && normalized[normalized.length - 1].role === role) {
        const prev = normalized[normalized.length - 1];
        prev.content = [...(Array.isArray(prev.content) ? prev.content : [{ type: "text", text: String(prev.content) }]), ...blocks];
      } else {
        normalized.push({ role, content: blocks });
      }
      continue;
    }

    const text = String(content || "").trim();
    if (!text) continue;

    if (normalized.length && normalized[normalized.length - 1].role === role) {
      const prev = normalized[normalized.length - 1];
      if (Array.isArray(prev.content)) {
        prev.content.push({ type: "text", text });
      } else {
        prev.content = `${prev.content}\n\n${text}`;
      }
    } else {
      normalized.push({ role, content: text });
    }
  }

  while (normalized.length && normalized[0].role !== "user") {
    normalized.shift();
  }

  return normalized;
}

function mapAnthropicError(error) {
  if (error instanceof AppError) return error;
  if (error?.name === "AbortError") {
    return new AppError("Generation was cancelled.", { status: 499, code: "ABORT" });
  }
  const status = error?.status || error?.statusCode;
  if (status === 401) {
    return new AppError("Anthropic rejected the API key.", { status: 502, code: "INVALID_API_KEY" });
  }
  if (status === 429) {
    return new AppError("Anthropic rate limit reached. Try again shortly.", {
      status: 429,
      code: "RATE_LIMIT",
    });
  }
  if (status === 400) {
    return new AppError("The AI request was rejected as invalid.", { status: 400, code: "BAD_REQUEST" });
  }
  if (isTransientError(error)) {
    return new AppError("The AI service is temporarily unavailable.", {
      status: 503,
      code: "AI_UNAVAILABLE",
    });
  }
  return new AppError("The AI service failed to generate a response.", {
    status: 502,
    code: "AI_ERROR",
  });
}

async function withRetry(operation) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (isPermanentError(error) || error?.name === "AbortError") {
        throw mapAnthropicError(error);
      }
      if (!isTransientError(error) || attempt === MAX_RETRIES) {
        throw mapAnthropicError(error);
      }
      await sleep(400 * 2 ** attempt);
    }
  }
  throw mapAnthropicError(lastError);
}

function buildParams(messages, systemPrompt, options = {}) {
  const normalized = normalizeClaudeMessages(messages);
  if (!normalized.length) {
    throw new AppError("At least one user message is required.", { status: 400, code: "EMPTY_MESSAGES" });
  }

  return {
    model: options.model || defaultModel(),
    max_tokens: defaultMaxTokens(options),
    temperature: Number.isFinite(options.temperature) ? options.temperature : 0.3,
    system: systemPrompt,
    messages: normalized,
  };
}

export async function chatWithAI(messages, systemPrompt, options = {}) {
  const anthropic = getClient();
  const params = buildParams(messages, systemPrompt, options);

  const response = await withRetry(() =>
    anthropic.messages.create(params, {
      signal: options.signal,
      timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    })
  );

  const text = (response.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return text;
}

export async function streamChatWithAI(messages, systemPrompt, res, options = {}) {
  const anthropic = getClient();
  const params = buildParams(messages, systemPrompt, options);
  let assembled = "";
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const stream = anthropic.messages.stream(params, {
        signal: options.signal,
        timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const text = event.delta.text || "";
          if (!text) continue;
          assembled += text;
          if (typeof options.onText === "function") {
            options.onText(text, assembled);
          }
          if (res) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
            if (typeof res.flush === "function") res.flush();
          }
        }
      }

      await stream.finalMessage();
      return assembled;
    } catch (error) {
      lastError = error;
      if (assembled || isPermanentError(error) || error?.name === "AbortError") {
        throw mapAnthropicError(error);
      }
      if (!isTransientError(error) || attempt === MAX_RETRIES) {
        throw mapAnthropicError(error);
      }
      await sleep(400 * 2 ** attempt);
    }
  }

  throw mapAnthropicError(lastError);
}
