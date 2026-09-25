import prisma, { assertDatabase } from "../../../lib/db";
import { requireUser } from "../../../lib/authOptions";
import { answerWithRag, requireQuestion } from "../../../lib/claudeRAG";
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
    rateLimit(`ask:${clientKey(req)}`);
    const user = await requireUser(req, res);
    await assertDatabase();

    const documentId = req.body?.documentId;
    const question = requireQuestion(req.body?.question || req.body?.message);
    if (!documentId) {
      throw new AppError("documentId is required.", { status: 400, code: "MISSING_DOCUMENT" });
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, userId: user.id },
    });
    if (!document) {
      throw new AppError("Document not found.", { status: 404, code: "NOT_FOUND" });
    }
    if (document.status !== "processed") {
      throw new AppError("This document is not ready for questions yet.", {
        status: 400,
        code: "DOCUMENT_NOT_READY",
      });
    }

    const result = await answerWithRag({
      question,
      documentId,
      userId: user.id,
    });

    return res.status(200).json({
      documentId,
      question,
      text: result.text,
      sources: result.sources,
    });
  } catch (error) {
    return sendJsonError(res, error);
  }
}
