/**
 * Deterministic, offline field matching — the zero-AI half of autofill.
 *
 * Runs in the POPUP, not the page: the matcher needs the profile payload and
 * this rules table, and injected functions must be closure-free (see the hard
 * constraint at the top of dom-actions.ts). Only the computed
 * `{id, value}` list crosses into the page, via the existing `fillFields`.
 *
 * Because it never calls the backend, Quick Fill keeps working after the
 * monthly AI cap is reached — which is the entire point of having it.
 */

import type { CollectedField } from "./dom-actions";
import type { ProfileFillData } from "./types";

export interface QuickFillResult {
  values: Array<{ id: string; value: string }>;
  /** Fields we chose NOT to guess at — surfaced for manual review. */
  unmatched: string[];
}

/** Lowercase, strip punctuation, collapse whitespace, drop a trailing "*". */
function normalize(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[*:_]/g, " ")
    .replace(/[^\p{L}\p{N}\s@.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every haystack we'll test a rule against, most-specific first. */
function haystacks(field: CollectedField): string[] {
  return [
    normalize(field.autocomplete),
    normalize(field.label),
    normalize(field.name),
    normalize(field.placeholder),
  ].filter(Boolean);
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Rules are ordered: the FIRST whose pattern matches any haystack wins, so
 * put the specific ones ("first name") above the general ("name").
 */
interface Rule {
  patterns: RegExp[];
  value: (p: ProfileFillData) => string | null;
}

function buildRules(): Rule[] {
  const c = (p: ProfileFillData, key: string): string | null =>
    firstNonEmpty(p.contact?.[key]);
  const l = (p: ProfileFillData, key: string): string | null =>
    firstNonEmpty(p.links?.[key]);

  return [
    // -- identity ---------------------------------------------------------
    {
      patterns: [/\bgiven name\b/, /\bfirst.?name\b/, /^fname$/, /\bforename\b/],
      value: (p) => c(p, "firstName"),
    },
    {
      patterns: [
        /\bfamily name\b/,
        /\blast.?name\b/,
        /^lname$/,
        /\bsurname\b/,
        /\bfamily.?name\b/,
      ],
      value: (p) => c(p, "lastName"),
    },
    {
      patterns: [/\bfull.?name\b/, /^name$/, /\byour name\b/, /\bcandidate name\b/],
      value: (p) => {
        const first = c(p, "firstName");
        const last = c(p, "lastName");
        return first && last ? `${first} ${last}` : (first ?? last);
      },
    },
    { patterns: [/\bemail\b/, /\be-?mail\b/], value: (p) => c(p, "email") },
    {
      patterns: [/\bphone\b/, /\btel\b/, /\bmobile\b/, /\bcell\b/],
      value: (p) => c(p, "phone"),
    },

    // -- address (street before the generic "address") --------------------
    {
      patterns: [/\bstreet\b/, /address.?line.?1/, /\baddress1\b/],
      value: (p) => c(p, "address"),
    },
    { patterns: [/\bcity\b/, /\btown\b/, /\blocality\b/], value: (p) => c(p, "city") },
    {
      patterns: [/\bstate\b/, /\bprovince\b/, /\bregion\b/],
      value: (p) => c(p, "state"),
    },
    {
      patterns: [/\bzip\b/, /\bpostal\b/, /\bpostcode\b/],
      value: (p) => c(p, "zip"),
    },
    { patterns: [/\bcountry\b/], value: (p) => c(p, "country") },
    { patterns: [/\baddress\b/], value: (p) => c(p, "address") },

    // -- links ------------------------------------------------------------
    { patterns: [/\blinkedin\b/], value: (p) => l(p, "linkedin") },
    { patterns: [/\bgithub\b/], value: (p) => l(p, "github") },
    {
      patterns: [/\bportfolio\b/, /\bpersonal.?(site|website)\b/, /\bwebsite\b/],
      value: (p) => l(p, "portfolio"),
    },

    // -- current role / education -----------------------------------------
    {
      patterns: [
        /\bcurrent (company|employer)\b/,
        /\bemployer\b/,
        /\bcompany\b/,
        /\borganization\b/,
      ],
      value: (p) => p.currentCompany,
    },
    {
      patterns: [
        /\bcurrent (title|role|position)\b/,
        /\bjob.?title\b/,
        /\btitle\b/,
        /\bposition\b/,
      ],
      value: (p) => p.currentTitle,
    },
    {
      patterns: [/\bschool\b/, /\buniversity\b/, /\bcollege\b/, /\binstitution\b/],
      value: (p) => p.latestSchool,
    },
    { patterns: [/\bdegree\b/, /\bqualification\b/], value: (p) => p.latestDegree },

    // -- preferences ------------------------------------------------------
    {
      patterns: [
        /\bsalary\b/,
        /\bcompensation\b/,
        /\bexpected pay\b/,
        /\bdesired pay\b/,
      ],
      value: (p) => p.salaryExpectation,
    },
    {
      patterns: [
        /\bwork authoriz/,
        /\bauthorized to work\b/,
        /\bsponsorship\b/,
        /\bvisa\b/,
        /\brequire sponsorship\b/,
      ],
      value: (p) => p.workAuthorization,
    },
    {
      patterns: [/\bremote\b/, /\bwork arrangement\b/, /\bhybrid\b/, /\bonsite\b/],
      value: (p) => p.workArrangement,
    },

    // -- EEO self-identification ------------------------------------------
    { patterns: [/\bgender\b/, /\bsex\b/], value: (p) => p.eeo?.gender ?? null },
    {
      patterns: [/\brace\b/, /\bethnic/, /\bhispanic\b/],
      value: (p) => p.eeo?.raceEthnicity ?? null,
    },
    {
      patterns: [/\bveteran\b/, /\bmilitary\b/, /\bprotected veteran\b/],
      value: (p) => p.eeo?.veteranStatus ?? null,
    },
    {
      patterns: [/\bdisabilit/, /\bdisabled\b/],
      value: (p) => p.eeo?.disabilityStatus ?? null,
    },
  ];
}

const RULES = buildRules();

/**
 * Pick a value for one field. Precedence:
 *  1. an exact saved answer (the user wrote it — it beats every heuristic),
 *  2. a saved answer whose label is contained in the field's label,
 *  3. the rules table,
 *  4. nothing — leave it for manual review rather than guessing.
 */
function valueFor(
  field: CollectedField,
  profile: ProfileFillData,
): string | null {
  const hays = haystacks(field);
  if (hays.length === 0) return null;

  for (const saved of profile.customFields) {
    const label = normalize(saved.label);
    if (!label || !saved.value.trim()) continue;
    if (hays.includes(label)) return saved.value;
  }
  for (const saved of profile.customFields) {
    const label = normalize(saved.label);
    // Guard against a 2-3 char label matching half the form.
    if (label.length < 4 || !saved.value.trim()) continue;
    if (hays.some((h) => h.includes(label))) return saved.value;
  }
  for (const rule of RULES) {
    if (!hays.some((h) => rule.patterns.some((re) => re.test(h)))) continue;
    const value = rule.value(profile);
    if (value) return value;
  }
  return null;
}

/**
 * Match every collected field against the profile, offline.
 *
 * `select` and `radio` fields only get a value when one of their options
 * actually matches, so we never type free text into a constrained control —
 * `fillFields` also re-checks this, and already refuses `type="file"`.
 */
export function quickFill(
  fields: CollectedField[],
  profile: ProfileFillData,
): QuickFillResult {
  const values: Array<{ id: string; value: string }> = [];
  const unmatched: string[] = [];

  for (const field of fields) {
    if (field.fieldType === "file") continue;
    const value = valueFor(field, profile);
    const describe =
      field.label ?? field.name ?? field.placeholder ?? `Field ${field.id}`;

    if (!value) {
      unmatched.push(describe);
      continue;
    }
    if (field.options && field.options.length > 0) {
      const match = field.options.find(
        (option) => option.trim().toLowerCase() === value.trim().toLowerCase(),
      );
      const loose =
        match ??
        field.options.find((option) => {
          const o = normalize(option);
          const v = normalize(value);
          return o.length > 0 && v.length > 0 && (o.includes(v) || v.includes(o));
        });
      if (!loose) {
        unmatched.push(describe);
        continue;
      }
      values.push({ id: field.id, value: loose });
      continue;
    }
    values.push({ id: field.id, value });
  }

  return { values, unmatched };
}
