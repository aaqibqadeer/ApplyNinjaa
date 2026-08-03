/**
 * lib/jobs/handlers/offer.ts — the `offer` job (Phase 3, flag
 * `features.scraper.offerLines`): render a saved prompt against each lead and
 * generate its opening line(s) via DeepSeek. The prompt is resolved ONCE per
 * job. `skipEdited` leaves hand-edited rows (`offerLineEditedAt` set) untouched.
 * One AI call per generated lead, under quota.
 *
 * `params`: `{ promptId: string, variants?: 1|3, skipEdited?: boolean }`.
 */

import { features } from "@/config/features";
import { db } from "@/lib/db";
import { generateOffer, shouldSkipOffer } from "@/lib/leads/offer";
import { ScraperError } from "@/lib/leads/service";
import { recordAiCall } from "@/lib/usage/ai-usage";
import { enforceAiQuota } from "@/lib/usage/enforce";

import type { HandlerDeps, LeadProcessor, ProcessorFactory } from "./types";

export const createOfferProcessor: ProcessorFactory = async (
  deps: HandlerDeps,
  job,
): Promise<LeadProcessor> => {
  if (!features.scraper.offerLines) {
    throw new ScraperError("Offer lines are not enabled", 404);
  }
  const { session, orgId } = deps;

  const promptId = typeof job.params.promptId === "string" ? job.params.promptId : "";
  if (!promptId) throw new ScraperError("offer job requires params.promptId", 400);
  const prompt = await db.getOfferPrompt(orgId, promptId);
  if (!prompt) throw new ScraperError("Offer prompt not found", 404);

  const variants = job.params.variants === 3 ? 3 : 1;
  const skipEdited = job.params.skipEdited === true;

  return async (lead): Promise<boolean> => {
    if (shouldSkipOffer(lead, skipEdited)) return true;
    await enforceAiQuota(session);
    const { data, result } = await generateOffer(lead, prompt.promptText, {
      variants,
    });
    await db.updateLead(orgId, lead.id, {
      offerLine: data.lines[0],
      offerLinePromptId: prompt.id,
    });
    await recordAiCall({
      userId: session.user.id,
      organizationId: orgId,
      kind: "lead_offer",
      model: result.model,
    });
    return true;
  };
};
