/**
 * lib/scrape/extract.ts — the generic (tier-b) adapter's AI extraction.
 *
 * The generic adapter can't parse arbitrary directory markup with selectors, so
 * it sends the cleaned text of each repeated result block (see ./blocks.ts) to
 * DeepSeek and gets structured records back. This is what makes Yellow Pages,
 * BBB, Manta, chamber directories, etc. work with no site-specific code.
 *
 * Pure Zod validation of the model output; the routed generation is one billable
 * AI call. The route owns quota enforcement + `recordAiCall`.
 */

import { z } from "zod";

import type { GenerateResult } from "@/lib/ai";

import { extractJson, generateJsonForTask } from "./generate";

/** One business extracted from a text block. Missing fields are null, never
 * invented. */
export const extractedRecordSchema = z.object({
  businessName: z.string(),
  category: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
});
export type ExtractedRecord = z.infer<typeof extractedRecordSchema>;

export const extractResponseSchema = z.object({
  records: z.array(extractedRecordSchema).default([]),
});
export type ExtractResponse = z.infer<typeof extractResponseSchema>;

/** Validate a model response into extracted records. Pure — used by tests. */
export function parseExtractResponse(text: string): ExtractResponse {
  return extractResponseSchema.parse(extractJson(text));
}

const EXTRACT_SYSTEM =
  "You extract business listings from cleaned text blocks scraped from a " +
  "directory page. Respond with ONLY a JSON object — no prose, no fences.";

function extractPrompt(blocks: string[]): string {
  return `Each text block below is one business listing from a directory page.
Extract the fields for EACH block, in order. Return exactly:
{"records":[{"businessName","category","phone","website","address"}]}
- one records entry per block, same order,
- businessName is required; use your best read of the listing's name,
- category/phone/website/address: the value if present, else null,
- NEVER invent a value — a field not in the block MUST be null.

Blocks (JSON array of strings):
${JSON.stringify(blocks.slice(0, 60))}`;
}

/**
 * Extract structured records from cleaned text blocks via the routed provider.
 * Returns the parsed records plus the raw `GenerateResult`.
 */
export async function extractFromBlocks(
  blocks: string[],
): Promise<{ data: ExtractResponse; result: GenerateResult }> {
  return generateJsonForTask(
    "extract",
    extractResponseSchema,
    EXTRACT_SYSTEM,
    extractPrompt(blocks),
  );
}
