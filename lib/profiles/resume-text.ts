/**
 * lib/profiles/resume-text.ts — extract plain text from an uploaded resume
 * (PDF/DOCX), fully in-memory. The original file is NEVER persisted — only
 * the structured data parsed from this text is stored (product spec §1).
 */

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

const PDF_TYPES = new Set(["application/pdf"]);
const DOCX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export class UnsupportedResumeError extends Error {
  readonly status = 400;
  constructor() {
    super("Unsupported file type — upload a PDF or DOCX resume");
    this.name = "UnsupportedResumeError";
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse v2 spins up a pdf.js worker per parser — always destroy it, or
  // the request handler leaks a worker per upload.
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    // Join the pages ourselves: the library's concatenated `text` interleaves
    // "-- 1 of N --" page markers, which would read as resume content to the
    // parsing model.
    return result.pages.map((page) => page.text).join("\n\n");
  } finally {
    await parser.destroy();
  }
}

export async function extractResumeText(
  buffer: Buffer,
  contentType: string | null,
  filename: string | null,
): Promise<string> {
  const name = (filename ?? "").toLowerCase();
  const type = contentType ?? "";

  let text: string;
  if (PDF_TYPES.has(type) || name.endsWith(".pdf")) {
    text = await extractPdfText(buffer);
  } else if (DOCX_TYPES.has(type) || name.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    throw new UnsupportedResumeError();
  }

  const cleaned = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) {
    throw new Error(
      "Could not read any text from that file — is it a scanned image? Try an exported PDF/DOCX.",
    );
  }
  return cleaned;
}
