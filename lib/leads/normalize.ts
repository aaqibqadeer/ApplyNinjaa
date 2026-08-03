/**
 * lib/leads/normalize.ts — lead normalization (Phase 3, job type `normalize`).
 *
 * Phone and website normalization are PURE (no DB, no AI) and unit-tested:
 *   - `normalizePhone` → E.164 via `libphonenumber-js`, keeping the original.
 *   - `normalizeWebsite` → canonical origin + bare domain, and rejects obvious
 *     non-sites (facebook.com/…, yelp.com/…) — social domains are handed back as
 *     a `social` hint the caller folds into `socials` instead of `website`.
 *
 * Only `normalizeAddress` touches AI: it re-parses a raw address string into the
 * structured `{street,city,state,postalCode,country}` shape via DeepSeek
 * (`generateJsonForTask('normalize', …)`), Zod-validated, raw string preserved.
 * The provider accessor is imported lazily inside `generate.ts`, so importing
 * this module never loads env — the pure helpers stay test-safe.
 */

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";

import type { GenerateResult } from "@/lib/ai";
import { leadAddressSchema, type LeadSocials } from "@/lib/db/schema";
import { clip, generateJsonForTask } from "@/lib/scrape/generate";

/* -------------------------------------------------------------------------- */
/* Phone                                                                      */
/* -------------------------------------------------------------------------- */

export interface NormalizedPhone {
  /** The original input, unchanged (stored in `lead.phone`). */
  phone: string | null;
  /** E.164 form (e.g. `+15125550110`) or null when unparseable. */
  phoneE164: string | null;
}

/**
 * Normalize a raw phone string to E.164 while keeping the original. Unparseable
 * or empty input yields a null `phoneE164` (never a guess). `defaultCountry`
 * supplies the region for national-format numbers with no `+` prefix.
 */
export function normalizePhone(
  phone: string | null | undefined,
  defaultCountry: CountryCode = "US",
): NormalizedPhone {
  const raw = phone?.trim() ?? "";
  if (!raw) return { phone: phone ?? null, phoneE164: null };
  const parsed = parsePhoneNumberFromString(raw, defaultCountry);
  return {
    phone: phone ?? null,
    phoneE164: parsed && parsed.isValid() ? parsed.number : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Website                                                                    */
/* -------------------------------------------------------------------------- */

/** Social-network hosts → the `socials` slot they belong in. */
const SOCIAL_HOSTS: ReadonlyArray<[RegExp, keyof LeadSocials]> = [
  [/(^|\.)facebook\.com$/, "facebook"],
  [/(^|\.)fb\.com$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)twitter\.com$/, "x"],
  [/(^|\.)x\.com$/, "x"],
  [/(^|\.)youtube\.com$/, "youtube"],
  [/(^|\.)youtu\.be$/, "youtube"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
];

/**
 * Directory / aggregator hosts that are not a business's own website. These are
 * rejected (website null) but map to no social slot — the caller just drops
 * them.
 */
const NON_SITE_HOSTS: ReadonlyArray<RegExp> = [
  /(^|\.)yelp\.com$/,
  /(^|\.)google\.com$/,
  /(^|\.)goo\.gl$/,
  /(^|\.)maps\.app\.goo\.gl$/,
  /(^|\.)mapquest\.com$/,
  /(^|\.)yellowpages\.com$/,
  /(^|\.)bbb\.org$/,
  /(^|\.)manta\.com$/,
];

export interface NormalizedWebsite {
  /** Canonical origin (`https://host`) or null when input is not a real site. */
  website: string | null;
  /** Bare host with `www.` stripped, lowercased, or null. */
  websiteDomain: string | null;
  /** Set when the input was a recognized social URL — fold into `socials`. */
  social: { platform: keyof LeadSocials; url: string } | null;
  /** True when the input was a social/directory URL, not a business site. */
  rejected: boolean;
}

/** Parse a possibly-schemeless URL, defaulting to https. Returns null on junk. */
function toUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/** Lowercase host with a single leading `www.` removed. */
function bareDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/**
 * Canonicalize a website URL to `{ website, websiteDomain }`, dropping tracking
 * params (query + hash) and normalizing the host. A recognized social URL is
 * returned as a `social` hint (website null, rejected true); a directory URL is
 * rejected outright. Anything unparseable yields all-null, rejected false, so a
 * caller can distinguish "bad input" from "not a website".
 */
export function normalizeWebsite(
  url: string | null | undefined,
): NormalizedWebsite {
  const empty: NormalizedWebsite = {
    website: null,
    websiteDomain: null,
    social: null,
    rejected: false,
  };
  if (!url) return empty;
  const parsed = toUrl(url);
  if (!parsed) return empty;

  const domain = bareDomain(parsed.hostname);

  for (const [pattern, platform] of SOCIAL_HOSTS) {
    if (pattern.test(domain)) {
      // Keep the full social URL (path matters — it points at the profile),
      // but drop tracking query/hash.
      const clean = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`.replace(
        /\/$/,
        "",
      );
      return { website: null, websiteDomain: null, social: { platform, url: clean }, rejected: true };
    }
  }
  for (const pattern of NON_SITE_HOSTS) {
    if (pattern.test(domain)) {
      return { website: null, websiteDomain: null, social: null, rejected: true };
    }
  }

  return {
    website: `${parsed.protocol}//${domain}`,
    websiteDomain: domain,
    social: null,
    rejected: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Address (AI)                                                               */
/* -------------------------------------------------------------------------- */

/** The structured address DeepSeek returns; every part is nullable. */
const normalizedAddressSchema = leadAddressSchema;
export type NormalizedAddress = z.infer<typeof normalizedAddressSchema>;

const ADDRESS_SYSTEM =
  "You normalize a single US/CA business postal address into structured parts. " +
  "Respond with ONLY a JSON object — no prose, no markdown fences.";

function addressPrompt(raw: string): string {
  return `Split this raw address into parts. Return exactly this JSON object:
{
  "street": string|null,
  "city": string|null,
  "state": string|null,
  "postalCode": string|null,
  "country": string|null
}
Use null for anything not present. Do NOT invent values.

Raw address:
"""
${clip(raw, 500)}
"""`;
}

/**
 * Re-parse a raw address string into structured parts via DeepSeek. Preserves
 * the original in `.raw`. The caller owns quota enforcement + `recordAiCall`;
 * this only performs the routed generation and Zod validation.
 */
export async function normalizeAddress(
  raw: string,
): Promise<{ data: NormalizedAddress; result: GenerateResult }> {
  const { data, result } = await generateJsonForTask(
    "normalize",
    normalizedAddressSchema,
    ADDRESS_SYSTEM,
    addressPrompt(raw),
  );
  return { data: { ...data, raw }, result };
}
