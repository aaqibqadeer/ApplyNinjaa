/**
 * components/leads/duplicates.ts — client types + thin fetch wrappers for the
 * duplicate-review API (Phase 3). Backend routes are owned by a separate agent;
 * these degrade gracefully (status-carrying results) so the review UI builds
 * and typechecks before they land.
 *
 * Import-safe from client components only (uses `fetch`).
 */

import type { Lead } from "@/lib/db/schema";

/** One pair of leads flagged as a likely duplicate. */
export interface DuplicateCandidate {
  id: string;
  leadA: Lead;
  leadB: Lead;
  /** The signals that matched (e.g. ["phone", "name"]). */
  matchedOn: string[];
  /** Match confidence, 0–1. */
  confidence: number;
  status: "pending" | "merged" | "dismissed";
}

export type DuplicatesResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code?: string };

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

async function request<T>(
  input: string,
  init?: RequestInit,
): Promise<DuplicatesResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, error: "Network error — please retry." };
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  return {
    ok: false,
    status: res.status,
    error:
      typeof body.error === "string"
        ? body.error
        : res.status === 404
          ? "Duplicate review isn't available yet."
          : "Something went wrong.",
    code: typeof body.code === "string" ? body.code : undefined,
  };
}

export function listDuplicates(
  status: DuplicateCandidate["status"] = "pending",
): Promise<DuplicatesResult<{ candidates: DuplicateCandidate[] }>> {
  return request<{ candidates: DuplicateCandidate[] }>(
    `/api/duplicates?status=${status}`,
  );
}

/**
 * Merge a candidate: `primaryId` is the surviving lead; `fieldChoices` maps a
 * lead field name to the id of the lead whose value should win for that field.
 */
export function mergeDuplicate(
  id: string,
  input: { primaryId: string; fieldChoices: Record<string, string> },
): Promise<DuplicatesResult<{ lead?: Lead }>> {
  return request<{ lead?: Lead }>(`/api/duplicates/${id}/merge`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
}

export function dismissDuplicate(
  id: string,
): Promise<DuplicatesResult<unknown>> {
  return request<unknown>(`/api/duplicates/${id}/dismiss`, { method: "POST" });
}
