/**
 * lib/profiles/resume-text.ts — extract plain text from an uploaded resume
 * (PDF/DOCX), fully in-memory. The original file is NEVER persisted — only
 * the structured data parsed from this text is stored (product spec §1).
 */

import mammoth from "mammoth";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

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

export async function extractResumeText(
  buffer: Buffer,
  contentType: string | null,
  filename: string | null,
): Promise<string> {
  const name = (filename ?? "").toLowerCase();
  const type = contentType ?? "";

  let text: string;
  if (PDF_TYPES.has(type) || name.endsWith(".pdf")) {
    const parsed = await pdfParse(buffer);
    text = parsed.text;
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
