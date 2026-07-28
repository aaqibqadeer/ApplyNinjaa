"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
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

interface Row {
  id: string;
  company: string;
  roleTitle: string;
  url: string | null;
  status: string;
  fitScore: number | null;
  fitReasoning: string | null;
  appliedAt: string;
  notes: string;
}

type SortKey = "company" | "roleTitle" | "status" | "fitScore" | "appliedAt";

/**
 * The applications tracker (product spec §6): every cell inline-editable —
 * including the AI fit score — with per-column sort, search + status filter,
 * and bulk actions (mark rejected, delete, CSV export).
 */
export function ApplicationsTable() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    setRows((r) => r?.map((row) => (row.id === id ? { ...row, ...patch } : row)) ?? null);
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
          r?.map((row) =>
            selected.has(row.id) ? { ...row, status } : row,
          ) ?? null,
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
      ["Company", "Role", "Status", "Fit Score", "Date Applied", "URL", "Notes"]
        .map(esc)
        .join(","),
      ...source.map((r) =>
        [
          r.company,
          r.roleTitle,
          r.status,
          r.fitScore,
          new Date(r.appliedAt).toISOString().slice(0, 10),
          r.url,
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
    return <p className="text-muted-foreground text-sm">Loading applications…</p>;
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
          <Button variant="outline" size="sm" onClick={exportCsv}>
            Export CSV
          </Button>
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
              <TableHead>{header("company", "Company")}</TableHead>
              <TableHead>{header("roleTitle", "Role")}</TableHead>
              <TableHead>{header("status", "Status")}</TableHead>
              <TableHead>{header("fitScore", "Fit")}</TableHead>
              <TableHead>{header("appliedAt", "Applied")}</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.id}>
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
                <TableCell className="min-w-36">
                  <Input
                    className="h-8"
                    value={row.company}
                    onChange={(e) => patchLocal(row.id, { company: e.target.value })}
                    onBlur={(e) => void save(row.id, { company: e.target.value })}
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
                        aria-label="Open job posting"
                      >
                        ↗
                      </a>
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
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    onBlur={(e) =>
                      void save(row.id, {
                        fitScore:
                          e.target.value === "" ? null : Number(e.target.value),
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
                </TableCell>
                <TableCell className="min-w-44">
                  <Input
                    className="h-8"
                    value={row.notes}
                    placeholder="Notes…"
                    onChange={(e) => patchLocal(row.id, { notes: e.target.value })}
                    onBlur={(e) => void save(row.id, { notes: e.target.value })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
