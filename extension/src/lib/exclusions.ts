/**
 * Offline exclusion matching — mirrors `lib/exclusions/service.ts` on the
 * backend, the same way `quick-fill.ts` mirrors the server's field logic.
 *
 * It lives here rather than behind an API call because the whole point of an
 * exclusion is that it warns you BEFORE you spend an AI action on a page: the
 * popup fetches the rules once on open (a plain read, no AI) and matches them
 * against the text it already collected.
 *
 * Keep the two implementations in step — a rule that fires on the dashboard
 * and not in the popup is worse than no warning at all.
 */

import type { ExclusionMatch, ExclusionRule } from "./types";

export interface ExclusionSubject {
  company?: string | null;
  roleTitle?: string | null;
  jobText?: string | null;
  domain?: string | null;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

    if (rule.kind === "company") {
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
