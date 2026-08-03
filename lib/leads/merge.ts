/**
 * lib/leads/merge.ts — duplicate merge: the pure field-choice resolver plus the
 * service that applies a merge across the DB (Phase 3, dedupe review).
 *
 * `resolveMergedFields` is PURE (no DB) and unit-tested: given the two leads of
 * a candidate pair and a per-field `'a' | 'b'` choice, it returns the patch of
 * chosen values for the surviving (primary) lead. `campaignIds` is always the
 * UNION of both (never a choice) — a merged lead belongs to every campaign it
 * appeared in.
 *
 * `mergeDuplicate` performs the write side (locked decision #8 — merge is only
 * ever human-initiated): patch the primary, repoint every `lead_sources` row
 * from the loser to the primary (so provenance from BOTH sources survives on
 * the merged row), soft-delete the loser with `mergedIntoId` set, and mark the
 * candidate `merged`.
 */

import type { Session } from "@/lib/auth/types";
import { db, type Lead } from "@/lib/db";

import { resolveMergedFields, type FieldChoices } from "./merge-fields";
import { assertScraperEnabled, requireOrg, ScraperError } from "./service";

// Re-export the pure resolver + its schema so existing importers of
// `@/lib/leads/merge` keep working (the write side lives here, the pure
// field-choice logic lives in the import-safe `merge-fields.ts`).
export {
  fieldChoiceSchema,
  MERGEABLE_FIELDS,
  resolveMergedFields,
} from "./merge-fields";
export type { FieldChoices, MergeableField } from "./merge-fields";

export interface MergeResult {
  primary: Lead;
  /** Provenance rows moved from the loser onto the primary. */
  sourcesRepointed: number;
  loserId: string;
}

/**
 * Apply a human-approved merge of a `duplicate_candidates` pair. `primaryId`
 * must be one of the pair's two leads; the other becomes the loser. The primary
 * keeps the chosen field values (+ unioned campaigns), the loser's provenance
 * repoints to the primary, and the loser is soft-deleted with `mergedIntoId`
 * set. Idempotency: an already-resolved candidate is rejected.
 */
export async function mergeDuplicate(
  session: Session,
  candidateId: string,
  primaryId: string,
  fieldChoices: FieldChoices,
): Promise<MergeResult> {
  assertScraperEnabled();
  const orgId = requireOrg(session);

  const candidate = await db.getDuplicateCandidate(orgId, candidateId);
  if (!candidate) throw new ScraperError("Duplicate candidate not found", 404);
  if (candidate.status !== "pending") {
    throw new ScraperError(
      `This pair was already ${candidate.status}`,
      409,
    );
  }
  if (primaryId !== candidate.leadAId && primaryId !== candidate.leadBId) {
    throw new ScraperError("primaryId must be one of the candidate leads", 400);
  }

  const loserId =
    primaryId === candidate.leadAId ? candidate.leadBId : candidate.leadAId;

  const [primary, loser] = await Promise.all([
    db.getLeadById(orgId, primaryId),
    db.getLeadById(orgId, loserId),
  ]);
  if (!primary) throw new ScraperError("Primary lead not found", 404);
  if (!loser) throw new ScraperError("Duplicate lead not found", 404);

  // leadA/leadB map to the candidate's stored order, so field choices line up
  // with whichever lead the UI showed as "a" vs "b" regardless of primary pick.
  const leadA = primary.id === candidate.leadAId ? primary : loser;
  const leadB = primary.id === candidate.leadBId ? primary : loser;
  const patch = resolveMergedFields(leadA, leadB, fieldChoices);

  const updatedPrimary = await db.updateLead(orgId, primaryId, patch);
  const sourcesRepointed = await db.repointLeadSources(
    orgId,
    loserId,
    primaryId,
  );
  await db.updateLead(orgId, loserId, {
    mergedIntoId: primaryId,
    deletedAt: new Date(),
  });
  await db.updateDuplicateCandidate(orgId, candidateId, { status: "merged" });

  return { primary: updatedPrimary, sourcesRepointed, loserId };
}

/** Dismiss a candidate pair — "keep both", no data changes. */
export async function dismissDuplicate(
  session: Session,
  candidateId: string,
): Promise<void> {
  assertScraperEnabled();
  const orgId = requireOrg(session);
  const candidate = await db.getDuplicateCandidate(orgId, candidateId);
  if (!candidate) throw new ScraperError("Duplicate candidate not found", 404);
  if (candidate.status !== "pending") {
    throw new ScraperError(`This pair was already ${candidate.status}`, 409);
  }
  await db.updateDuplicateCandidate(orgId, candidateId, { status: "dismissed" });
}

/** List an org's duplicate candidates (optionally filtered by status). */
export async function listDuplicates(
  session: Session,
  status?: string,
): Promise<Awaited<ReturnType<typeof db.listDuplicateCandidates>>> {
  assertScraperEnabled();
  const orgId = requireOrg(session);
  return db.listDuplicateCandidates(orgId, status);
}

/** A candidate with both leads hydrated, as the review UI consumes it. */
export interface HydratedDuplicate {
  id: string;
  leadA: Lead;
  leadB: Lead;
  matchedOn: string[];
  confidence: number;
  status: "pending" | "merged" | "dismissed";
}

/**
 * List duplicate candidates with both leads hydrated for the review UI. Pairs
 * whose leads no longer exist (e.g. already deleted) are dropped so the UI never
 * has to render a half-empty row.
 */
export async function listDuplicatesForReview(
  session: Session,
  status: string = "pending",
): Promise<HydratedDuplicate[]> {
  assertScraperEnabled();
  const orgId = requireOrg(session);
  const candidates = await db.listDuplicateCandidates(orgId, status);

  const ids = [
    ...new Set(candidates.flatMap((c) => [c.leadAId, c.leadBId])),
  ];
  const leads = await db.listLeadsByIds(orgId, ids);
  const byId = new Map(leads.map((lead) => [lead.id, lead]));

  const out: HydratedDuplicate[] = [];
  for (const c of candidates) {
    const leadA = byId.get(c.leadAId);
    const leadB = byId.get(c.leadBId);
    if (!leadA || !leadB) continue;
    out.push({
      id: c.id,
      leadA,
      leadB,
      matchedOn: c.matchedOn,
      confidence: c.confidence,
      status: c.status,
    });
  }
  return out;
}
