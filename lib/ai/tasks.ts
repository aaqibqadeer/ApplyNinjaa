/**
 * lib/ai/tasks.ts — ApplyNinjaa's typed AI tasks (Node).
 *
 * Every product AI capability is one function here: build the prompt, call the
 * provider-neutral `ai()` accessor (DeepSeek in this fork via
 * AI_DEFAULT_PROVIDER), extract the JSON, validate with Zod. Routes never
 * assemble prompts or parse model output themselves — and they must wrap each
 * call with `enforceAiQuota`/`recordAiCall` (lib/usage) since every function
 * here is exactly one billable AI call.
 */

import { z } from "zod";

import {
  filterVerdictSchema,
  profileContactSchema,
  profileEducationSchema,
  profileExperienceSchema,
  profileLinksSchema,
  profileProjectSchema,
  emailClassificationSchema,
  type Profile,
} from "@/lib/db/schema";

import { ai } from "./index";
import type { GenerateResult } from "./adapter";

/** Model responses may wrap JSON in prose/code fences — extract the payload. */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("AI response contained no JSON");
  const trimmed = candidate.slice(start).trim();
  // Walk back from the end to the final closing bracket.
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (end === -1) throw new Error("AI response contained no JSON");
  return JSON.parse(trimmed.slice(0, end + 1)) as unknown;
}

async function generateJson<T>(
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
): Promise<{ data: T; result: GenerateResult }> {
  const result = await ai().generate({ system, prompt, temperature: 0 });
  const data = schema.parse(extractJson(result.text));
  return { data, result };
}

/** Trim overlong page/job text so prompts stay within sane token budgets. */
function clip(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/** The profile fields the AI needs for matching/scoring — no EEO, no ids. */
function profileSummaryForPrompt(profile: Profile): string {
  return JSON.stringify({
    summary: profile.summary,
    skills: profile.skills,
    experience: profile.experience,
    education: profile.education,
    projects: profile.projects,
    workAuthorization: profile.workAuthorization,
    workArrangement: profile.workArrangement,
    employmentTypes: profile.employmentTypes,
  });
}

/* -- Resume parsing --------------------------------------------------------- */

export const parsedResumeSchema = z.object({
  contact: profileContactSchema.default({}),
  summary: z.string().nullable().default(null),
  skills: z.array(z.string()).default([]),
  experience: z.array(profileExperienceSchema).default([]),
  education: z.array(profileEducationSchema).default([]),
  projects: z.array(profileProjectSchema).default([]),
  links: profileLinksSchema.default({}),
});
export type ParsedResume = z.infer<typeof parsedResumeSchema>;

export async function parseResume(
  resumeText: string,
): Promise<{ data: ParsedResume; result: GenerateResult }> {
  const system =
    "You are a precise resume parser. Respond with ONLY a JSON object — no prose, no markdown fences.";
  const prompt = `Parse this resume into JSON with exactly these keys:
{
  "contact": {"firstName","lastName","email","phone","address","city","state","zip","country"} (string or null each),
  "summary": string|null (2-3 sentence professional summary; write one from the resume if absent),
  "skills": string[],
  "experience": [{"title","company","location","startDate","endDate","current","description"}] (dates as written, e.g. "Jun 2022"; current: boolean),
  "education": [{"school","degree","field","startDate","endDate","gpa"}],
  "projects": [{"name","description","url","technologies"}] (technologies: string[]),
  "links": {"linkedin","github","portfolio","other"} (string or null each)
}
Use null for anything absent. Do not invent information.

Resume text:
"""
${clip(resumeText, 24_000)}
"""`;
  return generateJson(parsedResumeSchema, system, prompt);
}

/* -- Form field mapping ------------------------------------------------------ */

/** A detected form field, as sent by the extension. */
export const detectedFieldSchema = z.object({
  /** The extension's element handle (index into its detected-field list). */
  id: z.string(),
  label: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  placeholder: z.string().nullable().optional(),
  fieldType: z.string().nullable().optional(),
  /** For selects/radios: the allowed choices. */
  options: z.array(z.string()).optional(),
});
export type DetectedField = z.infer<typeof detectedFieldSchema>;

export const fieldMappingSchema = z.object({
  mappings: z.array(
    z.object({
      fieldId: z.string(),
      /** Null = the AI could not confidently map this field. */
      value: z.string().nullable(),
      confidence: z.enum(["high", "low"]),
    }),
  ),
});
export type FieldMapping = z.infer<typeof fieldMappingSchema>;

export async function mapFormFields(
  profile: Profile,
  fields: DetectedField[],
): Promise<{ data: FieldMapping; result: GenerateResult }> {
  const system =
    "You map a job applicant's profile onto web form fields. Respond with ONLY JSON.";
  const prompt = `Applicant profile (JSON):
${JSON.stringify({
    contact: profile.contact,
    summary: profile.summary,
    skills: profile.skills,
    experience: profile.experience,
    education: profile.education,
    links: profile.links,
    workAuthorization: profile.workAuthorization,
    workArrangement: profile.workArrangement,
    employmentTypes: profile.employmentTypes,
    salaryExpectation: profile.salaryExpectation,
  })}

Form fields (JSON array; "id" identifies each field):
${JSON.stringify(fields.slice(0, 80))}

Return {"mappings":[{"fieldId","value","confidence"}]} with one entry PER field:
- value: the exact string to type/select. For fields with "options", value MUST be one of the options verbatim (pick the closest match) or null.
- confidence: "high" only when the profile clearly provides the answer; otherwise "low".
- Use null value + "low" when unsure — NEVER invent data (especially for legal/veteran/disability/citizenship questions not present in the profile).`;
  return generateJson(fieldMappingSchema, system, prompt);
}

/* -- Job analysis (filter verdicts + fit score, ONE billable call) ----------- */

export const jobAnalysisSchema = z.object({
  results: z.array(
    z.object({
      filterId: z.string(),
      verdict: filterVerdictSchema,
    }),
  ),
  fitScore: z.number().min(0).max(100),
  fitReasoning: z.string(),
  /** For the one-click Track button. */
  company: z.string().nullable().default(null),
  roleTitle: z.string().nullable().default(null),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

export interface FilterForClassification {
  id: string;
  label: string;
  description?: string | null;
}

/**
 * The extension popup's one-shot analysis: every enabled filter gets a
 * Yes/No/Neutral verdict AND the profile gets a 0-100 fit score, in a single
 * generation so it costs the user one AI call.
 */
export async function analyzeJob(
  jobText: string,
  filters: FilterForClassification[],
  profile: Profile,
): Promise<{ data: JobAnalysis; result: GenerateResult }> {
  const system =
    "You screen job postings for a job seeker: evaluate their filters and score their fit. Respond with ONLY JSON.";
  const prompt = `Candidate profile:
${profileSummaryForPrompt(profile)}

Job posting text:
"""
${clip(jobText, 16_000)}
"""

Filters (JSON array):
${JSON.stringify(filters.map((f) => ({ id: f.id, label: f.label, guidance: f.description })))}

Return {"results":[{"filterId","verdict"}], "fitScore", "fitReasoning", "company", "roleTitle"}:
- one results entry per filter; verdict is exactly "Yes", "No", or "Neutral"
  ("Yes" when the posting clearly satisfies/asserts the filter, "No" when it
  clearly contradicts it, "Neutral" when the posting doesn't say),
- fitScore: integer 0-100 (skills/experience/seniority match vs the profile;
  ignore demographics),
- fitReasoning: ONE sentence explaining the score,
- company/roleTitle: the hiring company and job title from the posting (null
  when not identifiable).`;
  return generateJson(jobAnalysisSchema, system, prompt);
}

/* -- Gmail email classification ---------------------------------------------- */

export const emailBatchClassificationSchema = z.object({
  results: z.array(
    z.object({
      emailId: z.string(),
      classification: emailClassificationSchema,
      /** Company the email is about, when identifiable. */
      company: z.string().nullable().default(null),
      /** Role title mentioned, when identifiable. */
      roleTitle: z.string().nullable().default(null),
    }),
  ),
});
export type EmailBatchClassification = z.infer<
  typeof emailBatchClassificationSchema
>;

export interface EmailForClassification {
  id: string;
  from: string;
  subject: string;
  snippet: string;
}

export async function classifyEmails(
  emails: EmailForClassification[],
): Promise<{ data: EmailBatchClassification; result: GenerateResult }> {
  const system =
    "You classify job-application emails for an application tracker. Respond with ONLY JSON.";
  const prompt = `Emails (JSON array):
${JSON.stringify(emails)}

Return {"results":[{"emailId","classification","company","roleTitle"}]} with one entry per email.
classification is exactly one of "interview" (interview invitation/scheduling), "rejection", "offer", "assessment" (online assessment / take-home / coding test), or "other" (anything else, including marketing and job alerts).
company/roleTitle: extract when identifiable, else null.`;
  return generateJson(emailBatchClassificationSchema, system, prompt);
}
