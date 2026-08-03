/**
 * lib/jobs/handlers/rescue.ts — the `rescue` job (Phase 3): the batch form of
 * the Phase 2 parse-repair. For each flagged lead with a `rawSnippet`, DeepSeek
 * re-extracts the core fields, the lead is patched, `parseIssues` cleared and
 * status moved to `new`. One AI call per rescued lead, under quota. Leads with
 * no snippet are a no-op success (nothing to repair).
 */

import { db } from "@/lib/db";
import type { UpdateLead } from "@/lib/db/schema";
import { rescueFromSnippet } from "@/lib/scrape/rescue";
import { recordAiCall } from "@/lib/usage/ai-usage";
import { enforceAiQuota } from "@/lib/usage/enforce";

import type { HandlerDeps, LeadProcessor, ProcessorFactory } from "./types";

export const createRescueProcessor: ProcessorFactory = async (
  deps: HandlerDeps,
): Promise<LeadProcessor> => {
  const { session, orgId } = deps;
  return async (lead): Promise<boolean> => {
    if (!lead.rawSnippet) return true;
    await enforceAiQuota(session);
    const { data, result } = await rescueFromSnippet(lead.rawSnippet);

    const patch: UpdateLead = { parseIssues: [], status: "new" };
    if (data.businessName) patch.businessName = data.businessName;
    if (data.phone) patch.phone = data.phone;
    if (data.website) patch.website = data.website;
    if (data.address) {
      patch.address =
        typeof data.address === "string"
          ? { ...lead.address, raw: data.address }
          : { ...lead.address, ...data.address };
    }

    await db.updateLead(orgId, lead.id, patch);
    await recordAiCall({
      userId: session.user.id,
      organizationId: orgId,
      kind: "lead_rescue",
      model: result.model,
    });
    return true;
  };
};
