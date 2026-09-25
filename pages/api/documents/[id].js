import prisma, { assertDatabase } from "../../../lib/db";
import { requireUser } from "../../../lib/authOptions";
import { deleteDocumentChunks } from "../../../lib/vectorSearch";
import { deleteStoredFile } from "../../../lib/fileValidation";
import { applySafeCors } from "../../../lib/http";
import { AppError, sendJsonError } from "../../../lib/errors";

export default async function handler(req, res) {
  applySafeCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const user = await requireUser(req, res);
    await assertDatabase();
    const { id } = req.query;

    const document = await prisma.document.findFirst({
      where: { id, userId: user.id },
    });
    if (!document) {
      throw new AppError("Document not found.", { status: 404, code: "NOT_FOUND" });
    }

    if (req.method === "GET") {
      return res.status(200).json({
        document: {
          id: document.id,
          name: document.name,
          originalName: document.originalName,
          fileType: document.fileType,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          status: document.status,
          errorMessage: document.errorMessage,
          chunkCount: document.chunkCount,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        },
      });
    }

    if (req.method === "DELETE") {
      await deleteDocumentChunks(document.id).catch(() => {});
      await deleteStoredFile(document.storagePath);
      await prisma.document.delete({ where: { id: document.id } });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return sendJsonError(res, error);
  }
}
