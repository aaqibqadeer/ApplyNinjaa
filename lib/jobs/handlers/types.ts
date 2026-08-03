/**
 * lib/jobs/handlers/types.ts — the contract the in-process job runner uses to
 * drive per-lead job handlers (Phase 3).
 *
 * A handler does its once-per-job setup (resolve a prompt, read the rubric,
 * assert a sub-flag) in its `ProcessorFactory`, then returns a `LeadProcessor`
 * the runner applies to each targeted lead. AI-backed processors enforce the AI
 * quota + `recordAiCall` themselves; throwing `UsageLimitError` tells the runner
 * to stop the run and mark the job failed with the 402 message. `dedupe` is the
 * one whole-set pass and is handled directly by the runner.
 */

import type { Session } from "@/lib/auth/types";
import type { BatchJob, Lead } from "@/lib/db/schema";

export interface HandlerDeps {
  session: Session;
  orgId: string;
}

/** Process one lead; resolves to true on success. May throw UsageLimitError. */
export type LeadProcessor = (lead: Lead) => Promise<boolean>;

/** Build a per-lead processor after any once-per-job setup. */
export type ProcessorFactory = (
  deps: HandlerDeps,
  job: BatchJob,
) => Promise<LeadProcessor>;
