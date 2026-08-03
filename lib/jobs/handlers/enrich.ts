/**
 * lib/jobs/handlers/enrich.ts — the `enrich` job (Phase 3, flag
 * `features.scraper.enrichment`): crawl the website, extract emails/socials/tech
 * stack + on-page signals, optionally PageSpeed, best-effort owner name via
 * DeepSeek, then RULE-derive `websiteStatus` (storing which signals fired).
 *
 * Only the owner-name step is AI (under quota). A lead with no website skips the
 * crawl and lands `websiteStatus: "none"` — still a completed enrichment (the
 * "no website" pitch depends on knowing that).
 */

import { features } from "@/config/features";
import { db } from "@/lib/db";
import type { UpdateLead } from "@/lib/db/schema";
import {
  crawlWebsite,
  fetchPageSpeed,
  guessOwnerName,
} from "@/lib/enrich/crawl";
import { deriveWebsiteStatus } from "@/lib/enrich/website-status";
import { ScraperError } from "@/lib/leads/service";
import { recordAiCall } from "@/lib/usage/ai-usage";
import { enforceAiQuota } from "@/lib/usage/enforce";

import type { HandlerDeps, LeadProcessor, ProcessorFactory } from "./types";

/** Reserved customFields key holding the red-flag ids behind a "bad" status. */
export const WEBSITE_SIGNALS_KEY = "websiteStatusSignals";

function mergeUnique(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

export const createEnrichProcessor: ProcessorFactory = async (
  deps: HandlerDeps,
): Promise<LeadProcessor> => {
  if (!features.scraper.enrichment) {
    throw new ScraperError("Enrichment is not enabled", 404);
  }
  const { session, orgId } = deps;

  return async (lead): Promise<boolean> => {
    const patch: UpdateLead = { enrichmentStatus: "done", enrichedAt: new Date() };

    if (!lead.website) {
      const { status, signals } = deriveWebsiteStatus({ hasWebsite: false });
      patch.websiteStatus = status;
      patch.customFields = { ...lead.customFields, [WEBSITE_SIGNALS_KEY]: signals };
      await db.updateLead(orgId, lead.id, patch);
      return true;
    }

    const crawl = await crawlWebsite(lead.website);
    const pageSpeed = await fetchPageSpeed(lead.website);

    // Best-effort owner name (AI). Only spends a call when there's page text.
    if (!lead.ownerName && crawl.aboutText.trim()) {
      await enforceAiQuota(session);
      const { data, result } = await guessOwnerName(crawl.aboutText);
      if (data.ownerName) patch.ownerName = data.ownerName;
      if (result) {
        await recordAiCall({
          userId: session.user.id,
          organizationId: orgId,
          kind: "lead_enrich",
          model: result.model,
        });
      }
    }

    if (crawl.emails.length > 0) {
      patch.emails = mergeUnique(lead.emails, crawl.emails);
    }
    if (Object.keys(crawl.socials).length > 0) {
      patch.socials = { ...lead.socials, ...crawl.socials };
    }
    if (crawl.techStack.length > 0) {
      patch.techStack = mergeUnique(lead.techStack, crawl.techStack);
    }
    patch.pageSpeed = pageSpeed;

    const { status, signals } = deriveWebsiteStatus({
      hasWebsite: true,
      https: crawl.https,
      viewport: crawl.viewport,
      psiMobile: pageSpeed.mobile,
      copyrightYear: crawl.copyrightYear,
    });
    patch.websiteStatus = status;
    patch.customFields = { ...lead.customFields, [WEBSITE_SIGNALS_KEY]: signals };

    await db.updateLead(orgId, lead.id, patch);
    return true;
  };
};
