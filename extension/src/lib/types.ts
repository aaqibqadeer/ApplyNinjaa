/** API response shapes (mirrors the Next.js backend routes). */

export type FilterVerdict = "Yes" | "No" | "Neutral";

export interface FilterResult {
  filterId: string;
  label: string;
  verdict: FilterVerdict;
}

export interface Usage {
  used: number;
  cap: number;
}

export type ExclusionKind = "company" | "keyword";

/** GET /api/exclusions — a plain read, no AI action. */
export interface ExclusionRule {
  id: string;
  kind: ExclusionKind;
  value: string;
  isActive: boolean;
}

export interface ExclusionMatch {
  kind: ExclusionKind;
  value: string;
}

/** Read off the posting during the same analysis — costs no extra AI action. */
export interface JobDetails {
  location: string | null;
  workArrangement: string | null;
  employmentType: string | null;
  seniority: string | null;
  salaryText: string | null;
  sponsorshipMentioned: "yes" | "no" | null;
  postedAt: string | null;
  requiredSkills: string[];
}

export interface AnalyzeJobResponse {
  ok: true;
  profileId: string;
  profileName: string;
  filterResults: FilterResult[];
  fitScore: number;
  fitReasoning: string;
  company: string | null;
  roleTitle: string | null;
  jobDetails: JobDetails | null;
  exclusionMatches: ExclusionMatch[];
  usage: Usage;
}

export interface FieldMappingEntry {
  fieldId: string;
  value: string | null;
  confidence: "high" | "low";
}

export interface MapFieldsResponse {
  ok: true;
  profileId: string;
  profileName: string;
  mappings: FieldMappingEntry[];
  usage: Usage;
}

/** GET /api/usage — costs no AI action. */
export interface UsageResponse {
  ok: true;
  used: number;
  cap: number;
  planSlug: string;
  planName: string;
  source: "paid" | "trial" | "free";
}

/** A CV / cover letter stored on the profile, for a form's file input. */
export interface ProfileDocument {
  kind: "resume" | "cover_letter";
  filename: string;
  contentType: string;
  size: number;
  /** Same-origin path; fetch it with the Bearer token. */
  url: string;
}

/** GET /api/profiles/[id]/fill-data — the offline Quick Fill source. */
export interface ProfileFillData {
  id: string;
  name: string;
  contact: Record<string, string | null | undefined>;
  links: Record<string, string | null | undefined>;
  workAuthorization: string | null;
  workArrangement: string | null;
  employmentTypes: string[];
  salaryExpectation: string | null;
  customFields: Array<{ label: string; value: string }>;
  documents: ProfileDocument[];
  currentTitle: string | null;
  currentCompany: string | null;
  latestSchool: string | null;
  latestDegree: string | null;
  eeo: {
    gender: string | null;
    raceEthnicity: string | null;
    veteranStatus: string | null;
    disabilityStatus: string | null;
  } | null;
}

/** A row from GET /api/applications, trimmed to what Re-track needs. */
export interface TrackedApplication {
  id: string;
  company: string;
  roleTitle: string;
  url: string | null;
  appliedAt: string;
}

/** POST /api/applications/[id]/retrack — the row after the page was attached. */
export interface RetrackedApplication {
  id: string;
  company: string;
  roleTitle: string;
  url: string | null;
  additionalLinks: Array<{ url: string; platform: string | null }>;
}

export interface ProfileSummary {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface ApiError {
  error: string;
  code?: "AI_CAP_REACHED" | "RATE_LIMITED" | "FEATURE_LOCKED";
  feature?: string;
  requiredPlan?: string | null;
  upgradeUrl?: string;
  used?: number;
  cap?: number;
}
