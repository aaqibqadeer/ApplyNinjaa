/**
 * lib/enrich/website-status.ts — PURE, RULE-derived website status (Phase 3).
 *
 * websiteStatus is deliberately NOT AI-judged (execution plan §4). From the
 * signals the crawl gathered:
 *   - "none" when there is no website at all;
 *   - "bad"  when ANY red flag fired: no HTTPS, no viewport meta, PSI mobile
 *            score < 50, or a newest copyright year more than 3 years old;
 *   - "has"  otherwise.
 * The specific signals that fired are returned too, so the UI can explain WHY a
 * site is "bad" rather than showing an unexplained label.
 */

import type { WebsiteStatus } from "@/lib/db/schema";

/** Newest copyright year older than this many years counts as a red flag. */
const STALE_COPYRIGHT_YEARS = 3;
/** PSI mobile scores below this count as a red flag. */
const MIN_PSI_MOBILE = 50;

export interface WebsiteSignalInput {
  /** Whether the lead has any website URL at all. */
  hasWebsite: boolean;
  /** Homepage served over HTTPS. Only consulted when `hasWebsite` is true. */
  https?: boolean;
  /**
   * A `<meta name="viewport">` was present (mobile-friendly baseline). Only
   * consulted when `hasWebsite` is true.
   */
  viewport?: boolean;
  /** Google PSI mobile performance score 0-100, or null when unavailable. */
  psiMobile?: number | null;
  /** Newest copyright year found on the site, or null. */
  copyrightYear?: number | null;
}

export interface WebsiteStatusResult {
  status: WebsiteStatus;
  /** Machine-readable red-flag ids that fired (empty for "has"/"none"). */
  signals: string[];
}

/**
 * Derive `{ status, signals }` from crawl signals. `now` is injectable so the
 * "> 3 years old" copyright check is deterministic in tests.
 */
export function deriveWebsiteStatus(
  input: WebsiteSignalInput,
  now: Date = new Date(),
): WebsiteStatusResult {
  if (!input.hasWebsite) return { status: "none", signals: [] };

  const signals: string[] = [];
  if (!input.https) signals.push("no_https");
  if (!input.viewport) signals.push("no_viewport");
  if (
    input.psiMobile != null &&
    Number.isFinite(input.psiMobile) &&
    input.psiMobile < MIN_PSI_MOBILE
  ) {
    signals.push("slow_mobile");
  }
  if (
    input.copyrightYear != null &&
    now.getUTCFullYear() - input.copyrightYear > STALE_COPYRIGHT_YEARS
  ) {
    signals.push("stale_copyright");
  }

  return { status: signals.length > 0 ? "bad" : "has", signals };
}
