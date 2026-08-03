/**
 * components/jobs/types.ts — client-only types + helpers for the Phase 3 AI
 * pass jobs UI.
 *
 * These mirror the (in-progress) backend job contracts so the UI can be built
 * and typechecked before `lib/jobs` lands. When the backend defines canonical
 * Zod schemas/types, this file should re-export or align with them — until then
 * it is the single source of truth for the shapes the UI consumes.
 *
 * Pure module (no React, no fetch) so it can be imported anywhere.
 */

/** AI-pass job kinds a user can launch over a lead selection. */
export const JOB_TYPES = [
  "normalize",
  "dedupe",
  "label",
  "enrich",
  "score",
  "offer",
  "rescue",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

/** Lifecycle of an async job. */
export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Human labels + one-line descriptions for each job type (UI copy). */
export const JOB_TYPE_META: Record<
  JobType,
  { label: string; description: string; consumesAi: boolean }
> = {
  normalize: {
    label: "Normalize",
    description: "Clean phone, website, and address formatting.",
    consumesAi: true,
  },
  dedupe: {
    label: "Find duplicates",
    description: "Scan the selection for likely duplicate businesses.",
    consumesAi: false,
  },
  label: {
    label: "Label",
    description: "Tag each lead with a business category / sub-type.",
    consumesAi: true,
  },
  enrich: {
    label: "Enrich",
    description: "Discover emails, socials, tech stack, and site health.",
    consumesAi: true,
  },
  score: {
    label: "Score",
    description: "Rate each lead's fit from 0–100 with reasoning.",
    consumesAi: true,
  },
  offer: {
    label: "Offer lines",
    description: "Generate a personalized cold-email opener per lead.",
    consumesAi: true,
  },
  rescue: {
    label: "Rescue",
    description: "Re-parse records flagged as needing review.",
    consumesAi: true,
  },
};

/** A single async job over a lead selection. */
export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  /** Total records the job will process. */
  total: number;
  /** Records processed so far. */
  processed: number;
  succeeded: number;
  failed: number;
  /** Free-form failure message when `status === "failed"`. */
  error?: string | null;
  /** Job-type-specific parameters (e.g. offer variants, promptId). */
  params?: Record<string, unknown> | null;
  startedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
}

/** Response when a job is created with `estimateOnly: true`. */
export interface JobEstimate {
  aiCalls: number;
  remainingQuota: number;
}

/** Parameters accepted by `POST /api/jobs`. */
export interface CreateJobParams {
  type: JobType;
  leadIds?: string[];
  /** Filter describing the selection when running filter-wide. */
  query?: Record<string, unknown>;
  /** Job-type-specific options (offer promptId/variants/skipEdited, …). */
  params?: Record<string, unknown>;
  estimateOnly?: boolean;
}

/** A job is "active" while it is still queued or running. */
export function isJobActive(job: Job): boolean {
  return job.status === "queued" || job.status === "running";
}

const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * A running job is "stale" (resumable) when it started more than ten minutes
 * ago and has had no update since — i.e. it likely died without finishing.
 */
export function isJobStale(job: Job, now: number = Date.now()): boolean {
  if (job.status !== "running") return false;
  const started = toMs(job.startedAt);
  if (started === null || now - started < TEN_MINUTES_MS) return false;
  const updated = toMs(job.updatedAt) ?? started;
  return now - updated >= TEN_MINUTES_MS;
}

function toMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Progress as a 0–100 percentage (0 when `total` is unknown/zero). */
export function jobProgressPercent(job: Job): number {
  if (!job.total || job.total <= 0) return job.status === "succeeded" ? 100 : 0;
  return Math.min(100, Math.round((job.processed / job.total) * 100));
}
