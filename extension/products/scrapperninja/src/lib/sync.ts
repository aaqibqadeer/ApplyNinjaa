/**
 * Drain the offline capture queue to the backend.
 *
 * Records are grouped by (sourceType, campaignId, sessionId) — the shape
 * POST /api/leads/ingest expects, which carries those three at the BATCH level
 * (not per record) — and sent in chunks of 50 with exponential backoff. A
 * chrome.alarms tick (every 5 minutes, registered in the service worker) calls
 * syncNow() so a queue that failed to flush keeps retrying on its own.
 *
 * Idempotency comes from the clientId → clientCaptureId upsert on the server
 * (unique-sparse (organization_id, client_capture_id)), so a retry never
 * duplicates.
 */

import { api, SignInRequiredError } from "../../../../shared/api";

import {
  counts,
  listPending,
  markFailed,
  markSynced,
  markSyncing,
  type LeadSourceType,
  type QueueRecord,
} from "./queue";

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 6;
/** Backoff schedule (ms) indexed by prior attempt count, capped at the end. */
const BACKOFF_MS = [0, 1_000, 5_000, 15_000, 60_000, 300_000];

/** POST /api/leads/ingest response (built by the web app). */
interface IngestResponse {
  ok: true;
  received: number;
  created: number;
  updated: number;
  needsReview: number;
  rescued: number;
}

/** First non-empty line of a snippet, for a businessName fallback. */
function firstLine(snippet: string | null | undefined): string | null {
  if (!snippet) return null;
  for (const line of snippet.split("\n")) {
    const clean = line.trim();
    if (clean.length > 0) return clean.slice(0, 300);
  }
  return null;
}

/** Map one queued record to an ingest RECORD (batch-level fields excluded). */
function toIngestRecord(record: QueueRecord): Record<string, unknown> {
  const p = record.payload;
  // The server requires a non-empty businessName; generic/manual snippets have
  // none, so fall back to the snippet's first line (the rescue pass replaces it).
  const businessName =
    p.businessName?.trim() || firstLine(p.rawSnippet) || "Untitled capture";
  return {
    clientCaptureId: record.clientId,
    businessName,
    category: p.category ?? null,
    categories: p.categories ?? [],
    phone: p.phone ?? null,
    website: p.website ?? null,
    address: p.address ?? {},
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    rating: p.rating ?? null,
    reviewCount: p.reviewCount ?? null,
    priceLevel: p.priceLevel ?? null,
    hours: p.hours ?? null,
    plusCode: p.plusCode ?? null,
    sourceUrl: p.sourceUrl ?? null,
    parseIssues: p.parseIssues ?? [],
    rawSnippet: p.rawSnippet ?? null,
  };
}

/** Group key for one ingest batch: same source, campaign and session. */
function groupKey(record: QueueRecord): string {
  return `${record.sourceType}|${record.campaignId}|${record.sessionId ?? ""}`;
}

interface Batch {
  sourceType: LeadSourceType;
  campaignId: string | null;
  sessionId: string | null;
  records: QueueRecord[];
}

/** Split a set of ready records into per-(source,campaign,session) batches. */
function groupBatches(records: QueueRecord[]): Batch[] {
  const groups = new Map<string, Batch>();
  for (const record of records) {
    const key = groupKey(record);
    let batch = groups.get(key);
    if (!batch) {
      batch = {
        sourceType: record.sourceType,
        campaignId: record.campaignId || null,
        sessionId: record.sessionId,
        records: [],
      };
      groups.set(key, batch);
    }
    batch.records.push(record);
  }
  return [...groups.values()];
}

let running = false;

/**
 * Flush every ready record, one (source,campaign,session) batch at a time.
 * Never throws — a sign-in or network error just leaves records queued for the
 * next tick. Returns how many records remain pending.
 */
export async function syncNow(): Promise<{ remaining: number }> {
  if (running) return { remaining: (await counts()).pending };
  running = true;
  try {
    for (;;) {
      const ready = await listPending(BATCH_SIZE);
      const now = Date.now();
      // Respect per-record backoff for previously-failed records.
      const due = ready.filter((r) => {
        if (r.attempts >= MAX_ATTEMPTS) return false;
        if (r.attempts === 0) return true;
        const wait = BACKOFF_MS[Math.min(r.attempts, BACKOFF_MS.length - 1)];
        return now - r.createdAt >= wait;
      });
      if (due.length === 0) break;

      let progressed = false;
      for (const batch of groupBatches(due)) {
        const ids = batch.records.map((r) => r.clientId);
        await markSyncing(ids);
        try {
          await api<IngestResponse>("/api/leads/ingest", {
            method: "POST",
            body: {
              sourceType: batch.sourceType,
              campaignId: batch.campaignId,
              sessionId: batch.sessionId,
              records: batch.records.map(toIngestRecord),
            },
          });
          await markSynced(ids);
          progressed = true;
        } catch (error) {
          const message =
            error instanceof SignInRequiredError
              ? "Signed out"
              : error instanceof Error
                ? error.message
                : "Sync failed";
          await markFailed(ids, message);
        }
      }
      // If nothing in this pass succeeded, stop; the alarm retries after backoff.
      if (!progressed) break;
    }
    return { remaining: (await counts()).pending };
  } finally {
    running = false;
  }
}
