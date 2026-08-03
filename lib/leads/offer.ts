/**
 * lib/leads/offer.ts — offer-line generation (Phase 3, job type `offer`,
 * flag `features.scraper.offerLines`).
 *
 * A prompt template (`offer_prompts.promptText`, `{{placeholder}}` tokens) is
 * rendered per lead by `render-prompt.ts`, then DeepSeek writes one line (or N
 * variants to pick from). The handler sets `lead.offerLine`; editing a line in
 * the table sets `offerLineEditedAt`, and a run with `skipEdited` leaves those
 * rows untouched. Provider imported lazily via `generate.ts` — test-safe.
 */

import { z } from "zod";

import type { GenerateResult } from "@/lib/ai";
import type { Lead } from "@/lib/db/schema";
import { clip, generateJsonForTask } from "@/lib/scrape/generate";

import { renderPrompt } from "./render-prompt";

const offerLinesSchema = z.object({
  lines: z.array(z.string().min(1)).min(1),
});
export type OfferLines = z.infer<typeof offerLinesSchema>;

const OFFER_SYSTEM =
  "You write concise, specific, non-cheesy cold-email opening lines for local " +
  "businesses. Each line is one sentence, references something concrete about " +
  "the business, and never uses placeholder brackets. Respond with ONLY a JSON " +
  "object — no prose, no markdown fences.";

function offerPrompt(rendered: string, variants: number): string {
  return `Follow this instruction to write ${variants === 1 ? "one opening line" : `${variants} distinct opening-line variants`}:

INSTRUCTION (already filled in with this lead's details):
"""
${clip(rendered, 4_000)}
"""

Return exactly: { "lines": [${variants === 1 ? "one string" : `${variants} strings`}] }`;
}

export interface GenerateOfferOptions {
  /** How many variants to produce (1 = single line, e.g. 3 = pick-from). */
  variants?: number;
}

/**
 * Whether an offer run should skip this lead because it was hand-edited
 * (`offerLineEditedAt` is set) and `skipEdited` is on.
 */
export function shouldSkipOffer(lead: Lead, skipEdited: boolean): boolean {
  return skipEdited && lead.offerLineEditedAt != null;
}

/**
 * Generate offer line(s) for one lead from a prompt template. Renders the
 * template against the lead (unknown placeholders throw — validated at save),
 * then runs the routed generation. The caller enforces AI quota + records the
 * call, and writes `lines[0]` to `lead.offerLine`.
 */
export async function generateOffer(
  lead: Lead,
  promptText: string,
  options: GenerateOfferOptions = {},
): Promise<{ data: OfferLines; result: GenerateResult }> {
  const variants = Math.max(1, Math.min(options.variants ?? 1, 5));
  const rendered = renderPrompt(promptText, lead);
  return generateJsonForTask(
    "offer",
    offerLinesSchema,
    OFFER_SYSTEM,
    offerPrompt(rendered, variants),
  );
}
