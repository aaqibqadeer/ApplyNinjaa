/**
 * lib/jobs/handlers/score.ts — the `score` job (Phase 3): DeepSeek returns
 * `{ score, reasoning }` against the (editable) rubric from
 * `app_settings.leadScoringRubric`. The rubric is read ONCE per job. One AI call
 * per lead, under quota.
 */

import { db } from "@/lib/db";
import { DEFAULT_SCORING_RUBRIC, scoreLead } from "@/lib/leads/score";
import { recordAiCall } from "@/lib/usage/ai-usage";
import { enforceAiQuota } from "@/lib/usage/enforce";

import type { HandlerDeps, LeadProcessor, ProcessorFactory } from "./types";

export const createScoreProcessor: ProcessorFactory = async (
  deps: HandlerDeps,
): Promise<LeadProcessor> => {
  const { session, orgId } = deps;
  const settings = await db.getAppSettings();
  const rubric = settings.leadScoringRubric?.trim() || DEFAULT_SCORING_RUBRIC;

  return async (lead): Promise<boolean> => {
    await enforceAiQuota(session);
    const { data, result } = await scoreLead(lead, rubric);
    await db.updateLead(orgId, lead.id, {
      score: data.score,
      scoreReasoning: data.reasoning,
    });
    await recordAiCall({
      userId: session.user.id,
      organizationId: orgId,
      kind: "lead_score",
      model: result.model,
    });
    return true;
  };
};
