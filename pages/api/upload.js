import fs from "fs/promises";
import prisma, { assertDatabase } from "../../lib/db";
import { requireUser } from "../../lib/authOptions";
import { parseForm, firstFile } from "../../lib/form";
import {
  detectDocumentType,
  persistUploadBuffer,
  validateDocumentSize,
  MAX_DOCUMENT_BYTES,
} from "../../lib/fileValidation";
import { applySafeCors, clientKey, rateLimit } from "../../lib/http";
import { AppError, sendJsonError } from "../../lib/errors";
import { ingestDocument } from "../../lib/ingest";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  applySafeCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    rateLimit(`upload:${clientKey(req)}`, { limit: 20 });
    const user = await requireUser(req, res);
    await assertDatabase();

    const { files } = await parseForm(req, { maxFileSize: MAX_DOCUMENT_BYTES });
    const file = firstFile(files, "file");
    if (!file) {
      throw new AppError("A file is required.", { status: 400, code: "MISSING_FILE" });
    }

    const originalName = file.originalFilename || file.newFilename || "upload";
    const size = file.size || 0;
    validateDocumentSize(size);

    const buffer = await fs.readFile(file.filepath);
    await fs.unlink(file.filepath).catch(() => {});

    const fileType = detectDocumentType(originalName, file.mimetype, buffer);
    const storagePath = await persistUploadBuffer(buffer, originalName);

    const document = await prisma.document.create({
      data: {
        userId: user.id,
        name: originalName.replace(/\.[^.]+$/, "") || originalName,
        originalName,
        fileType,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: size,
        storagePath,
        status: "uploaded",
      },
    });

    const result = await ingestDocument({
      document,
      userId: user.id,
      buffer,
    });

    return res.status(201).json({
      document: result.document,
      chunkCount: result.chunkCount,
      characters: result.characters,
      pages: result.pages,
      message: result.message,
    });
  } catch (error) {
    if (error?.code === "LIMIT_FILE_SIZE") {
      return sendJsonError(
        res,
        new AppError("File is too large. Maximum size is 10MB.", { status: 413, code: "FILE_TOO_LARGE" })
      );
    }
    return sendJsonError(res, error);
  }
}
