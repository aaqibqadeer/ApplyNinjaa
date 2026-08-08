/**
 * lib/exclusions/service.ts — "never show me this" lists (Node).
 *
 * Exclusions sit next to Valid Job filters but work the other way round: a
 * filter asks the AI for an opinion, an exclusion is the user's own flat rule
 * matched deterministically here. That matters for two reasons — it costs no
 * AI action, so the extension can warn on a page the user hasn't spent
 * anything on, and it can never come back "Neutral".
 *
 * The matcher is mirrored (not shared) in `extension/src/lib/exclusions.ts` so
 * the popup can run it offline, the same way `quick-fill.ts` mirrors the
 * server's field logic. Keep the two in step.
 */

import { z } from "zod";

import type { Session } from "@/lib/auth/types";
import {
  db,
  EXCLUSION_KINDS,
  exclusionKindSchema,
  type ExclusionMatch,
  type ExclusionRule,
} from "@/lib/db";
import { PLAN_FEATURES, requireFeature } from "@/lib/payments/access";

class ExclusionError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ExclusionError";
    this.status = status;
  }
}

export const exclusionInputSchema = z.object({
  kind: exclusionKindSchema,
  value: z.string().min(2, "Too short to match on").max(120),
});
export type ExclusionInput = z.infer<typeof exclusionInputSchema>;

export async function listExclusions(
  session: Session,
): Promise<ExclusionRule[]> {
  return db.listExclusionRulesForUser(session.user.id);
}

export async function createExclusion(
  session: Session,
  input: ExclusionInput,
): Promise<ExclusionRule> {
  if (!session.organizationId) {
    throw new ExclusionError("No active organization", 400);
  }
  // Same entitlement as custom filters: both are "screen for my own
  // deal-breakers", so a plan that unlocks one unlocks the other.
  await requireFeature(session, PLAN_FEATURES.customFilters);
  return db.createExclusionRule({
    organizationId: session.organizationId,
    userId: session.user.id,
    kind: input.kind,
    value: input.value.trim(),
    isActive: true,
  });
}

export async function deleteExclusion(
  session: Session,
  id: string,
): Promise<void> {
  const rule = await db.getExclusionRuleById(id);
  if (!rule || rule.userId !== session.user.id) {
    throw new ExclusionError("Exclusion not found", 404);
  }
  await db.deleteExclusionRule(id);
}

/* -- Matching --------------------------------------------------------------- */

export interface ExclusionSubject {
  company?: string | null;
  roleTitle?: string | null;
  jobText?: string | null;
  domain?: string | null;
}

/** Lowercase and collapse punctuation/whitespace so "Acme, Inc." ≈ "acme inc". */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip the noise words that make two spellings of one company disagree. */
function normalizeCompany(text: string): string {
  return normalize(text)
    .replace(
      /\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|sa|ag)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Which of `rules` fire against this posting.
 *
 * - `company` rules match the detected company name (ignoring Inc/Ltd noise)
 *   or the host, so "Acme" catches both "Acme, Inc." and `acme.com`.
 * - `keyword` rules match on word boundaries in the title and posting text —
 *   substring matching would make "ai" fire on "said".
 *
 * Only the job text is length-capped; a rule that matches nothing simply
 * doesn't appear in the result.
 */
export function matchExclusions(
  subject: ExclusionSubject,
  rules: ExclusionRule[],
): ExclusionMatch[] {
  const company = normalizeCompany(subject.company ?? "");
  const domain = normalize(subject.domain ?? "");
  const haystack = normalize(
    `${subject.roleTitle ?? ""} ${(subject.jobText ?? "").slice(0, 30_000)}`,
  );

  const matches: ExclusionMatch[] = [];
  for (const rule of rules) {
    if (!rule.isActive) continue;
    const value = rule.value.trim();
    if (!value) continue;

    if (rule.kind === EXCLUSION_KINDS.company) {
      const needle = normalizeCompany(value);
      if (!needle) continue;
      const hit =
        (company.length > 0 && company.includes(needle)) ||
        (domain.length > 0 && domain.includes(needle.replace(/\s+/g, "")));
      if (hit) matches.push({ kind: rule.kind, value: rule.value });
      continue;
    }

    const needle = normalize(value);
    if (!needle) continue;
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`,
      "u",
    );
    if (pattern.test(haystack)) {
      matches.push({ kind: rule.kind, value: rule.value });
    }
  }
  return matches;
}

/** Convenience for routes: load the user's rules, then match. */
export async function matchExclusionsForUser(
  session: Session,
  subject: ExclusionSubject,
): Promise<ExclusionMatch[]> {
  const rules = await db.listExclusionRulesForUser(session.user.id);
  return matchExclusions(subject, rules);
}
