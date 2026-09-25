import prisma, { assertDatabase } from "./db";
import { chunkText } from "./chunker";
import { createEmbeddings } from "./embedder";
import { addChunks, chunkVectorId, deleteDocumentChunks } from "./vectorSearch";
import { extractDocumentText } from "./extract";
import { AppError } from "./errors";

export async function ingestDocument({ document, userId }) {
  await assertDatabase();

  if (document.userId !== userId) {
    throw new AppError("You cannot process this document.", { status: 403, code: "FORBIDDEN" });
  }

  await prisma.document.update({
    where: { id: document.id },
    data: { status: "processing", errorMessage: null },
  });

  try {
    const extracted = await extractDocumentText({
      storagePath: document.storagePath,
      fileType: document.fileType,
    });

    const chunks = chunkText(extracted.text);
    if (!chunks.length) {
      throw new AppError("The document produced no usable text chunks.", {
        status: 400,
        code: "EMPTY_DOCUMENT",
      });
    }

    await deleteDocumentChunks(document.id).catch(() => {});
    await prisma.documentChunk.deleteMany({ where: { documentId: document.id } });

    const embeddings = await createEmbeddings(chunks.map((chunk) => chunk.text));
    const records = chunks.map((chunk, index) => ({
      id: chunkVectorId(document.id, chunk.index),
      documentId: document.id,
      documentName: document.name,
      userId,
      chunkIndex: chunk.index,
      text: chunk.text,
      embedding: embeddings[index],
    }));

    await addChunks(records);

    await prisma.documentChunk.createMany({
      data: records.map((record) => ({
        documentId: document.id,
        chunkIndex: record.chunkIndex,
        text: record.text,
        chromaId: record.id,
        metadata: {
          documentName: document.name,
          fileType: document.fileType,
        },
      })),
    });

    const updated = await prisma.document.update({
      where: { id: document.id },
      data: {
        status: "processed",
        chunkCount: records.length,
        errorMessage: null,
      },
    });

    return {
      document: updated,
      chunkCount: records.length,
      characters: extracted.text.length,
      pages: extracted.pages,
      message: `Document processed successfully — ${records.length} chunks indexed.`,
    };
  } catch (error) {
    await prisma.document.update({
      where: { id: document.id },
      data: {
        status: "failed",
        errorMessage: error?.message || "Processing failed",
      },
    });
    throw error;
  }
}
