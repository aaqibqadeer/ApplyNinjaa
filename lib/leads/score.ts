/**
 * lib/leads/score.ts — AI-judged lead scoring (Phase 3, job type `score`).
 *
 * DeepSeek returns `{ score: 0-100, reasoning }` (Zod-validated), written to
 * `lead.score` + `lead.scoreReasoning` so "sort by score" stays explainable.
 * The rubric is configurable (CLAUDE.md §8 — no hardcoded configurable values):
 * it lives in `app_settings.leadScoringRubric`, editable without a deploy. The
 * seed writes `DEFAULT_SCORING_RUBRIC`; this module falls back to it when the
 * setting is blank. The provider is imported lazily via `generate.ts`, so this
 * module stays test-safe.
 */

import { z } from "zod";

import type { GenerateResult } from "@/lib/ai";
import type { Lead } from "@/lib/db/schema";
import { clip, generateJsonForTask } from "@/lib/scrape/generate";

/** Default scoring rubric — seeded into `app_settings`, editable by an admin. */
export const DEFAULT_SCORING_RUBRIC = [
  "Score each local business 0-100 as a cold-outreach prospect for a web/marketing agency.",
  "Higher is a better prospect. Weight these signals:",
  "- No website or a clearly outdated/bad website (biggest opportunity): strong positive.",
  "- Healthy review volume and rating (shows a real, active business): positive.",
  "- Reachable contact (owner name or a real email found): positive.",
  "- Small/solo/independent businesses over large chains/franchises: positive.",
  "- Permanently closed, duplicate, or junk listings: near-zero.",
  "Return an integer 0-100 and one sentence of reasoning referencing the signals.",
].join("\n");

export const leadScoreSchema = z.object({
  score: z.number().min(0).max(100),
  reasoning: z.string(),
});
export type LeadScore = z.infer<typeof leadScoreSchema>;

const SCORE_SYSTEM =
  "You are a lead-scoring analyst. Apply the provided rubric strictly and " +
  "respond with ONLY a JSON object — no prose, no markdown fences.";

/** A compact, model-friendly summary of the fields scoring cares about. */
export function leadSummary(lead: Lead): string {
  const parts: string[] = [
    `Business: ${lead.businessName}`,
    lead.category ? `Category: ${lead.category}` : "",
    lead.address.city || lead.address.state
      ? `Location: ${[lead.address.city, lead.address.state].filter(Boolean).join(", ")}`
      : "",
    `Website: ${lead.website ?? "none"} (status: ${lead.websiteStatus})`,
    lead.rating != null ? `Rating: ${lead.rating}` : "",
    lead.reviewCount != null ? `Reviews: ${lead.reviewCount}` : "",
    `Business size: ${lead.businessSize}`,
    lead.industrySubType ? `Industry: ${lead.industrySubType}` : "",
    lead.ownerName ? `Owner: ${lead.ownerName}` : "",
    lead.emails.length > 0 ? `Emails found: ${lead.emails.length}` : "",
    lead.techStack.length > 0 ? `Tech: ${lead.techStack.join(", ")}` : "",
    lead.status === "junk" ? "Marked junk" : "",
  ];
  return parts.filter(Boolean).join("\n");
}

function scorePrompt(lead: Lead, rubric: string): string {
  return `RUBRIC:
${rubric}

LEAD:
${leadSummary(lead)}

Return exactly: { "score": number (0-100 integer), "reasoning": string }`;
}

/**
 * Score one lead against `rubric` (defaults to `DEFAULT_SCORING_RUBRIC`). The
 * caller enforces AI quota + records the call. Returns the parsed score plus the
 * raw generation result.
 */
export async function scoreLead(
  lead: Lead,
  rubric: string = DEFAULT_SCORING_RUBRIC,
): Promise<{ data: LeadScore; result: GenerateResult }> {
  const effectiveRubric = rubric.trim() || DEFAULT_SCORING_RUBRIC;
  const { data, result } = await generateJsonForTask(
    "score",
    leadScoreSchema,
    SCORE_SYSTEM,
    clip(scorePrompt(lead, effectiveRubric), 6_000),
  );
  return { data: { ...data, score: Math.round(data.score) }, result };
}
