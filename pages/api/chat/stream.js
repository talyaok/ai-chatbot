import prisma, { assertDatabase } from "../../../lib/db";
import { requireUser } from "../../../lib/authOptions";
import { streamChatWithAI } from "../../../lib/ai";
import { GENERAL_SYSTEM_PROMPT, conversationTitleFromMessage } from "../../../lib/prompts";
import { streamAnswerWithRag, requireQuestion } from "../../../lib/claudeRAG";
import { toModelHistory } from "../../../lib/history";
import {
  applySafeCors,
  chatMode,
  clientKey,
  imageContentBlocks,
  parseImagePayload,
  rateLimit,
  setSseHeaders,
  writeSse,
} from "../../../lib/http";
import { AppError, clientErrorMessage, logError } from "../../../lib/errors";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
    responseLimit: false,
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

  const abort = new AbortController();
  req.on("close", () => abort.abort());

  try {
    rateLimit(`chat-stream:${clientKey(req)}`);
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

    setSseHeaders(res);
    writeSse(res, { conversationId: conversation.id, mode });

    const history = toModelHistory(conversation.messages);
    let answer = "";
    let sources = [];

    if (documentId) {
      const rag = await streamAnswerWithRag({
        question,
        documentId,
        userId: user.id,
        history,
        res,
        options: { signal: abort.signal },
      });
      answer = rag.text;
      sources = rag.sources;
    } else {
      answer = await streamChatWithAI(
        [...history, { role: "user", content: userContent }],
        GENERAL_SYSTEM_PROMPT,
        res,
        { signal: abort.signal }
      );
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
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
    }

    writeSse(res, { done: true, conversationId: conversation.id, sources, mode });
    res.end();
  } catch (error) {
    logError("chat/stream", error);
    if (res.headersSent) {
      writeSse(res, { error: clientErrorMessage(error), done: true });
      res.end();
      return;
    }
    res.status(error?.status || 500).json({ error: clientErrorMessage(error) });
  }
}
