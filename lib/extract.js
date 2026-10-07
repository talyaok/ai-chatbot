import { AppError } from "./errors";
import { readStoredFile } from "./fileValidation";

async function parsePdf(buffer) {
  const pdfParse = (await import("pdf-parse")).default || (await import("pdf-parse"));
  try {
    const result = await pdfParse(buffer);
    return {
      text: String(result.text || "").trim(),
      pages: result.numpages || null,
      info: result.info || null,
    };
  } catch (error) {
    throw new AppError("Could not extract text from this PDF.", {
      status: 400,
      code: "PDF_EXTRACT_FAILED",
    });
  }
}

export async function extractDocumentText({ storagePath, fileType, buffer: providedBuffer }) {
  const buffer = providedBuffer || (await readStoredFile(storagePath));

  if (fileType === "pdf") {
    const parsed = await parsePdf(buffer);
    if (!parsed.text) {
      throw new AppError("This PDF did not contain extractable text.", {
        status: 400,
        code: "EMPTY_DOCUMENT",
      });
    }
    return parsed;
  }

  const text = buffer.toString("utf8").trim();
  if (!text) {
    throw new AppError("This file did not contain any text.", {
      status: 400,
      code: "EMPTY_DOCUMENT",
    });
  }

  return {
    text,
    pages: null,
    info: null,
  };
}
