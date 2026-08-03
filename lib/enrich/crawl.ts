/**
 * lib/enrich/crawl.ts — website crawl for the `enrich` job (Phase 3). Node-only
 * (uses `fetch`, reads env). Deliberately conservative and polite:
 *   - at most 3 pages (homepage + /contact + /about), fetched SEQUENTIALLY
 *     (never parallel against the same host);
 *   - 10s timeout, 1MB response cap, at most 2 manual redirects per page;
 *   - respects robots.txt (`lib/enrich/robots.ts`) and sends a descriptive UA.
 *
 * It extracts emails, socials, tech stack, and the on-page signals
 * (HTTPS / viewport / newest copyright year) that `deriveWebsiteStatus` turns
 * into `websiteStatus`. `pageSpeed` is OPTIONAL — populated only when
 * `PAGESPEED_API_KEY` is set; an absent key leaves it blank and never errors.
 * `ownerName` is a separate best-effort DeepSeek call (`guessOwnerName`) the
 * handler runs under AI quota — blank is a correct answer, never invented.
 */

import { env } from "@/config/env.schema";
import type { GenerateResult } from "@/lib/ai";
import type { LeadPageSpeed, LeadSocials } from "@/lib/db/schema";
import { clip, generateJsonForTask } from "@/lib/scrape/generate";
import { z } from "zod";

import { canFetch } from "./robots";
import { detectTechStack } from "./tech";

/** Descriptive User-Agent so site owners can identify + rate-limit the crawler. */
export const CRAWL_USER_AGENT =
  "ScrapperNinjaBot/1.0 (+https://scrapperninja.example/bot; lead enrichment)";

const MAX_PAGES = 3;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 2;
/** Paths tried, in order — homepage first, then the usual contact/about pages. */
const CRAWL_PATHS = ["/", "/contact", "/about"] as const;

/** Junk-email fragments filtered out of extracted addresses. */
const EMAIL_JUNK = [
  "noreply",
  "no-reply",
  "donotreply",
  "sentry",
  "wixpress",
  "example.com",
  "example.org",
  "yourdomain",
  "domain.com",
  "email.com",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
];

const SOCIAL_HOST_MAP: ReadonlyArray<[RegExp, keyof LeadSocials]> = [
  [/facebook\.com/i, "facebook"],
  [/instagram\.com/i, "instagram"],
  [/linkedin\.com/i, "linkedin"],
  [/(twitter\.com|x\.com)/i, "x"],
  [/(youtube\.com|youtu\.be)/i, "youtube"],
  [/tiktok\.com/i, "tiktok"],
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const MAILTO_RE = /mailto:([^"'?\s>]+)/gi;
const HREF_RE = /href=["']([^"']+)["']/gi;
const VIEWPORT_RE = /<meta[^>]+name=["']viewport["']/i;
const COPYRIGHT_RE = /(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–—]\s*)?(\d{4})/gi;

export interface CrawlResult {
  https: boolean;
  viewport: boolean;
  copyrightYear: number | null;
  emails: string[];
  socials: LeadSocials;
  techStack: string[];
  pagesFetched: number;
  /** Combined visible-ish text from about/contact pages for owner extraction. */
  aboutText: string;
}

interface FetchedPage {
  finalUrl: string;
  https: boolean;
  html: string;
  headers: Headers;
}

/** Fetch one URL with timeout, size cap, and bounded manual redirects. */
async function fetchPage(startUrl: string): Promise<FetchedPage | null> {
  let url = startUrl;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": CRAWL_USER_AGENT, accept: "text/html,*/*" },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        url = new URL(location, url).toString();
        continue;
      }
      if (!response.ok || !response.body) return null;

      const html = await readCapped(response);
      return {
        finalUrl: url,
        https: url.startsWith("https:"),
        html,
        headers: response.headers,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Read a response body up to MAX_BYTES, decoding as UTF-8. */
async function readCapped(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= MAX_BYTES) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  const merged = new Uint8Array(Math.min(total, MAX_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const room = merged.length - offset;
    if (room <= 0) break;
    merged.set(chunk.subarray(0, room), offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8").decode(merged);
}

function collectEmails(html: string, into: Set<string>): void {
  const add = (candidate: string): void => {
    const email = candidate.trim().toLowerCase().replace(/^mailto:/, "");
    if (!email.includes("@")) return;
    if (EMAIL_JUNK.some((j) => email.includes(j))) return;
    into.add(email);
  };
  for (const m of html.matchAll(MAILTO_RE)) add(decodeURIComponent(m[1]));
  for (const m of html.matchAll(EMAIL_RE)) add(m[0]);
}

function collectSocials(html: string, into: Record<string, string>): void {
  for (const m of html.matchAll(HREF_RE)) {
    const href = m[1];
    for (const [pattern, platform] of SOCIAL_HOST_MAP) {
      if (pattern.test(href) && !into[platform]) {
        into[platform] = href.startsWith("http") ? href : `https://${href}`;
      }
    }
  }
}

function newestCopyrightYear(html: string): number | null {
  let newest: number | null = null;
  const cap = new Date().getUTCFullYear() + 1;
  for (const m of html.matchAll(COPYRIGHT_RE)) {
    const year = Number(m[1]);
    if (year >= 1990 && year <= cap && (newest === null || year > newest)) {
      newest = year;
    }
  }
  return newest;
}

/** Strip tags to rough text (for the owner-name model prompt). */
function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Crawl a business website (homepage + contact + about, sequentially, robots-
 * respecting) and extract enrichment signals. Returns null-ish empties for a
 * site that can't be reached at all — the caller still records a completed
 * enrichment (the "bad website" pitch relies on knowing a site is unreachable).
 */
export async function crawlWebsite(website: string): Promise<CrawlResult> {
  const empty: CrawlResult = {
    https: false,
    viewport: false,
    copyrightYear: null,
    emails: [],
    socials: {},
    techStack: [],
    pagesFetched: 0,
    aboutText: "",
  };

  let origin: URL;
  try {
    origin = new URL(
      /^https?:\/\//i.test(website) ? website : `https://${website}`,
    );
  } catch {
    return empty;
  }

  // Robots (best-effort): fetch once, allow-on-failure.
  let robotsTxt = "";
  const robots = await fetchPage(new URL("/robots.txt", origin).toString());
  if (robots) robotsTxt = robots.html;

  const emails = new Set<string>();
  const socials: Record<string, string> = {};
  const tech = new Set<string>();
  let https = false;
  let viewport = false;
  let copyrightYear: number | null = null;
  let pagesFetched = 0;
  const aboutParts: string[] = [];

  for (const path of CRAWL_PATHS) {
    if (pagesFetched >= MAX_PAGES) break;
    const target = new URL(path, origin).toString();
    if (robotsTxt && !canFetch(target, robotsTxt, CRAWL_USER_AGENT)) continue;

    const page = await fetchPage(target);
    if (!page) continue;
    pagesFetched += 1;

    if (path === "/") https = page.https;
    if (VIEWPORT_RE.test(page.html)) viewport = true;
    const year = newestCopyrightYear(page.html);
    if (year != null && (copyrightYear === null || year > copyrightYear)) {
      copyrightYear = year;
    }
    collectEmails(page.html, emails);
    collectSocials(page.html, socials);
    for (const t of detectTechStack(page.html, page.headers)) tech.add(t);
    if (path !== "/") aboutParts.push(toText(page.html));
  }

  return {
    https,
    viewport,
    copyrightYear,
    emails: [...emails],
    socials: socials as LeadSocials,
    techStack: [...tech],
    pagesFetched,
    aboutText: aboutParts.join("\n\n"),
  };
}

/* -------------------------------------------------------------------------- */
/* PageSpeed (optional)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Fetch Google PageSpeed Insights mobile + desktop performance scores. OPTIONAL
 * — returns `{ mobile: null, desktop: null }` when `PAGESPEED_API_KEY` is unset
 * or any request fails. Never throws (execution plan §4: absent key must not
 * fail the job).
 */
export async function fetchPageSpeed(website: string): Promise<LeadPageSpeed> {
  const key = env.PAGESPEED_API_KEY;
  if (!key) return { mobile: null, desktop: null };

  const score = async (strategy: "mobile" | "desktop"): Promise<number | null> => {
    try {
      const api = new URL(
        "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
      );
      api.searchParams.set("url", website);
      api.searchParams.set("strategy", strategy);
      api.searchParams.set("category", "performance");
      api.searchParams.set("key", key);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 3);
      try {
        const res = await fetch(api, { signal: controller.signal });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          lighthouseResult?: {
            categories?: { performance?: { score?: number } };
          };
        };
        const raw = json.lighthouseResult?.categories?.performance?.score;
        return typeof raw === "number" ? Math.round(raw * 100) : null;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  };

  const [mobile, desktop] = await Promise.all([
    score("mobile"),
    score("desktop"),
  ]);
  return { mobile, desktop };
}

/* -------------------------------------------------------------------------- */
/* Owner name (AI, best-effort)                                              */
/* -------------------------------------------------------------------------- */

const ownerNameSchema = z.object({
  ownerName: z.string().nullable().default(null),
});

const OWNER_SYSTEM =
  "You read about/contact page text of a local business and extract the " +
  "owner's or principal's full name if it is clearly stated. Respond with ONLY " +
  "a JSON object — no prose, no fences.";

function ownerPrompt(text: string): string {
  return `From this business page text, extract the owner/founder/principal's
full name IF it is explicitly stated. Return exactly:
{ "ownerName": string|null }
If no clear personal name of the owner is present, return null. Do NOT guess or
invent a name.

Page text:
"""
${clip(text, 4_000)}
"""`;
}

/**
 * Best-effort owner-name extraction from crawled about/contact text via DeepSeek.
 * Returns `{ ownerName: null }` for empty text without any provider call. The
 * caller enforces AI quota + records the call.
 */
export async function guessOwnerName(
  aboutText: string,
): Promise<{ data: { ownerName: string | null }; result: GenerateResult | null }> {
  if (!aboutText.trim()) {
    return { data: { ownerName: null }, result: null };
  }
  const { data, result } = await generateJsonForTask(
    "enrich",
    ownerNameSchema,
    OWNER_SYSTEM,
    ownerPrompt(aboutText),
  );
  return { data, result };
}
