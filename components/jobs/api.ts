/**
 * components/jobs/api.ts — thin client fetch wrappers for the Phase 3 jobs API.
 *
 * The backend routes (`/api/jobs*`) are added by a separate agent; until they
 * land these wrappers degrade gracefully — every call returns a discriminated
 * `JobsResult<T>` carrying the HTTP status so callers can toast a friendly
 * message on 404 (not built yet) / 402 (AI cap) instead of throwing.
 *
 * Import-safe from client components only (uses `fetch`).
 */

import type { CreateJobParams, Job, JobEstimate } from "./types";

/** Outcome of a jobs API call. `ok` narrows `data`. */
export type JobsResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code?: string };

async function request<T>(
  input: string,
  init?: RequestInit,
): Promise<JobsResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, error: "Network error — please retry." };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) {
    return { ok: true, status: res.status, data: body as T };
  }
  return {
    ok: false,
    status: res.status,
    error:
      typeof body.error === "string"
        ? body.error
        : res.status === 404
          ? "AI passes aren't available yet."
          : "Something went wrong.",
    code: typeof body.code === "string" ? body.code : undefined,
  };
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export function listJobs(): Promise<JobsResult<{ jobs: Job[] }>> {
  return request<{ jobs: Job[] }>("/api/jobs");
}

export function getJob(id: string): Promise<JobsResult<{ job: Job }>> {
  return request<{ job: Job }>(`/api/jobs/${id}`);
}

/**
 * Create a job. With `estimateOnly: true` the backend responds `{ estimate }`
 * instead of `{ job }`; the union return type covers both.
 */
export function createJob(
  params: CreateJobParams,
): Promise<JobsResult<{ job?: Job; estimate?: JobEstimate }>> {
  return request<{ job?: Job; estimate?: JobEstimate }>("/api/jobs", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(params),
  });
}

export function cancelJob(id: string): Promise<JobsResult<{ job: Job }>> {
  return request<{ job: Job }>(`/api/jobs/${id}/cancel`, { method: "POST" });
}

export function resumeJob(id: string): Promise<JobsResult<{ job: Job }>> {
  return request<{ job: Job }>(`/api/jobs/${id}/resume`, { method: "POST" });
}
