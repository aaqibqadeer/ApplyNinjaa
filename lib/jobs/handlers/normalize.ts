/**
 * lib/jobs/handlers/normalize.ts — the `normalize` job (Phase 3).
 *
 * Phone → E.164 and website → canonical origin/domain are pure and always run.
 * A raw, unstructured address triggers the ONE AI step (DeepSeek), under quota;
 * leads whose address is already structured never spend a call. Social/directory
 * URLs are folded into `socials` (or dropped) instead of `website`.
 */

import {
  normalizeAddress,
  normalizePhone,
  normalizeWebsite,
} from "@/lib/leads/normalize";
import type { UpdateLead } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { recordAiCall } from "@/lib/usage/ai-usage";
import { enforceAiQuota } from "@/lib/usage/enforce";

import type { HandlerDeps, LeadProcessor, ProcessorFactory } from "./types";

export const createNormalizeProcessor: ProcessorFactory = async (
  deps: HandlerDeps,
): Promise<LeadProcessor> => {
  const { session, orgId } = deps;
  return async (lead): Promise<boolean> => {
    const patch: UpdateLead = {};

    if (lead.phone) {
      const { phoneE164 } = normalizePhone(lead.phone);
      if (phoneE164 && phoneE164 !== lead.phoneE164) patch.phoneE164 = phoneE164;
    }

    if (lead.website) {
      const site = normalizeWebsite(lead.website);
      if (site.website) {
        patch.website = site.website;
        patch.websiteDomain = site.websiteDomain;
      } else if (site.rejected) {
        // Not a real business site — drop it, folding a social URL into socials.
        patch.website = null;
        patch.websiteDomain = null;
        if (site.social) {
          patch.socials = { ...lead.socials, [site.social.platform]: site.social.url };
        }
      }
    }

    // Address AI only when there's a raw string that isn't already structured.
    const raw = lead.address.raw?.trim();
    if (raw && !lead.address.city && !lead.address.street) {
      await enforceAiQuota(session);
      const { data, result } = await normalizeAddress(raw);
      patch.address = { ...lead.address, ...data, raw };
      await recordAiCall({
        userId: session.user.id,
        organizationId: orgId,
        kind: "lead_normalize",
        model: result.model,
      });
    }

    if (Object.keys(patch).length > 0) {
      await db.updateLead(orgId, lead.id, patch);
    }
    return true;
  };
};
