/**
 * lib/leads/label.ts — AI auto-labeling (Phase 3, job type `label`).
 *
 * DeepSeek assigns a `businessSize` bucket (Zod enum, "unknown" on low
 * confidence) and a free-text `industrySubType` from the captured + enriched
 * fields. Provider imported lazily via `generate.ts` — test-safe.
 */

import { z } from "zod";

import type { GenerateResult } from "@/lib/ai";
import { BUSINESS_SIZES, businessSizeSchema, type Lead } from "@/lib/db/schema";
import { generateJsonForTask } from "@/lib/scrape/generate";

import { leadSummary } from "./score";

export const leadLabelSchema = z.object({
  businessSize: businessSizeSchema.default("unknown"),
  industrySubType: z.string().nullable().default(null),
});
export type LeadLabel = z.infer<typeof leadLabelSchema>;

const LABEL_SYSTEM =
  "You classify a local business. Respond with ONLY a JSON object — no prose, " +
  "no markdown fences. Use \"unknown\" for businessSize when you are not " +
  "confident.";

function labelPrompt(lead: Lead): string {
  return `Classify this business.
- businessSize: one of ${BUSINESS_SIZES.join(", ")} (use "unknown" if unsure).
- industrySubType: a short, specific sub-industry (e.g. "emergency plumber",
  "pediatric dentist"), or null if unclear.

LEAD:
${leadSummary(lead)}

Return exactly: { "businessSize": string, "industrySubType": string|null }`;
}

/**
 * Label one lead's size + industry sub-type. The caller enforces AI quota +
 * records the call. Returns the parsed label plus the raw generation result.
 */
export async function labelLead(
  lead: Lead,
): Promise<{ data: LeadLabel; result: GenerateResult }> {
  return generateJsonForTask(
    "label",
    leadLabelSchema,
    LABEL_SYSTEM,
    labelPrompt(lead),
  );
}
