/**
 * lib/jobs/handlers/dedupe.ts — the `dedupe` job (Phase 3). Unlike the per-lead
 * passes this is a whole-set scan: it (re)computes `dedupeKeys` on each lead,
 * finds pairs that share a key, and writes `duplicate_candidates` rows for a
 * human to review. NOTHING is merged automatically (locked decision #8).
 * Idempotent — an existing candidate for a pair is not re-inserted.
 */

import { db } from "@/lib/db";
import type { Lead } from "@/lib/db/schema";
import {
  dedupeKeys,
  findDuplicatePairs,
  type DedupeItem,
} from "@/lib/leads/dedupe";

import type { HandlerDeps } from "./types";

export interface DedupeRunResult {
  succeeded: number;
  failed: number;
  /** New candidate pairs written this run. */
  pairsWritten: number;
}

/**
 * Run the dedupe scan over `leads`. `onProgress(processed)` is invoked as leads
 * are keyed so the runner can persist counters + honor cancellation; `isCanceled`
 * is checked between chunks. Returns per-lead success/failure and how many new
 * candidate pairs were written.
 */
export async function runDedupe(
  deps: HandlerDeps,
  leads: Lead[],
  hooks: {
    chunkSize: number;
    onProgress: (processed: number) => Promise<void>;
    isCanceled: () => Promise<boolean>;
  },
): Promise<DedupeRunResult> {
  const { orgId } = deps;
  const items: DedupeItem[] = [];
  let succeeded = 0;
  let failed = 0;
  let processed = 0;

  for (let i = 0; i < leads.length; i += hooks.chunkSize) {
    if (await hooks.isCanceled()) break;
    const chunk = leads.slice(i, i + hooks.chunkSize);
    for (const lead of chunk) {
      try {
        const keys = dedupeKeys(lead);
        items.push({ id: lead.id, keys });
        // Persist keys so a later run / the UI can rely on them (indexed).
        const same =
          keys.length === lead.dedupeKeys.length &&
          keys.every((k, idx) => k === lead.dedupeKeys[idx]);
        if (!same) await db.updateLead(orgId, lead.id, { dedupeKeys: keys });
        succeeded += 1;
      } catch {
        failed += 1;
      }
      processed += 1;
    }
    await hooks.onProgress(processed);
  }

  // Write candidate pairs (idempotent per unordered pair).
  let pairsWritten = 0;
  for (const pair of findDuplicatePairs(items)) {
    const existing = await db.getDuplicateCandidateForPair(
      orgId,
      pair.aId,
      pair.bId,
    );
    if (existing) continue;
    await db.createDuplicateCandidate({
      organizationId: orgId,
      leadAId: pair.aId,
      leadBId: pair.bId,
      matchedOn: pair.matchedOn,
      confidence: pair.confidence,
      status: "pending",
    });
    pairsWritten += 1;
  }

  return { succeeded, failed, pairsWritten };
}
