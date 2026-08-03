/**
 * lib/jobs/handlers/label.ts — the `label` job (Phase 3): DeepSeek assigns
 * `businessSize` + `industrySubType`. One AI call per lead, under quota.
 */

import { db } from "@/lib/db";
import { labelLead } from "@/lib/leads/label";
import { recordAiCall } from "@/lib/usage/ai-usage";
import { enforceAiQuota } from "@/lib/usage/enforce";

import type { HandlerDeps, LeadProcessor, ProcessorFactory } from "./types";

export const createLabelProcessor: ProcessorFactory = async (
  deps: HandlerDeps,
): Promise<LeadProcessor> => {
  const { session, orgId } = deps;
  return async (lead): Promise<boolean> => {
    await enforceAiQuota(session);
    const { data, result } = await labelLead(lead);
    await db.updateLead(orgId, lead.id, {
      businessSize: data.businessSize,
      industrySubType: data.industrySubType,
    });
    await recordAiCall({
      userId: session.user.id,
      organizationId: orgId,
      kind: "lead_label",
      model: result.model,
    });
    return true;
  };
};
