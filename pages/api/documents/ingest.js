import prisma, { assertDatabase } from "../../../lib/db";
import { requireUser } from "../../../lib/authOptions";
import { ingestDocument } from "../../../lib/ingest";
import { applySafeCors, clientKey, rateLimit } from "../../../lib/http";
import { AppError, sendJsonError } from "../../../lib/errors";

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
    rateLimit(`ingest:${clientKey(req)}`, { limit: 10 });
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

    const result = await ingestDocument({ document, userId: user.id });
    return res.status(200).json(result);
  } catch (error) {
    return sendJsonError(res, error);
  }
}
