import { AppError } from "./errors";

const buckets = new Map();

export function rateLimit(key, { limit = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const bucket = buckets.get(key) || [];
  const recent = bucket.filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    throw new AppError("Too many requests. Please wait a moment.", {
      status: 429,
      code: "RATE_LIMIT",
    });
  }
  recent.push(now);
  buckets.set(key, recent);
}

export function clientKey(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

export function setSseHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
}

export function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  if (typeof res.flush === "function") res.flush();
}

export function applySafeCors(req, res) {
  const origin = req.headers.origin;
  const allowed = (process.env.ALLOWED_ORIGINS || process.env.NEXTAUTH_URL || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!origin) return;
  if (allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
}

export function parseImagePayload(image) {
  if (!image) return null;
  const mediaType = String(image.mediaType || image.media_type || "").toLowerCase();
  const data = String(image.data || "").replace(/^data:[^;]+;base64,/, "");
  if (!mediaType || !data) {
    throw new AppError("Image data is incomplete.", { status: 400, code: "INVALID_IMAGE" });
  }
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) {
    throw new AppError("Unsupported image type.", { status: 400, code: "UNSUPPORTED_IMAGE" });
  }
  const size = Math.ceil((data.length * 3) / 4);
  if (size > 4 * 1024 * 1024) {
    throw new AppError("Image is too large. Maximum size is 4MB.", {
      status: 413,
      code: "FILE_TOO_LARGE",
    });
  }
  return { mediaType, data };
}

export function imageContentBlocks(text, image) {
  const blocks = [];
  if (image) {
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType,
        data: image.data,
      },
    });
  }
  blocks.push({
    type: "text",
    text: text || (image ? "Please analyze this image." : ""),
  });
  return blocks;
}

export function chatMode({ documentId, image }) {
  if (image) return "image";
  if (documentId) return "rag";
  return "general";
}
