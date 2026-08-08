"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ApplicationDetails } from "@/components/dashboard/ApplicationDetails";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { APPLICATION_STATUSES } from "@/lib/db/schema";

interface AdditionalLink {
  url: string;
  platform: string | null;
  addedAt: string | null;
}

interface FilterResult {
  label: string;
  verdict: string;
}

interface ExclusionMatch {
  kind: "company" | "keyword";
  value: string;
}

interface JobDetails {
  location: string | null;
  workArrangement: string | null;
  employmentType: string | null;
  seniority: string | null;
  salaryText: string | null;
  sponsorshipMentioned: "yes" | "no" | null;
  postedAt: string | null;
  requiredSkills: string[];
}

/** One row of `/api/applications`; the detail panel renders the same shape. */
export interface ApplicationRow {
  id: string;
  company: string;
  roleTitle: string;
  url: string | null;
  platform: string | null;
  additionalLinks: AdditionalLink[];
  status: string;
  fitScore: number | null;
  fitReasoning: string | null;
  filterResults: FilterResult[];
  exclusionMatches: ExclusionMatch[];
  jobDetails: JobDetails | null;
  analyzedAt: string | null;
  appliedAt: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

type Row = ApplicationRow;

type SortKey = "company" | "roleTitle" | "status" | "fitScore" | "appliedAt";

/**
 * The applications tracker (product spec §6): every cell inline-editable —
 * including the AI fit score — with per-column sort, search + status filter,
 * and bulk actions (mark rejected, delete, CSV export).
 */
export interface ApplicationsTableProps {
  /**
   * Whether the viewer's plan includes CSV export. Export is built entirely
   * in the browser from data the user already has, so there is no server-side
   * gate to add — hiding the button IS the enforcement here, and that's an
   * accepted limit of gating a purely client-side feature.
   */
  canExport?: boolean;
  /** Plan name that unlocks export, for the upsell line. */
  exportPlan?: string | null;
}

export function ApplicationsTable({
  canExport = true,
  exportPlan,
}: ApplicationsTableProps = {}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("appliedAt");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/applications");
      if (res.ok) {
        const data = (await res.json()) as { applications: Row[] };
        setRows(data.applications);
      } else {
        setRows([]);
        toast.error("Could not load applications");
      }
    })();
  }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    const needle = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        row.company.toLowerCase().includes(needle) ||
        row.roleTitle.toLowerCase().includes(needle) ||
        row.notes.toLowerCase().includes(needle)
      );
    });
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, search, statusFilter, sortKey, sortAsc]);

  function patchLocal(id: string, patch: Partial<Row>) {
    setRows(
      (r) =>
        r?.map((row) => (row.id === id ? { ...row, ...patch } : row)) ?? null,
    );
  }

  async function save(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Could not save the change");
    }
  }

  async function bulk(action: "set-status" | "delete", status?: string) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const res = await fetch("/api/applications/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "delete" ? { action, ids } : { action, ids, status },
      ),
    });
    if (!res.ok) {
      toast.error("Bulk action failed");
      return;
    }
    if (action === "delete") {
      setRows((r) => r?.filter((row) => !selected.has(row.id)) ?? null);
    } else if (status) {
      setRows(
        (r) =>
          r?.map((row) => (selected.has(row.id) ? { ...row, status } : row)) ??
          null,
      );
    }
    setSelected(new Set());
  }

  function exportCsv() {
    const source = selected.size
      ? visible.filter((r) => selected.has(r.id))
      : visible;
    const esc = (v: string | number | null) =>
      `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [
      [
        "Company",
        "Role",
        "Status",
        "Fit Score",
        "Fit Reasoning",
        "Applied",
        "Location",
        "Arrangement",
        "Employment Type",
        "Seniority",
        "Salary",
        "Sponsorship",
        "Required Skills",
        "Filter Verdicts",
        "Exclusions Hit",
        "Platform",
        "URL",
        "Other links",
        "Notes",
      ]
        .map(esc)
        .join(","),
      ...source.map((r) =>
        [
          r.company,
          r.roleTitle,
          r.status,
          r.fitScore,
          r.fitReasoning,
          new Date(r.appliedAt).toISOString(),
          r.jobDetails?.location ?? null,
          r.jobDetails?.workArrangement ?? null,
          r.jobDetails?.employmentType ?? null,
          r.jobDetails?.seniority ?? null,
          r.jobDetails?.salaryText ?? null,
          r.jobDetails?.sponsorshipMentioned ?? null,
          r.jobDetails?.requiredSkills.join(" | ") ?? null,
          r.filterResults.map((f) => `${f.label}: ${f.verdict}`).join(" | "),
          r.exclusionMatches.map((m) => m.value).join(" | "),
          r.platform,
          r.url,
          r.additionalLinks.map((l) => l.url).join(" | "),
          r.notes,
        ]
          .map(esc)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "applications.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function header(key: SortKey, label: string) {
    const active = sortKey === key;
    return (
      <button
        type="button"
        className="hover:text-foreground inline-flex items-center gap-1"
        onClick={() => {
          if (active) setSortAsc((a) => !a);
          else {
            setSortKey(key);
            setSortAsc(true);
          }
        }}
      >
        {label}
        <span aria-hidden="true" className="text-xs">
          {active ? (sortAsc ? "↑" : "↓") : ""}
        </span>
      </button>
    );
  }

  if (rows === null) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner size="sm" label="Loading applications" />
        Loading applications…
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No applications tracked yet"
        description="Open a job posting and hit Track in the ApplyNinjaa extension — it'll show up here."
      />
    );
  }

  const allVisibleSelected =
    visible.length > 0 && visible.every((r) => selected.has(r.id));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search company, role, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-44"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-muted-foreground text-xs">
                {selected.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void bulk("set-status", "Rejected")}
              >
                Mark rejected
              </Button>
              <ConfirmDialog
                title={`Delete ${selected.size} application(s)?`}
                description="This can't be undone."
                confirmLabel="Delete"
                onConfirm={() => void bulk("delete")}
                trigger={
                  <Button variant="destructive" size="sm">
                    Delete
                  </Button>
                }
              />
            </>
          )}
          {canExport ? (
            <Button variant="outline" size="sm" onClick={exportCsv}>
              Export CSV
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              asChild
              title={`CSV export is available on ${exportPlan ?? "a paid plan"} and above`}
            >
              <Link href="/settings/billing">Export CSV</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={allVisibleSelected}
                  aria-label="Select all"
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(visible.map((r) => r.id))
                        : new Set(),
                    )
                  }
                />
              </TableHead>
              <TableHead className="w-8" />
              <TableHead>{header("company", "Company")}</TableHead>
              <TableHead>{header("roleTitle", "Role")}</TableHead>
              <TableHead>{header("status", "Status")}</TableHead>
              <TableHead>{header("fitScore", "Fit")}</TableHead>
              <TableHead>{header("appliedAt", "Applied")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <Fragment key={row.id}>
                <TableRow>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.id)}
                      aria-label={`Select ${row.company}`}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      aria-expanded={expanded.has(row.id)}
                      aria-label={`${expanded.has(row.id) ? "Hide" : "Show"} details for ${row.roleTitle} at ${row.company}`}
                      className="text-muted-foreground hover:text-foreground px-1 text-xs"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        })
                      }
                    >
                      {expanded.has(row.id) ? "▾" : "▸"}
                    </button>
                  </TableCell>
                  <TableCell className="min-w-36">
                    <Input
                      className="h-8"
                      value={row.company}
                      onChange={(e) =>
                        patchLocal(row.id, { company: e.target.value })
                      }
                      onBlur={(e) =>
                        void save(row.id, { company: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell className="min-w-44">
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-8"
                        value={row.roleTitle}
                        onChange={(e) =>
                          patchLocal(row.id, { roleTitle: e.target.value })
                        }
                        onBlur={(e) =>
                          void save(row.id, { roleTitle: e.target.value })
                        }
                      />
                      {row.url && (
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary shrink-0 text-xs hover:underline"
                          aria-label={
                            row.platform
                              ? `Open job posting on ${row.platform}`
                              : "Open job posting"
                          }
                          title={row.platform ?? undefined}
                        >
                          ↗
                        </a>
                      )}
                      {row.additionalLinks.length > 0 && (
                        <span
                          className="text-muted-foreground shrink-0 text-xs"
                          title={row.additionalLinks
                            .map((l) => l.platform ?? l.url)
                            .join("\n")}
                        >
                          +{row.additionalLinks.length}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      className="h-8 w-36"
                      value={row.status}
                      onChange={(e) => {
                        patchLocal(row.id, { status: e.target.value });
                        void save(row.id, { status: e.target.value });
                      }}
                    >
                      {APPLICATION_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="h-8 w-16"
                      title={row.fitReasoning ?? undefined}
                      value={row.fitScore ?? ""}
                      onChange={(e) =>
                        patchLocal(row.id, {
                          fitScore:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      onBlur={(e) =>
                        void save(row.id, {
                          fitScore:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="h-8 w-36"
                      value={new Date(row.appliedAt).toISOString().slice(0, 10)}
                      onChange={(e) => {
                        if (!e.target.value) return;
                        patchLocal(row.id, {
                          appliedAt: new Date(e.target.value).toISOString(),
                        });
                        void save(row.id, { appliedAt: e.target.value });
                      }}
                    />
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {new Date(row.appliedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {row.additionalLinks.length > 0
                        ? ` · ${row.additionalLinks.length + (row.url ? 1 : 0)} links`
                        : ""}
                    </span>
                  </TableCell>
                </TableRow>
                {expanded.has(row.id) && (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <ApplicationDetails
                        row={row}
                        onNotesChange={(notes) => patchLocal(row.id, { notes })}
                        onNotesCommit={(notes) => void save(row.id, { notes })}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
