"use client";

import { useCallback, useEffect, useState } from "react";

import { listJobs } from "@/components/jobs/api";
import { JobProgress } from "@/components/jobs/JobProgress";
import { isJobActive, type Job } from "@/components/jobs/types";
import { EmptyState } from "@/components/shared/EmptyState";

export interface JobsPanelProps {
  /** When true, poll the list every few seconds while any job is active. */
  open?: boolean;
}

const LIST_POLL_INTERVAL_MS = 4000;

/**
 * Recent AI-pass jobs for the org, active ones first (each rendered as a
 * self-polling `JobProgress`). Meant to live inside the shared `DetailDrawer`
 * on `/leads`. Degrades gracefully: a friendly empty state when the jobs API
 * isn't available yet (404) or there are simply no jobs.
 */
export function JobsPanel({ open = true }: JobsPanelProps) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    const result = await listJobs();
    if (result.ok) {
      setUnavailable(false);
      setJobs(result.data.jobs ?? []);
    } else {
      setUnavailable(result.status === 404);
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  // Poll the list while any job is active so newly-finished jobs settle.
  useEffect(() => {
    if (!open || unavailable) return;
    const anyActive = (jobs ?? []).some(isJobActive);
    if (!anyActive) return;
    const handle = setInterval(() => void load(), LIST_POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [open, unavailable, jobs, load]);

  function patchJob(next: Job) {
    setJobs((prev) =>
      prev ? prev.map((j) => (j.id === next.id ? next : j)) : prev,
    );
  }

  if (jobs === null) {
    return <p className="text-muted-foreground text-sm">Loading jobs…</p>;
  }

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No recent jobs"
        description={
          unavailable
            ? "AI passes aren't available on this workspace yet."
            : "Run an AI pass from the Leads table (select rows → Run AI pass) and it will appear here."
        }
      />
    );
  }

  const active = jobs.filter(isJobActive);
  const done = jobs.filter((j) => !isJobActive(j));

  return (
    <div className="flex flex-col gap-4">
      {active.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium">Active</p>
          {active.map((job) => (
            <JobProgress key={job.id} job={job} onUpdate={patchJob} />
          ))}
        </section>
      )}
      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium">Recent</p>
          {done.map((job) => (
            <JobProgress
              key={job.id}
              job={job}
              selfPoll={false}
              onUpdate={patchJob}
            />
          ))}
        </section>
      )}
    </div>
  );
}
