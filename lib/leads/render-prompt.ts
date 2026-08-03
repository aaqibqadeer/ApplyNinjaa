/**
 * lib/leads/render-prompt.ts — PURE offer-prompt placeholder validation +
 * rendering (Phase 3, offer lines). No DB, no AI — unit-tested.
 *
 * A prompt's `promptText` may reference a fixed set of `{{placeholder}}` tokens
 * (the columns that make a personalized opening line). Unknown placeholders are
 * a VALIDATION ERROR at save time (execution plan §7 — never a silent blank),
 * so `validatePromptText` is called by the prompt-save service; `renderPrompt`
 * substitutes a lead's values at generation time.
 */

/** The only placeholders a prompt may use (execution plan §7). */
export const OFFER_PLACEHOLDERS = [
  "businessName",
  "category",
  "city",
  "state",
  "website",
  "websiteStatus",
  "rating",
  "reviewCount",
  "businessSize",
  "industrySubType",
  "ownerName",
  "techStack",
] as const;
export type OfferPlaceholder = (typeof OFFER_PLACEHOLDERS)[number];

const PLACEHOLDER_SET = new Set<string>(OFFER_PLACEHOLDERS);
/** Matches `{{ token }}` allowing surrounding whitespace. */
const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/** The lead fields a prompt can reference (a subset of `Lead`, kept loose). */
export interface RenderableLead {
  businessName?: string | null;
  category?: string | null;
  address?: { city?: string | null; state?: string | null } | null;
  website?: string | null;
  websiteStatus?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  businessSize?: string | null;
  industrySubType?: string | null;
  ownerName?: string | null;
  techStack?: string[] | null;
}

export class PromptValidationError extends Error {
  readonly status = 400;
  readonly unknownPlaceholders: string[];
  constructor(unknown: string[]) {
    super(
      `Unknown placeholder(s): ${unknown
        .map((p) => `{{${p}}}`)
        .join(", ")}. Allowed: ${OFFER_PLACEHOLDERS.map((p) => `{{${p}}}`).join(
        ", ",
      )}`,
    );
    this.name = "PromptValidationError";
    this.unknownPlaceholders = unknown;
  }
}

/** Every distinct placeholder token used in the text (deduped, in order). */
export function extractPlaceholders(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(TOKEN_RE)) {
    const token = match[1];
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

/**
 * Validate that a prompt uses only known placeholders. Throws
 * `PromptValidationError` (400) listing the unknown ones; returns the used
 * placeholders on success.
 */
export function validatePromptText(text: string): string[] {
  const used = extractPlaceholders(text);
  const unknown = used.filter((token) => !PLACEHOLDER_SET.has(token));
  if (unknown.length > 0) throw new PromptValidationError(unknown);
  return used;
}

/** A lead's value for one placeholder, as a display string (blank when absent). */
function placeholderValue(
  lead: RenderableLead,
  placeholder: OfferPlaceholder,
): string {
  switch (placeholder) {
    case "businessName":
      return lead.businessName ?? "";
    case "category":
      return lead.category ?? "";
    case "city":
      return lead.address?.city ?? "";
    case "state":
      return lead.address?.state ?? "";
    case "website":
      return lead.website ?? "";
    case "websiteStatus":
      return lead.websiteStatus ?? "";
    case "rating":
      return lead.rating != null ? String(lead.rating) : "";
    case "reviewCount":
      return lead.reviewCount != null ? String(lead.reviewCount) : "";
    case "businessSize":
      return lead.businessSize ?? "";
    case "industrySubType":
      return lead.industrySubType ?? "";
    case "ownerName":
      return lead.ownerName ?? "";
    case "techStack":
      return (lead.techStack ?? []).join(", ");
    default:
      return "";
  }
}

/**
 * Render `text` against a lead, substituting known placeholders with the lead's
 * values (absent values become an empty string). Unknown placeholders throw —
 * they should have been caught at save time, so reaching one is a bug, not a
 * silent blank. Returns the resolved prompt string.
 */
export function renderPrompt(text: string, lead: RenderableLead): string {
  validatePromptText(text);
  return text.replace(TOKEN_RE, (_full, token: string) =>
    placeholderValue(lead, token as OfferPlaceholder),
  );
}
