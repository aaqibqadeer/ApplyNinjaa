"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import type { CaptureSession, CaptureSessionStatus } from "@/lib/db/schema";

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

const STATUS_VARIANT: Record<
  CaptureSessionStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  running: "default",
  completed: "secondary",
  failed: "destructive",
  canceled: "outline",
};

/**
 * Capture-session history for the org. Read-only: each row is one extension
 * capture run (`GET /api/capture-sessions`), newest first.
 */
export function CaptureSessionsTable() {
  const [sessions, setSessions] = useState<CaptureSession[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/capture-sessions");
      if (cancelled) return;
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          sessions?: CaptureSession[];
        };
        setSessions(data.sessions ?? []);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setSessions([]);
        toast.error(data.error ?? "Could not load capture sessions");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: DataTableColumn<CaptureSession>[] = [
    {
      key: "startedAt",
      header: "Started",
      cell: (s) => (
        <span className="whitespace-nowrap">{formatDate(s.startedAt)}</span>
      ),
    },
    { key: "sourceType", header: "Source", cell: (s) => s.sourceType },
    {
      key: "sourceUrl",
      header: "URL",
      cell: (s) =>
        s.sourceUrl ? (
          <a
            href={s.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary block max-w-56 truncate hover:underline"
          >
            {s.sourceUrl}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "mode", header: "Mode", cell: (s) => s.mode },
    {
      key: "capturedCount",
      header: "Captured",
      className: "text-right",
      cell: (s) => s.capturedCount,
    },
    {
      key: "needsReviewCount",
      header: "Needs review",
      className: "text-right",
      cell: (s) =>
        s.needsReviewCount > 0 ? (
          <span className="text-destructive font-medium">
            {s.needsReviewCount}
          </span>
        ) : (
          s.needsReviewCount
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (s) => <Badge variant={STATUS_VARIANT[s.status]}>{s.status}</Badge>,
    },
    {
      key: "endedAt",
      header: "Ended",
      cell: (s) => (
        <span className="whitespace-nowrap">{formatDate(s.endedAt)}</span>
      ),
    },
  ];

  if (sessions === null) {
    return (
      <p className="text-muted-foreground text-sm">Loading capture sessions…</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <DataTable
        rows={sessions}
        getRowKey={(s) => s.id}
        columns={columns}
        empty={
          <EmptyState
            title="No capture sessions yet"
            description="Start a capture from the browser extension and each run will appear here."
          />
        }
      />
    </div>
  );
}
