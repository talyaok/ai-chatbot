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

  try {
    const user = await requireUser(req, res);
    await assertDatabase();

    if (req.method === "GET") {
      const documentId = req.query.documentId || null;
      const conversations = await prisma.conversation.findMany({
        where: {
          userId: user.id,
          ...(documentId ? { documentId } : { documentId: null }),
        },
        orderBy: { updatedAt: "desc" },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });
      return res.status(200).json({ conversations });
    }

    if (req.method === "POST") {
      const conversation = await prisma.conversation.create({
        data: {
          userId: user.id,
          documentId: req.body?.documentId || null,
          title: req.body?.title || "New conversation",
        },
      });
      return res.status(201).json({ conversation });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return sendJsonError(res, error);
  }
}
