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

export interface AnalyzeJobResponse {
  ok: true;
  profileId: string;
  profileName: string;
  filterResults: FilterResult[];
  fitScore: number;
  fitReasoning: string;
  company: string | null;
  roleTitle: string | null;
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

export interface ProfileSummary {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface ApiError {
  error: string;
  code?: "AI_CAP_REACHED" | "RATE_LIMITED";
  upgradeUrl?: string;
  used?: number;
  cap?: number;
}
