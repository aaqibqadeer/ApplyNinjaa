/**
 * Form value types + the empty profile shape.
 *
 * These live outside `components/profiles/ProfileForm.tsx` on purpose: that
 * file is a `"use client"` module, and importing a *runtime* value from it
 * into a Server Component yields a client-reference proxy whose own props are
 * non-enumerable — so `{ ...emptyProfileValues }` silently produces `{}`.
 * Keeping the value in a plain module lets both sides import it safely.
 */

export interface ExperienceValue {
  title: string;
  company: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  current: boolean;
  description?: string | null;
}

export interface EducationValue {
  school: string;
  degree?: string | null;
  field?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  gpa?: string | null;
}

export interface ProjectValue {
  name: string;
  description?: string | null;
  url?: string | null;
  technologies: string[];
}

export interface CustomFieldValue {
  label: string;
  value: string;
}

export interface ProfileFormValues {
  name: string;
  contact: Record<string, string | null | undefined>;
  summary: string | null;
  skills: string[];
  experience: ExperienceValue[];
  education: EducationValue[];
  projects: ProjectValue[];
  customFields: CustomFieldValue[];
  knowledgeBase: string;
  links: Record<string, string | null | undefined>;
  workAuthorization: string | null;
  workArrangement: string | null;
  employmentTypes: string[];
  salaryExpectation: string | null;
  eeo: {
    consent: boolean;
    gender: string | null;
    raceEthnicity: string | null;
    veteranStatus: string | null;
    disabilityStatus: string | null;
  } | null;
}

/**
 * The subset `/api/ai/parse-resume` returns (lib/ai/tasks.ts `parsedResumeSchema`).
 * Merged over the current form values — it never carries a profile name, job
 * preferences, or EEO answers, so those survive a re-parse.
 */
export type ParsedResumeValues = Pick<
  ProfileFormValues,
  | "contact"
  | "summary"
  | "skills"
  | "experience"
  | "education"
  | "projects"
  | "links"
>;

export const emptyProfileValues: ProfileFormValues = {
  name: "Primary",
  contact: {},
  summary: null,
  skills: [],
  experience: [],
  education: [],
  projects: [],
  customFields: [],
  knowledgeBase: "",
  links: {},
  workAuthorization: null,
  workArrangement: null,
  employmentTypes: [],
  salaryExpectation: null,
  eeo: null,
};
