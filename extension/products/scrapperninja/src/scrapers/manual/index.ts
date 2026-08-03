/**
 * Manual adapter — tier "d". Automation on these sites (LinkedIn, Instagram,
 * Facebook, …) is a ban risk, so there is NO auto harvest at all: `harvestList`
 * always returns nothing and there is no `scroll`. The only way to capture is a
 * single-page "Capture this page" click, which yields one record from the
 * visible page for server-side AI extraction.
 *
 * Tier "d" is ALSO enforced in the service worker (it refuses to run the
 * capture loop) — this adapter is the second line of that same rule, so even a
 * bug in the orchestrator cannot auto-scrape a tier-d site.
 */

import { cleanText } from "../dom";
import type { HarvestContext, RawRecord, SourceAdapter } from "../types";

const TIER_D_HOSTS = [
  "linkedin.com",
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
];

export const manualAdapter: SourceAdapter = {
  id: "manual",
  automationTier: "d",
  supportsDeep: false,

  match(url: string): boolean {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      return TIER_D_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
      return false;
    }
  },

  async harvestList(): Promise<RawRecord[]> {
    // Hard rule: tier "d" never auto-harvests.
    return [];
  },

  async capturePage(ctx: HarvestContext): Promise<RawRecord> {
    const main =
      document.querySelector("main") ?? document.body ?? document.documentElement;
    const text = ((main as HTMLElement).innerText ?? main.textContent ?? "")
      .split("\n")
      .map((line) => cleanText(line))
      .filter((line): line is string => Boolean(line))
      .join("\n")
      .slice(0, 2000);
    return {
      businessName: cleanText(document.title),
      rawSnippet: text,
      parseIssues: ["needs_ai_extract"],
      sourceUrl: ctx.sourceUrl,
      ref: location.href,
    };
  },
};
