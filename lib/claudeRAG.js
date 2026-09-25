import { RAG_SYSTEM_PROMPT, buildRagUserPrompt } from "./prompts";
import { createEmbedding } from "./embedder";
import { searchByEmbedding } from "./vectorSearch";
import { chatWithAI, streamChatWithAI } from "./ai";
import { AppError } from "./errors";

const MIN_USEFUL_SCORE = 0.22;

function usefulSources(sources) {
  return (sources || []).filter((source) => {
    if (!source?.text) return false;
    if (typeof source.distance !== "number") return true;
    return 1 - source.distance >= MIN_USEFUL_SCORE || source.distance <= 0.78;
  });
}

export async function retrieveSources({ question, documentId, userId, topK = 5 }) {
  const embedding = await createEmbedding(question);
  const matches = await searchByEmbedding(embedding, { topK, documentId, userId });
  return usefulSources(matches).slice(0, topK);
}

export function buildGroundedMessages({ question, sources, history = [] }) {
  const grounded = buildRagUserPrompt({ question, sources });
  return [
    ...history,
    {
      role: "user",
      content: grounded,
    },
  ];
}

export async function answerWithRag({ question, documentId, userId, history = [], options = {} }) {
  const sources = await retrieveSources({ question, documentId, userId });
  if (!sources.length) {
    return {
      text: "I could not find relevant information in the selected document for that question.",
      sources: [],
    };
  }

  const messages = buildGroundedMessages({ question, sources, history });
  const text = await chatWithAI(messages, RAG_SYSTEM_PROMPT, options);
  return { text, sources };
}

export async function streamAnswerWithRag({
  question,
  documentId,
  userId,
  history = [],
  res,
  options = {},
}) {
  const sources = await retrieveSources({ question, documentId, userId });
  if (!sources.length) {
    const text = "I could not find relevant information in the selected document for that question.";
    if (res) {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
      if (typeof res.flush === "function") res.flush();
    }
    return { text, sources: [] };
  }

  const messages = buildGroundedMessages({ question, sources, history });
  const text = await streamChatWithAI(messages, RAG_SYSTEM_PROMPT, res, options);
  return { text, sources };
}

export function requireQuestion(question) {
  const value = String(question || "").trim();
  if (!value) {
    throw new AppError("A question is required.", { status: 400, code: "EMPTY_QUESTION" });
  }
  return value;
}
