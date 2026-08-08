/**
 * Matching stored documents to a page's file inputs, and fetching their bytes.
 *
 * Runs in the popup: the fetch needs the Bearer token, and `attachFiles` (the
 * injected half) can't close over anything, so the base64 has to be computed
 * here and passed as an argument.
 */

import { API_ORIGIN, getToken } from "./api";
import type { CollectedField } from "./dom-actions";
import type { ProfileDocument } from "./types";

/** Bigger than this and the base64 argument stops being reasonable to pass. */
const MAX_ATTACH_BYTES = 8 * 1024 * 1024;

export interface AttachableFile {
  id: string;
  filename: string;
  contentType: string;
  base64: string;
}

function haystack(field: CollectedField): string {
  return [field.label, field.name, field.placeholder]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Which document (if any) belongs in each file input.
 *
 * Cover letter is tested FIRST: "Upload your resume or cover letter" mentions
 * both, and a field that says "cover letter" at all is never asking for the
 * CV. An unlabelled lone file input gets the résumé, which is what it is
 * nine times out of ten.
 */
export function matchDocuments(
  fields: CollectedField[],
  documents: ProfileDocument[],
): Array<{ field: CollectedField; document: ProfileDocument }> {
  const fileFields = fields.filter((f) => f.fieldType === "file");
  if (fileFields.length === 0 || documents.length === 0) return [];

  const resume = documents.find((d) => d.kind === "resume");
  const cover = documents.find((d) => d.kind === "cover_letter");

  const pairs: Array<{ field: CollectedField; document: ProfileDocument }> = [];
  for (const field of fileFields) {
    const text = haystack(field);
    let document: ProfileDocument | undefined;
    if (/cover|letter|motivation/.test(text)) document = cover;
    else if (/resume|résumé|\bcv\b|curriculum/.test(text)) document = resume;
    else if (fileFields.length === 1 && !text) document = resume;
    if (document) pairs.push({ field, document });
  }
  return pairs;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Chunked: spreading a multi-MB array into String.fromCharCode blows the
  // argument limit.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Fetch each matched document's bytes, ready to hand to `attachFiles`. */
export async function loadAttachments(
  pairs: Array<{ field: CollectedField; document: ProfileDocument }>,
): Promise<AttachableFile[]> {
  const token = await getToken();
  const files: AttachableFile[] = [];
  for (const { field, document } of pairs) {
    if (document.size > MAX_ATTACH_BYTES) continue;
    // The URL is provider-dependent: an app-route path for GridFS (needs our
    // token) or an absolute presigned S3 URL (must NOT carry it).
    const absolute = /^https?:/.test(document.url);
    const res = await fetch(
      absolute ? document.url : `${API_ORIGIN}${document.url}`,
      absolute ? {} : { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) continue;
    files.push({
      id: field.id,
      filename: document.filename,
      contentType: document.contentType,
      base64: toBase64(await res.arrayBuffer()),
    });
  }
  return files;
}
