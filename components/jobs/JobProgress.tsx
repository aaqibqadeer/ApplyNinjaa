"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cancelJob, getJob, resumeJob } from "@/components/jobs/api";
import {
  isJobActive,
  isJobStale,
  jobProgressPercent,
  JOB_TYPE_META,
  type Job,
} from "@/components/jobs/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export interface JobProgressProps {
  /** The job to render. */
  job: Job;
  /**
   * When true (default), JobProgress polls `GET /api/jobs/[id]` every 2s while
   * the job is queued/running. Set false when a parent already polls and feeds
   * fresh `job` props (avoids double-polling).
   */
  selfPoll?: boolean;
  /** Called whenever a fresher job is fetched or an action returns one. */
  onUpdate?: (job: Job) => void;
  className?: string;
}

const POLL_INTERVAL_MS = 2000;

const STATUS_VARIANT: Record<
  Job["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  queued: "outline",
  running: "default",
  succeeded: "secondary",
  failed: "destructive",
  canceled: "outline",
};

/**
 * Compact progress card for one AI-pass job: type, status badge, a
 * processed/total bar, succeeded/failed counts, a Cancel button while active,
 * and a Resume button when a running job looks stale (started >10m ago with no
 * recent update). Self-polls the job while active unless `selfPoll` is false.
 *
 * Shared catalog entry — see `docs/architecture/components.md`.
 */
export function JobProgress({
  job: jobProp,
  selfPoll = true,
  onUpdate,
  className,
}: JobProgressProps) {
  const [job, setJob] = useState<Job>(jobProp);
  const [busy, setBusy] = useState(false);

  // Keep local state in sync when the parent supplies a fresher job.
  useEffect(() => {
    setJob(jobProp);
  }, [jobProp]);

  const apply = useCallback(
    (next: Job) => {
      setJob(next);
      onUpdate?.(next);
    },
    [onUpdate],
  );

  const active = isJobActive(job);
  const stale = isJobStale(job);

  // Self-poll while active. A ref holds the id so the interval doesn't churn.
  const idRef = useRef(job.id);
  idRef.current = job.id;
  useEffect(() => {
    if (!selfPoll || !active) return;
    let cancelled = false;
    const handle = setInterval(() => {
      void (async () => {
        const result = await getJob(idRef.current);
        if (cancelled) return;
        if (result.ok && result.data.job) apply(result.data.job);
      })();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [selfPoll, active, apply]);

  async function handleCancel() {
    setBusy(true);
    try {
      const result = await cancelJob(job.id);
      if (result.ok && result.data.job) {
        apply(result.data.job);
        toast.success("Job canceled");
      } else if (!result.ok) {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResume() {
    setBusy(true);
    try {
      const result = await resumeJob(job.id);
      if (result.ok && result.data.job) {
        apply(result.data.job);
        toast.success("Job resumed");
      } else if (!result.ok) {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  const meta = JOB_TYPE_META[job.type];
  const percent = jobProgressPercent(job);

  return (
    <div className={className}>
      <div className="flex flex-col gap-2 rounded-md border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {meta?.label ?? job.type}
            </span>
            <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {stale && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleResume()}
                disabled={busy}
              >
                Resume
              </Button>
            )}
            {active && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleCancel()}
                disabled={busy}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>

        <Progress
          value={percent}
          aria-label={`${meta?.label ?? job.type} progress`}
        />

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span>
            {job.processed}/{job.total || "?"} processed
          </span>
          {job.succeeded > 0 && (
            <span className="text-primary">{job.succeeded} succeeded</span>
          )}
          {job.failed > 0 && (
            <span className="text-destructive">{job.failed} failed</span>
          )}
          {stale && (
            <span className="text-destructive">stalled — no recent update</span>
          )}
        </div>

        {job.status === "failed" && job.error && (
          <p className="text-destructive text-xs">{job.error}</p>
        )}
      </div>
    </div>
  );
}
