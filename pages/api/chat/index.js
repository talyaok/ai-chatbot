import prisma, { assertDatabase } from "../../../lib/db";
import { requireUser } from "../../../lib/authOptions";
import { chatWithAI } from "../../../lib/ai";
import { GENERAL_SYSTEM_PROMPT, RAG_SYSTEM_PROMPT, conversationTitleFromMessage } from "../../../lib/prompts";
import { retrieveSources, buildGroundedMessages, requireQuestion } from "../../../lib/claudeRAG";
import { toModelHistory } from "../../../lib/history";
import { applySafeCors, chatMode, clientKey, imageContentBlocks, parseImagePayload, rateLimit } from "../../../lib/http";
import { AppError, sendJsonError } from "../../../lib/errors";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
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
    rateLimit(`chat:${clientKey(req)}`);
    const user = await requireUser(req, res);
    await assertDatabase();

    const question = requireQuestion(req.body?.message || req.body?.question);
    const documentId = req.body?.documentId || null;
    const conversationId = req.body?.conversationId || null;
    const image = parseImagePayload(req.body?.image);

    if (image && documentId) {
      throw new AppError("Send either a document question or an image, not both in one request.", {
        status: 400,
        code: "CONFLICTING_MODES",
      });
    }

    let conversation = null;
    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: user.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!conversation) {
        throw new AppError("Conversation not found.", { status: 404, code: "NOT_FOUND" });
      }
    } else {
      conversation = await prisma.conversation.create({
        data: {
          userId: user.id,
          documentId,
          title: conversationTitleFromMessage(question),
        },
        include: { messages: true },
      });
    }

    if (documentId) {
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
    }

    const mode = chatMode({ documentId, image });
    const userContent = image ? imageContentBlocks(question, image) : question;

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: question,
        metadata: {
          mode,
          hasImage: Boolean(image),
          mediaType: image?.mediaType || null,
          documentId,
        },
      },
    });

    const history = toModelHistory(conversation.messages);
    let answer = "";
    let sources = [];

    if (documentId) {
      sources = await retrieveSources({ question, documentId, userId: user.id });
      if (!sources.length) {
        answer = "I could not find relevant information in the selected document for that question.";
      } else {
        answer = await chatWithAI(
          buildGroundedMessages({ question, sources, history }),
          RAG_SYSTEM_PROMPT
        );
      }
    } else {
      answer = await chatWithAI([...history, { role: "user", content: userContent }], GENERAL_SYSTEM_PROMPT);
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: answer,
        metadata: { mode, sources },
      },
    });

    if (conversation.title === "New conversation") {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { title: conversationTitleFromMessage(question) },
      });
    }

    return res.status(200).json({
      conversationId: conversation.id,
      mode,
      text: answer,
      sources,
    });
  } catch (error) {
    return sendJsonError(res, error);
  }
}
