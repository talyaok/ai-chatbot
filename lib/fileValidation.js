import fs from "fs/promises";
import os from "os";
import path from "path";
import { AppError } from "./errors";

const UPLOAD_ROOT = process.env.VERCEL
  ? path.join(os.tmpdir(), "aether-uploads")
  : path.join(process.cwd(), "uploads");

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const DOCUMENT_TYPES = {
  pdf: {
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
    magic: (buffer) => buffer.slice(0, 4).toString("utf8") === "%PDF",
  },
  txt: {
    extensions: [".txt"],
    mimeTypes: ["text/plain"],
    magic: (buffer) => !containsNul(buffer),
  },
  md: {
    extensions: [".md", ".markdown"],
    mimeTypes: ["text/markdown", "text/plain"],
    magic: (buffer) => !containsNul(buffer),
  },
};

const IMAGE_TYPES = {
  "image/jpeg": {
    extensions: [".jpg", ".jpeg"],
    magic: (buffer) => buffer.length > 2 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  "image/png": {
    extensions: [".png"],
    magic: (buffer) =>
      buffer.length > 7 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47,
  },
  "image/webp": {
    extensions: [".webp"],
    magic: (buffer) =>
      buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP",
  },
  "image/gif": {
    extensions: [".gif"],
    magic: (buffer) => buffer.slice(0, 3).toString("ascii") === "GIF",
  },
};

function containsNul(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  return sample.includes(0);
}

function extensionOf(filename = "") {
  const base = path.basename(String(filename));
  const ext = path.extname(base).toLowerCase();
  return ext;
}

function safeBaseName(filename = "") {
  const base = path.basename(String(filename)).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "upload";
}

export function detectDocumentType(filename, mimeType, buffer) {
  const ext = extensionOf(filename);
  const mime = String(mimeType || "").toLowerCase();

  for (const [fileType, config] of Object.entries(DOCUMENT_TYPES)) {
    const extMatch = config.extensions.includes(ext);
    const mimeMatch = config.mimeTypes.includes(mime);
    if ((extMatch || mimeMatch) && config.magic(buffer)) {
      return fileType;
    }
  }

  throw new AppError("Unsupported file type. Upload a PDF, TXT, or Markdown file.", {
    status: 400,
    code: "UNSUPPORTED_TYPE",
  });
}

export function detectImageType(filename, mimeType, buffer) {
  const ext = extensionOf(filename);
  const claimed = String(mimeType || "").toLowerCase();

  for (const [mediaType, config] of Object.entries(IMAGE_TYPES)) {
    const extMatch = config.extensions.includes(ext);
    const mimeMatch = claimed === mediaType;
    if ((extMatch || mimeMatch) && config.magic(buffer)) {
      return mediaType;
    }
  }

  for (const [mediaType, config] of Object.entries(IMAGE_TYPES)) {
    if (config.magic(buffer)) return mediaType;
  }

  throw new AppError("Unsupported image type. Use JPEG, PNG, WEBP, or GIF.", {
    status: 400,
    code: "UNSUPPORTED_IMAGE",
  });
}

export async function persistUploadBuffer(buffer, filename) {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  const storedName = `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeBaseName(filename)}`;
  const storagePath = path.join(UPLOAD_ROOT, storedName);
  await fs.writeFile(storagePath, buffer);
  return storagePath;
}

export async function readStoredFile(storagePath) {
  const resolved = path.resolve(storagePath);
  const root = path.resolve(UPLOAD_ROOT);
  if (!resolved.startsWith(root)) {
    throw new AppError("Invalid stored file path.", { status: 400, code: "INVALID_PATH" });
  }
  return fs.readFile(resolved);
}

export async function deleteStoredFile(storagePath) {
  try {
    const resolved = path.resolve(storagePath);
    const root = path.resolve(UPLOAD_ROOT);
    if (!resolved.startsWith(root)) return;
    await fs.unlink(resolved);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export function validateDocumentSize(size) {
  if (!size || size <= 0) {
    throw new AppError("The uploaded file is empty.", { status: 400, code: "EMPTY_FILE" });
  }
  if (size > MAX_DOCUMENT_BYTES) {
    throw new AppError("File is too large. Maximum size is 10MB.", { status: 413, code: "FILE_TOO_LARGE" });
  }
}

export function validateImageSize(size) {
  if (!size || size <= 0) {
    throw new AppError("The image is empty.", { status: 400, code: "EMPTY_FILE" });
  }
  if (size > MAX_IMAGE_BYTES) {
    throw new AppError("Image is too large. Maximum size is 4MB.", { status: 413, code: "FILE_TOO_LARGE" });
  }
}
