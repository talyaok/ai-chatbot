const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_OVERLAP = 100;

function splitParagraphs(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .split(/\n{2,}/)
    .map((part) => part.replace(/[ \t]+\n/g, "\n").trim())
    .filter(Boolean);
}

function splitSentences(text) {
  const pieces = text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/);
  return pieces.map((part) => part.trim()).filter(Boolean);
}

function pushChunk(chunks, buffer, chunkSize) {
  const value = buffer.trim();
  if (!value) return "";
  if (value.length <= chunkSize) {
    chunks.push(value);
    return "";
  }

  let remaining = value;
  while (remaining.length > chunkSize) {
    let end = remaining.lastIndexOf(" ", chunkSize);
    if (end < chunkSize * 0.6) end = chunkSize;
    chunks.push(remaining.slice(0, end).trim());
    const overlapStart = Math.max(0, end - DEFAULT_OVERLAP);
    remaining = remaining.slice(overlapStart).trim();
  }
  return remaining;
}

export function chunkText(text, { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = {}) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return [];

  const chunks = [];
  let buffer = "";

  const paragraphs = splitParagraphs(cleaned);
  const units = paragraphs.length ? paragraphs : [cleaned];

  for (const unit of units) {
    if (unit.length > chunkSize) {
      const sentences = splitSentences(unit);
      const parts = sentences.length ? sentences : [unit];
      for (const sentence of parts) {
        if (!buffer) {
          buffer = sentence;
        } else if (`${buffer}\n\n${sentence}`.length <= chunkSize) {
          buffer = `${buffer}\n\n${sentence}`;
        } else if (`${buffer} ${sentence}`.length <= chunkSize) {
          buffer = `${buffer} ${sentence}`;
        } else {
          const leftover = pushChunk(chunks, buffer, chunkSize);
          buffer = leftover ? `${leftover} ${sentence}`.trim() : sentence;
        }
      }
    } else if (!buffer) {
      buffer = unit;
    } else if (`${buffer}\n\n${unit}`.length <= chunkSize) {
      buffer = `${buffer}\n\n${unit}`;
    } else {
      const leftover = pushChunk(chunks, buffer, chunkSize);
      buffer = leftover ? `${leftover}\n\n${unit}`.trim() : unit;
    }
  }

  if (buffer.trim()) {
    const leftover = pushChunk(chunks, buffer, chunkSize);
    if (leftover) chunks.push(leftover);
  }

  return chunks.map((chunk, index) => {
    if (index === 0 || overlap <= 0) {
      return { index, text: chunk, overlapFromPrevious: 0 };
    }
    return { index, text: chunk, overlapFromPrevious: overlap };
  });
}

export { DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP };
