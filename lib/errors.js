export class AppError extends Error {
  constructor(message, { status = 500, code = "INTERNAL_ERROR", expose = true } = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.expose = expose;
  }
}

export function logError(context, error) {
  const safe = {
    context,
    message: error?.message,
    code: error?.code || error?.status,
    name: error?.name,
  };
  console.error("[smart-chatbot]", JSON.stringify(safe));
}

export function clientErrorMessage(error) {
  if (error instanceof AppError && error.expose) {
    return error.message;
  }

  const status = error?.status || error?.statusCode;
  const message = String(error?.message || "");

  if (error?.code === "DATABASE_UNAVAILABLE") {
    return "The database is unavailable. Please try again later.";
  }
  if (error?.code === "CHROMA_UNAVAILABLE") {
    return "The document search service is unavailable. Check that Chroma is running.";
  }
  if (error?.name === "AbortError" || error?.code === "ABORT") {
    return "Generation was cancelled.";
  }
  if (status === 401 || /invalid.?api.?key|authentication/i.test(message)) {
    return "The AI service rejected the API key. Ask the administrator to check server configuration.";
  }
  if (status === 429 || /rate.?limit/i.test(message)) {
    return "The AI service is rate-limited. Please wait a moment and try again.";
  }
  if (/timeout|timed out/i.test(message)) {
    return "The AI service timed out. Please try a shorter question.";
  }
  if (status === 400) {
    return "The request was invalid. Please check your input and try again.";
  }

  return "Something went wrong while generating a response. Please try again.";
}

export function sendJsonError(res, error) {
  const status = error instanceof AppError ? error.status : error?.status || 500;
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  logError("api", error);
  return res.status(safeStatus).json({
    error: clientErrorMessage(error),
    code: error?.code || "INTERNAL_ERROR",
  });
}

export function isTransientError(error) {
  const status = error?.status || error?.statusCode;
  if ([429, 500, 502, 503, 504, 529].includes(status)) return true;
  if (error?.code === "ETIMEDOUT" || error?.code === "ECONNRESET" || error?.code === "ECONNREFUSED") {
    return true;
  }
  const message = String(error?.message || "");
  return /network|fetch failed|socket|overloaded|temporarily/i.test(message);
}

export function isPermanentError(error) {
  const status = error?.status || error?.statusCode;
  if ([400, 401, 403, 404, 413, 422].includes(status)) return true;
  const message = String(error?.message || "");
  return /invalid.?api.?key|authentication|malformed/i.test(message);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
