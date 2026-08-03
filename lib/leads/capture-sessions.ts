/**
 * lib/leads/capture-sessions.ts — capture-session lifecycle (Node).
 *
 * A `capture_sessions` row records one extension capture run: when, where, how
 * many, and in which mode. The popup creates it on Start (POST) and PATCHes its
 * live counters + terminal status as the run progresses/ends. Org-scoped like
 * every tenant table; routes stay thin (validate + call).
 */

import { z } from "zod";

import type { Session } from "@/lib/auth/types";
import {
  db,
  captureModeSchema,
  captureSessionStatusSchema,
  leadSourceTypeSchema,
  type CaptureSession,
} from "@/lib/db";

import { assertScraperEnabled, requireOrg, ScraperError } from "./service";

export const captureSessionCreateSchema = z.object({
  campaignId: z.string().min(1),
  sourceType: leadSourceTypeSchema,
  sourceUrl: z.string().max(2000).nullable().optional(),
  mode: captureModeSchema,
  extensionVersion: z.string().max(50).nullable().optional(),
  /** Optional explicit start; defaults to now. */
  startedAt: z.coerce.date().optional(),
});
export type CaptureSessionCreateInput = z.infer<
  typeof captureSessionCreateSchema
>;

export const captureSessionPatchSchema = z.object({
  status: captureSessionStatusSchema.optional(),
  capturedCount: z.number().int().nonnegative().optional(),
  needsReviewCount: z.number().int().nonnegative().optional(),
  sourceUrl: z.string().max(2000).nullable().optional(),
  endedAt: z.coerce.date().nullable().optional(),
});
export type CaptureSessionPatchInput = z.infer<
  typeof captureSessionPatchSchema
>;

export async function listCaptureSessions(
  session: Session,
): Promise<CaptureSession[]> {
  assertScraperEnabled();
  const orgId = requireOrg(session);
  return db.listCaptureSessions(orgId);
}

export async function getCaptureSession(
  session: Session,
  id: string,
): Promise<CaptureSession> {
  assertScraperEnabled();
  const orgId = requireOrg(session);
  const found = await db.getCaptureSession(orgId, id);
  if (!found) throw new ScraperError("Capture session not found", 404);
  return found;
}

export async function createCaptureSession(
  session: Session,
  input: CaptureSessionCreateInput,
): Promise<CaptureSession> {
  assertScraperEnabled();
  const orgId = requireOrg(session);

  const campaign = await db.getCampaignById(orgId, input.campaignId);
  if (!campaign) throw new ScraperError("Campaign not found", 404);

  return db.createCaptureSession({
    organizationId: orgId,
    campaignId: input.campaignId,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl ?? null,
    mode: input.mode,
    startedAt: input.startedAt ?? new Date(),
    endedAt: null,
    capturedCount: 0,
    needsReviewCount: 0,
    status: "running",
    extensionVersion: input.extensionVersion ?? null,
    createdByUserId: session.user.id,
  });
}

export async function updateCaptureSession(
  session: Session,
  id: string,
  patch: CaptureSessionPatchInput,
): Promise<CaptureSession> {
  assertScraperEnabled();
  const orgId = requireOrg(session);
  const existing = await db.getCaptureSession(orgId, id);
  if (!existing) throw new ScraperError("Capture session not found", 404);

  // A terminal status with no explicit endedAt stamps the end automatically.
  const endedAt =
    patch.endedAt !== undefined
      ? patch.endedAt
      : patch.status && patch.status !== "running"
        ? new Date()
        : undefined;

  return db.updateCaptureSession(orgId, id, {
    status: patch.status,
    capturedCount: patch.capturedCount,
    needsReviewCount: patch.needsReviewCount,
    sourceUrl: patch.sourceUrl,
    endedAt,
  });
}
