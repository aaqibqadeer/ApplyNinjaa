/**
 * Flattening a profile into the labelled values the manual-fill menu offers.
 *
 * Shared by the service worker (which builds the menu) and nothing else today;
 * kept separate from `quick-fill.ts` because that module answers "what belongs
 * in THIS field?" while this one answers "what does this profile contain?".
 */

import type { ProfileFillData } from "./types";

export interface ProfileField {
  label: string;
  value: string;
}

/** Chrome renders a long menu badly, and nobody scrolls 80 items. */
export const MAX_FIELDS_PER_PROFILE = 40;

const CONTACT_LABELS: Array<[string, string]> = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["address", "Street address"],
  ["city", "City"],
  ["state", "State"],
  ["zip", "ZIP"],
  ["country", "Country"],
];

const LINK_LABELS: Array<[string, string]> = [
  ["linkedin", "LinkedIn"],
  ["github", "GitHub"],
  ["portfolio", "Portfolio"],
  ["other", "Other link"],
];

function push(into: ProfileField[], label: string, value: unknown): void {
  if (typeof value !== "string" || !value.trim()) return;
  into.push({ label, value: value.trim() });
}

/**
 * Every value on a profile worth pasting into a field, in the order a form
 * usually asks for them: identity, address, links, current role, preferences,
 * the user's own saved answers, then EEO.
 */
export function profileFields(profile: ProfileFillData): ProfileField[] {
  const fields: ProfileField[] = [];

  for (const [key, label] of CONTACT_LABELS) {
    push(fields, label, profile.contact?.[key]);
  }
  const first = profile.contact?.firstName;
  const last = profile.contact?.lastName;
  if (first && last)
    fields.splice(2, 0, { label: "Full name", value: `${first} ${last}` });

  for (const [key, label] of LINK_LABELS) {
    push(fields, label, profile.links?.[key]);
  }

  push(fields, "Current title", profile.currentTitle);
  push(fields, "Current company", profile.currentCompany);
  push(fields, "School", profile.latestSchool);
  push(fields, "Degree", profile.latestDegree);
  push(fields, "Work authorization", profile.workAuthorization);
  push(fields, "Work arrangement", profile.workArrangement);
  push(fields, "Salary expectation", profile.salaryExpectation);
  if (profile.employmentTypes?.length) {
    push(fields, "Employment types", profile.employmentTypes.join(", "));
  }

  for (const saved of profile.customFields ?? []) {
    push(fields, saved.label || "Saved answer", saved.value);
  }

  if (profile.eeo) {
    push(fields, "Gender", profile.eeo.gender);
    push(fields, "Race / ethnicity", profile.eeo.raceEthnicity);
    push(fields, "Veteran status", profile.eeo.veteranStatus);
    push(fields, "Disability status", profile.eeo.disabilityStatus);
  }

  return fields.slice(0, MAX_FIELDS_PER_PROFILE);
}

/** Menu titles must stay readable — show the label and a clipped value. */
export function fieldMenuTitle(field: ProfileField): string {
  const value =
    field.value.length > 40 ? `${field.value.slice(0, 40)}…` : field.value;
  return `${field.label} — ${value}`;
}
