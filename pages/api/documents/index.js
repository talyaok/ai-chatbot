import prisma, { assertDatabase } from "../../../lib/db";
import { requireUser } from "../../../lib/authOptions";
import { applySafeCors } from "../../../lib/http";
import { sendJsonError } from "../../../lib/errors";

export default async function handler(req, res) {
  applySafeCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req, res);
    await assertDatabase();
    const documents = await prisma.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        originalName: true,
        fileType: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        errorMessage: true,
        chunkCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return res.status(200).json({ documents });
  } catch (error) {
    return sendJsonError(res, error);
  }
}
