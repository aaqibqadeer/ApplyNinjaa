/**
 * lib/jobs/runner.ts — the in-process batch job runner + job service (Phase 3).
 *
 * Decision #3: no Redis, no worker process. `POST /api/jobs` creates the row and
 * schedules processing with `after()` from `next/server`, so the request returns
 * immediately while the pass runs in the same server process. Work proceeds in
 * chunks of 25; after each chunk the counters are persisted and the job status is
 * re-read so a `cancel` takes effect mid-run.
 *
 * Honesty about the model (execution plan §1): an in-process runner does NOT
 * survive a server restart. A job left `running` with no progress for >10 min is
 * reported `stale` so the UI can offer Resume — we don't pretend it's still
 * going.
 *
 * Every AI-backed pass enforces the monthly AI quota (per lead, inside the
 * handler). Hitting the cap mid-run stops the job and stores the 402 message on
 * `error`; a job that starts already at the cap is rejected up front with 402.
 */

import { after } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import type { Session } from "@/lib/auth/types";
import {
  batchJobTypeSchema,
  db,
  type BatchJob,
  type BatchJobType,
  type Lead,
  type NewBatchJob,
} from "@/lib/db";
import { buildLeadQuery, leadQueryParamsSchema } from "@/lib/leads/query";
import {
  assertScraperEnabled,
  requireOrg,
  ScraperError,
} from "@/lib/leads/service";
import { currentPeriod, getMonthlyAiUsage } from "@/lib/usage/ai-usage";
import {
  getAiCallCap,
  UsageLimitError,
} from "@/lib/usage/enforce";
import { getEffectivePlan } from "@/lib/payments/access";

import { runDedupe } from "./handlers/dedupe";
import { createEnrichProcessor } from "./handlers/enrich";
import { createLabelProcessor } from "./handlers/label";
import { createNormalizeProcessor } from "./handlers/normalize";
import { createOfferProcessor } from "./handlers/offer";
import { createRescueProcessor } from "./handlers/rescue";
import { createScoreProcessor } from "./handlers/score";
import type { ProcessorFactory } from "./handlers/types";

/** Leads processed per chunk (execution plan §1). */
const CHUNK_SIZE = 25;
/** A `running` job idle longer than this is reported stale (server restart). */
const STALE_AFTER_MS = 10 * 60 * 1000;

/** Job types that consume AI quota (dedupe is pure). */
export const AI_BACKED_TYPES: readonly BatchJobType[] = [
  "rescue",
  "normalize",
  "label",
  "enrich",
  "score",
  "offer",
];

/** Per-lead processor factories, keyed by job type (dedupe is special). */
const FACTORIES: Record<Exclude<BatchJobType, "dedupe">, ProcessorFactory> = {
  rescue: createRescueProcessor,
  normalize: createNormalizeProcessor,
  label: createLabelProcessor,
  enrich: createEnrichProcessor,
  score: createScoreProcessor,
  offer: createOfferProcessor,
};

/* -------------------------------------------------------------------------- */
/* Input + estimate                                                           */
/* -------------------------------------------------------------------------- */

export const jobCreateSchema = z
  .object({
    type: batchJobTypeSchema,
    /** Explicit target leads (bulk selection). */
    leadIds: z.array(z.string().min(1)).max(100_000).optional(),
    /** Or a serialized lead query describing the target set (current filter). */
    query: leadQueryParamsSchema.partial().optional(),
    /** Per-type params (offer `promptId`/`variants`/`skipEdited`). */
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type JobCreateInput = z.infer<typeof jobCreateSchema>;

/**
 * Upper-bound estimate of AI calls a job will make, so the UI can show it before
 * the user confirms. `dedupe` uses no AI; every other type is at most one call
 * per lead (offer's variants come back in a single call, and normalize's address
 * step only fires when a raw address needs structuring — hence "up to").
 */
export function estimateAiCalls(type: BatchJobType, count: number): number {
  if (type === "dedupe") return 0;
  return count;
}

/* -------------------------------------------------------------------------- */
/* Stale detection                                                            */
/* -------------------------------------------------------------------------- */

/** Whether a `running` job has made no progress for longer than the stale TTL. */
export function isStale(job: BatchJob, now: Date = new Date()): boolean {
  if (job.status !== "running") return false;
  return now.getTime() - job.updatedAt.getTime() > STALE_AFTER_MS;
}

/** A job plus its derived `stale` flag (what the API returns). */
export interface JobView extends BatchJob {
  stale: boolean;
}
export function toJobView(job: BatchJob): JobView {
  return { ...job, stale: isStale(job) };
}

/* -------------------------------------------------------------------------- */
/* Quota pre-check                                                            */
/* -------------------------------------------------------------------------- */

/**
 * AI calls the org has left this month, or `-1` when there is no applicable cap
 * (payments off, or the plan has no per-plan AI cap configured). `-1` is a
 * sentinel the UI reads as "unlimited/unknown — don't show a remaining count".
 */
export async function getRemainingQuota(session: Session): Promise<number> {
  if (!features.payments.enabled) return -1;
  const effective = await getEffectivePlan(session);
  const cap = getAiCallCap(effective.plan);
  if (cap <= 0) return -1;
  const used = await getMonthlyAiUsage(session.user.id, currentPeriod());
  return Math.max(0, cap - used);
}

/** Reject up front (402) when the org already has no AI quota left this month. */
async function assertQuotaAvailable(session: Session): Promise<void> {
  if (!features.payments.enabled) return;
  const effective = await getEffectivePlan(session);
  const cap = getAiCallCap(effective.plan);
  if (cap <= 0) return; // 0 = "no per-plan cap configured" → don't block here
  const used = await getMonthlyAiUsage(session.user.id, currentPeriod());
  if (used >= cap) throw new UsageLimitError(used, cap, effective.plan.slug);
}

/** What the UI shows before confirming a pass. */
export interface JobEstimate {
  aiCalls: number;
  /** Remaining monthly AI quota, or `-1` when there is no applicable cap. */
  remainingQuota: number;
}

/**
 * Estimate a job without creating it: how many leads it targets, the upper-bound
 * AI calls that implies, and the org's remaining quota. Used by
 * `POST /api/jobs` with `estimateOnly: true`.
 */
export async function estimateJob(
  session: Session,
  input: JobCreateInput,
): Promise<JobEstimate> {
  assertScraperEnabled();
  const orgId = requireOrg(session);
  const count =
    (input.leadIds?.length ?? 0) > 0
      ? (input.leadIds?.length ?? 0)
      : (await countForQuery(orgId, input.query)).total;
  return {
    aiCalls: estimateAiCalls(input.type, count),
    remainingQuota: await getRemainingQuota(session),
  };
}

/* -------------------------------------------------------------------------- */
/* Target resolution                                                          */
/* -------------------------------------------------------------------------- */

/** Count leads matching a job's query (used to set `total` at creation). */
async function countForQuery(
  orgId: string,
  query: JobCreateInput["query"],
): Promise<{ filter: Record<string, unknown>; total: number }> {
  const params = leadQueryParamsSchema.parse(query ?? {});
  const keys = (await db.listLeadCustomFields(orgId)).map((f) => f.key);
  const { filter } = buildLeadQuery(orgId, params, keys);
  const total = await db.countLeads(orgId, filter);
  return { filter, total };
}

/** The leads a job targets, re-resolved at run time from its stored spec. */
async function resolveTargetLeads(
  orgId: string,
  job: BatchJob,
): Promise<Lead[]> {
  if (job.leadIds.length > 0) return db.listLeadsByIds(orgId, job.leadIds);
  const params = leadQueryParamsSchema.parse(job.targetFilter ?? {});
  const keys = (await db.listLeadCustomFields(orgId)).map((f) => f.key);
  const { filter, sort } = buildLeadQuery(orgId, params, keys);
  const leads: Lead[] = [];
  for await (const lead of db.streamLeads(orgId, filter, sort)) leads.push(lead);
  return leads;
}

/* -------------------------------------------------------------------------- */
/* Service: create / list / get / cancel / resume                            */
/* -------------------------------------------------------------------------- */

export async function createJob(
  session: Session,
  input: JobCreateInput,
): Promise<JobView> {
  assertScraperEnabled();
  const orgId = requireOrg(session);

  if (input.type === "enrich" && !features.scraper.enrichment) {
    throw new ScraperError("Enrichment is not enabled", 404);
  }
  if (input.type === "offer" && !features.scraper.offerLines) {
    throw new ScraperError("Offer lines are not enabled", 404);
  }
  if (input.type === "offer") {
    const promptId =
      typeof input.params?.promptId === "string" ? input.params.promptId : "";
    if (!promptId) throw new ScraperError("An offer prompt is required", 400);
    const prompt = await db.getOfferPrompt(orgId, promptId);
    if (!prompt) throw new ScraperError("Offer prompt not found", 404);
  }

  // Resolve the target set spec + total.
  const useIds = (input.leadIds?.length ?? 0) > 0;
  let leadIds: string[] = [];
  let targetFilter: Record<string, unknown> | null = null;
  let total: number;
  if (useIds) {
    leadIds = input.leadIds ?? [];
    total = leadIds.length;
  } else {
    const resolved = await countForQuery(orgId, input.query);
    targetFilter = (input.query ?? {}) as Record<string, unknown>;
    total = resolved.total;
  }

  if (AI_BACKED_TYPES.includes(input.type)) {
    await assertQuotaAvailable(session);
  }

  const newJob: NewBatchJob = {
    organizationId: orgId,
    type: input.type,
    status: "queued",
    targetFilter,
    leadIds,
    total,
    processed: 0,
    succeeded: 0,
    failed: 0,
    error: null,
    params: input.params ?? {},
    createdByUserId: session.user.id,
    startedAt: null,
    finishedAt: null,
  };
  const job = await db.createBatchJob(newJob);

  // Kick off processing after the response is sent (decision #3).
  after(() => runJob(job.id, orgId, session));

  return toJobView(job);
}

export async function listJobs(session: Session): Promise<JobView[]> {
  assertScraperEnabled();
  const orgId = requireOrg(session);
  const jobs = await db.listBatchJobs(orgId);
  return jobs.map(toJobView);
}

export async function getJob(session: Session, id: string): Promise<JobView> {
  assertScraperEnabled();
  const orgId = requireOrg(session);
  const job = await db.getBatchJob(orgId, id);
  if (!job) throw new ScraperError("Job not found", 404);
  return toJobView(job);
}

export async function cancelJob(
  session: Session,
  id: string,
): Promise<JobView> {
  assertScraperEnabled();
  const orgId = requireOrg(session);
  const job = await db.getBatchJob(orgId, id);
  if (!job) throw new ScraperError("Job not found", 404);
  if (job.status === "done" || job.status === "failed") {
    throw new ScraperError(`Job already ${job.status}`, 409);
  }
  // The runner re-reads status each chunk and stops itself; mark canceled now.
  const updated = await db.updateBatchJob(orgId, id, {
    status: "canceled",
    finishedAt: new Date(),
  });
  return toJobView(updated);
}

/**
 * Re-queue a stale/failed/canceled job and start it again. The passes are
 * idempotent enough to re-run safely (score/label overwrite; normalize/dedupe/
 * enrich are idempotent; offer with `skipEdited` preserves hand-edits).
 */
export async function resumeJob(
  session: Session,
  id: string,
): Promise<JobView> {
  assertScraperEnabled();
  const orgId = requireOrg(session);
  const job = await db.getBatchJob(orgId, id);
  if (!job) throw new ScraperError("Job not found", 404);
  const resumable =
    job.status === "failed" ||
    job.status === "canceled" ||
    (job.status === "running" && isStale(job));
  if (!resumable) {
    throw new ScraperError(
      `Job is ${job.status} and not stale — nothing to resume`,
      409,
    );
  }
  if (AI_BACKED_TYPES.includes(job.type)) {
    await assertQuotaAvailable(session);
  }
  const updated = await db.updateBatchJob(orgId, id, {
    status: "queued",
    processed: 0,
    succeeded: 0,
    failed: 0,
    error: null,
    startedAt: null,
    finishedAt: null,
  });
  after(() => runJob(id, orgId, session));
  return toJobView(updated);
}

/* -------------------------------------------------------------------------- */
/* The runner                                                                 */
/* -------------------------------------------------------------------------- */

/** Whether the job has been canceled since we last checked (mid-run cancel). */
async function isCanceled(orgId: string, id: string): Promise<boolean> {
  const current = await db.getBatchJob(orgId, id);
  return current?.status === "canceled";
}

/**
 * Process one job to completion in-process. Scheduled via `after()` from
 * `createJob`/`resumeJob`; never called directly by a route. Swallows its own
 * errors into the job row (there is no caller to catch them post-response).
 */
export async function runJob(
  jobId: string,
  orgId: string,
  session: Session,
): Promise<void> {
  try {
    const existing = await db.getBatchJob(orgId, jobId);
    if (!existing || existing.status === "canceled") return;

    await db.updateBatchJob(orgId, jobId, {
      status: "running",
      startedAt: new Date(),
    });

    // Re-read the job (now `running`) and re-resolve its target set from the
    // stored leadIds/targetFilter, so the count reflects the current data.
    const job = await db.getBatchJob(orgId, jobId);
    if (!job) return;
    const targetLeads = await resolveTargetLeads(orgId, job);
    await db.updateBatchJob(orgId, jobId, { total: targetLeads.length });

    const deps = { session, orgId };

    if (job.type === "dedupe") {
      const result = await runDedupe(deps, targetLeads, {
        chunkSize: CHUNK_SIZE,
        onProgress: async (processed) => {
          await db.updateBatchJob(orgId, jobId, {
            processed,
            succeeded: processed,
          });
        },
        isCanceled: () => isCanceled(orgId, jobId),
      });
      const canceled = await isCanceled(orgId, jobId);
      await db.updateBatchJob(orgId, jobId, {
        status: canceled ? "canceled" : "done",
        processed: result.succeeded + result.failed,
        succeeded: result.succeeded,
        failed: result.failed,
        finishedAt: new Date(),
      });
      return;
    }

    const processor = await FACTORIES[job.type](deps, job);
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < targetLeads.length; i += CHUNK_SIZE) {
      if (await isCanceled(orgId, jobId)) {
        await db.updateBatchJob(orgId, jobId, {
          processed,
          succeeded,
          failed,
          finishedAt: new Date(),
        });
        return;
      }
      const chunk = targetLeads.slice(i, i + CHUNK_SIZE);
      for (const lead of chunk) {
        try {
          if (await processor(lead)) succeeded += 1;
          else failed += 1;
        } catch (error) {
          if (error instanceof UsageLimitError) {
            await db.updateBatchJob(orgId, jobId, {
              status: "failed",
              error: error.message,
              processed,
              succeeded,
              failed,
              finishedAt: new Date(),
            });
            return;
          }
          failed += 1;
        }
        processed += 1;
      }
      await db.updateBatchJob(orgId, jobId, { processed, succeeded, failed });
    }

    await db.updateBatchJob(orgId, jobId, {
      status: "done",
      processed,
      succeeded,
      failed,
      finishedAt: new Date(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    await db
      .updateBatchJob(orgId, jobId, {
        status: "failed",
        error: message,
        finishedAt: new Date(),
      })
      .catch(() => {});
  }
}
