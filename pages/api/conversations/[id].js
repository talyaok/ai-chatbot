import prisma, { assertDatabase } from "../../../lib/db";
import { requireUser } from "../../../lib/authOptions";
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

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: user.id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        document: {
          select: { id: true, name: true, status: true },
        },
      },
    });
    if (!conversation) {
      throw new AppError("Conversation not found.", { status: 404, code: "NOT_FOUND" });
    }

    if (req.method === "GET") {
      return res.status(200).json({ conversation });
    }

    if (req.method === "DELETE") {
      await prisma.conversation.delete({ where: { id: conversation.id } });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", ["GET", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return sendJsonError(res, error);
  }
}
