import prisma, { assertDatabase } from "../../lib/db";
import { requireUser } from "../../lib/authOptions";
import { extractDocumentText } from "../../lib/extract";
import { chunkText } from "../../lib/chunker";
import { applySafeCors, clientKey, rateLimit } from "../../lib/http";
import { AppError, sendJsonError } from "../../lib/errors";

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
    rateLimit(`process:${clientKey(req)}`, { limit: 15 });
    const user = await requireUser(req, res);
    await assertDatabase();

    const documentId = req.body?.documentId;
    if (!documentId) {
      throw new AppError("documentId is required.", { status: 400, code: "MISSING_DOCUMENT" });
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, userId: user.id },
    });
    if (!document) {
      throw new AppError("Document not found.", { status: 404, code: "NOT_FOUND" });
    }

    const extracted = await extractDocumentText({
      storagePath: document.storagePath,
      fileType: document.fileType,
    });
    const chunks = chunkText(extracted.text);

    return res.status(200).json({
      documentId: document.id,
      name: document.name,
      fileType: document.fileType,
      characters: extracted.text.length,
      pages: extracted.pages,
      chunkCount: chunks.length,
      preview: extracted.text.slice(0, 400),
    });
  } catch (error) {
    return sendJsonError(res, error);
  }
}
