"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import { CampaignPicker } from "@/components/leads/CampaignPicker";
import { LeadDetailDrawer } from "@/components/leads/LeadDetailDrawer";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import {
  ColumnFilter,
  type ColumnFilterType,
  type ColumnFilterValue,
  type RangeFilterValue,
} from "@/components/shared/ColumnFilter";
import { ColumnPicker } from "@/components/shared/ColumnPicker";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  CsvImportDialog,
  type CsvImportPayload,
  type CsvImportResult,
} from "@/components/shared/CsvImportDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
import { SavedViewsMenu } from "@/components/shared/SavedViewsMenu";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { InlineEditCell } from "@/components/shared/InlineEditCell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  customFieldColumnKey,
  customFieldSlug,
  DEFAULT_VISIBLE_COLUMNS,
  LEAD_COLUMNS,
  type ColumnType,
} from "@/lib/leads/columns";
import {
  LEAD_STATUSES,
  type Campaign,
  type Lead,
  type LeadCustomField,
  type LeadStatus,
  type SavedView as SavedViewRecord,
  type SavedViewPageSize,
} from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export interface LeadsTableProps {
  canExport?: boolean;
  exportPlan?: string | null;
}

/** A resolved table column (static catalog column or dynamic custom field). */
interface TableColumn {
  key: string;
  label: string;
  type: ColumnType;
  filterType: ColumnFilterType;
  sortable: boolean;
  filterable: boolean;
  editable: boolean;
  enumValues: string[];
  isCustom: boolean;
}

const EDITABLE_TEXT_KEYS = new Set([
  "businessName",
  "phone",
  "website",
  "ownerName",
  "offerLine",
  "notes",
]);

const PAGE_SIZE_OPTIONS: SavedViewPageSize[] = [25, 50, 100, 250];

/** A single column's filter directives sent as `f.<col>...` params. */
interface FilterSpec {
  text?: string;
  min?: string;
  max?: string;
  in?: string[];
}

function buildColumns(customFields: LeadCustomField[]): TableColumn[] {
  const staticColumns: TableColumn[] = LEAD_COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    type: column.type,
    filterType: column.type,
    sortable: column.sortable,
    filterable: column.filterable,
    editable: column.editable,
    enumValues: [...(column.enumValues ?? [])],
    isCustom: false,
  }));
  const customColumns: TableColumn[] = customFields.map((field) => {
    const type: ColumnType =
      field.type === "select" ? "enum" : (field.type as ColumnType);
    return {
      key: customFieldColumnKey(field.key),
      label: field.label,
      type,
      filterType: type,
      sortable: true,
      filterable: true,
      editable: false,
      enumValues: field.type === "select" ? [...field.options] : [],
      isCustom: true,
    };
  });
  return [...staticColumns, ...customColumns];
}

/** Reduce the live filter state to `{ col: spec }`, dropping empty entries. */
function toFilterSpecs(
  filters: Record<string, ColumnFilterValue>,
  columns: TableColumn[],
): Record<string, FilterSpec> {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const out: Record<string, FilterSpec> = {};
  for (const [key, value] of Object.entries(filters)) {
    const column = byKey.get(key);
    if (!column || value === undefined) continue;
    if (column.filterType === "text") {
      if (typeof value === "string" && value.trim().length > 0) {
        out[key] = { text: value.trim() };
      }
    } else if (column.filterType === "number" || column.filterType === "date") {
      const range = value as RangeFilterValue;
      const spec: FilterSpec = {};
      if (range.min) spec.min = range.min;
      if (range.max) spec.max = range.max;
      if (spec.min || spec.max) out[key] = spec;
    } else if (column.filterType === "enum") {
      if (Array.isArray(value) && value.length > 0) out[key] = { in: value };
    } else if (column.filterType === "boolean") {
      if (typeof value === "string" && value.length > 0) {
        out[key] = { in: [value] };
      }
    }
  }
  return out;
}

/** Restore live filter state from a stored saved-view `filters` blob. */
function specsToFilters(
  stored: Record<string, unknown>,
): Record<string, ColumnFilterValue> {
  const out: Record<string, ColumnFilterValue> = {};
  for (const [key, raw] of Object.entries(stored)) {
    if (!raw || typeof raw !== "object") continue;
    const spec = raw as FilterSpec;
    if (Array.isArray(spec.in)) out[key] = spec.in;
    else if (spec.min !== undefined || spec.max !== undefined) {
      out[key] = { min: spec.min, max: spec.max };
    } else if (typeof spec.text === "string") out[key] = spec.text;
  }
  return out;
}

function formatDate(value: unknown): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

export function LeadsTable({
  canExport = true,
  exportPlan,
}: LeadsTableProps = {}) {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<SavedViewPageSize>(25);
  const [sortKey, setSortKey] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [campaignId, setCampaignId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("campaignId");
  });
  const [includeJunk, setIncludeJunk] = useState(false);
  const [columnFilters, setColumnFilters] = useState<
    Record<string, ColumnFilterValue>
  >({});

  const [customFields, setCustomFields] = useState<LeadCustomField[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    ...DEFAULT_VISIBLE_COLUMNS,
  ]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [views, setViews] = useState<SavedViewRecord[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [bulkCampaignId, setBulkCampaignId] = useState("");

  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [nonce, setNonce] = useState(0);

  const [addForm, setAddForm] = useState({
    businessName: "",
    phone: "",
    website: "",
    city: "",
  });
  const [addBusy, setAddBusy] = useState(false);

  const columns = useMemo(() => buildColumns(customFields), [customFields]);
  const columnByKey = useMemo(
    () => new Map(columns.map((c) => [c.key, c])),
    [columns],
  );
  const filterSpecs = useMemo(
    () => toFilterSpecs(columnFilters, columns),
    [columnFilters, columns],
  );

  /** Debounce the search box into the fetched `q`. */
  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [qInput]);

  const buildParams = useCallback(
    (includePaging: boolean): URLSearchParams => {
      const params = new URLSearchParams();
      if (includePaging) {
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
      }
      params.set("sort", sortKey);
      params.set("dir", sortDir);
      if (q) params.set("q", q);
      if (statusFilter) params.set("status", statusFilter);
      if (campaignId) params.set("campaignId", campaignId);
      if (includeJunk) params.set("includeJunk", "1");
      for (const [key, spec] of Object.entries(filterSpecs)) {
        if (spec.in) params.set(`f.${key}.in`, spec.in.join(","));
        else if (spec.min !== undefined || spec.max !== undefined) {
          if (spec.min) params.set(`f.${key}.min`, spec.min);
          if (spec.max) params.set(`f.${key}.max`, spec.max);
        } else if (spec.text !== undefined) params.set(`f.${key}`, spec.text);
      }
      return params;
    },
    [
      page,
      pageSize,
      sortKey,
      sortDir,
      q,
      statusFilter,
      campaignId,
      includeJunk,
      filterSpecs,
    ],
  );

  /** The query object handed to the bulk endpoint for "select all matching". */
  const selectionQuery = useCallback(
    () => ({
      sort: sortKey,
      dir: sortDir,
      ...(q ? { q } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(campaignId ? { campaignId } : {}),
      includeJunk,
      filters: filterSpecs,
    }),
    [sortKey, sortDir, q, statusFilter, campaignId, includeJunk, filterSpecs],
  );

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await fetch(`/api/leads?${buildParams(true).toString()}`);
      if (cancelled) return;
      if (res.ok) {
        const data = (await res.json()) as { leads: Lead[]; total: number };
        setLeads(data.leads);
        setTotal(data.total);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setLeads([]);
        setTotal(0);
        toast.error(data.error ?? "Could not load leads");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [buildParams, nonce]);

  useEffect(() => {
    void (async () => {
      const [campaignsRes, viewsRes, fieldsRes] = await Promise.all([
        fetch("/api/campaigns"),
        fetch("/api/views"),
        fetch("/api/custom-fields"),
      ]);
      if (campaignsRes.ok) {
        const data = (await campaignsRes.json()) as { campaigns: Campaign[] };
        setCampaigns(data.campaigns);
      }
      if (fieldsRes.ok) {
        const data = (await fieldsRes.json()) as { fields: LeadCustomField[] };
        setCustomFields(data.fields);
      }
      if (viewsRes.ok) {
        const data = (await viewsRes.json()) as { views: SavedViewRecord[] };
        setViews(data.views);
        const def = data.views.find((v) => v.isDefault);
        if (def) applyView(def);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetSelection() {
    setSelected(new Set());
    setAllMatching(false);
  }

  /** Change a filter/sort input and return to page 1 with a clean selection. */
  function withReset(fn: () => void) {
    fn();
    setPage(1);
    resetSelection();
  }

  function handleSort(key: string) {
    withReset(() => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    });
    setActiveViewId(null);
  }

  function setColumnFilter(key: string, value: ColumnFilterValue) {
    withReset(() => setColumnFilters((prev) => ({ ...prev, [key]: value })));
    setActiveViewId(null);
  }

  function clearColumnFilter(key: string) {
    withReset(() =>
      setColumnFilters((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      }),
    );
  }

  function applyView(view: SavedViewRecord) {
    if (view.columns.length > 0) setVisibleColumns([...view.columns]);
    setColumnFilters(specsToFilters(view.filters));
    setSortKey(view.sort.key);
    setSortDir(view.sort.dir);
    setPageSize(view.pageSize);
    setPage(1);
    resetSelection();
    setActiveViewId(view.id);
  }

  async function saveLeadField(id: string, patch: Record<string, unknown>) {
    setLeads(
      (prev) =>
        prev?.map((lead) =>
          lead.id === id ? ({ ...lead, ...patch } as Lead) : lead,
        ) ?? null,
    );
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Could not save the change");
      reload();
    }
  }

  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = allMatching
        ? new Set((leads ?? []).map((l) => l.id))
        : new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setAllMatching(false);
  }

  function togglePage(checked: boolean) {
    setAllMatching(false);
    setSelected(checked ? new Set((leads ?? []).map((l) => l.id)) : new Set());
  }

  async function runBulk(body: Record<string, unknown>): Promise<void> {
    const selection = allMatching
      ? { selectAll: true, query: selectionQuery() }
      : { ids: Array.from(selected) };
    const res = await fetch("/api/leads/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, ...selection }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      affected?: number;
      error?: string;
    };
    if (!res.ok) {
      toast.error(data.error ?? "Bulk action failed");
      return;
    }
    toast.success(`Updated ${data.affected ?? 0} lead(s)`);
    resetSelection();
    reload();
  }

  async function createLead() {
    const businessName = addForm.businessName.trim();
    if (!businessName) {
      toast.error("Business name is required");
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          phone: addForm.phone.trim() || null,
          website: addForm.website.trim() || null,
          address: addForm.city.trim()
            ? { city: addForm.city.trim() }
            : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        lead?: Lead;
        error?: string;
      };
      if (!res.ok || !data.lead) {
        toast.error(data.error ?? "Could not add the lead");
        return;
      }
      toast.success(`Added "${data.lead.businessName}"`);
      setAddForm({ businessName: "", phone: "", website: "", city: "" });
      setAddOpen(false);
      reload();
    } finally {
      setAddBusy(false);
    }
  }

  async function importLeads(
    payload: CsvImportPayload,
  ): Promise<CsvImportResult> {
    const res = await fetch("/api/leads/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      created?: number;
      skipped?: number;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Import failed");
    reload();
    return { imported: data.created ?? 0, errors: data.skipped ?? 0 };
  }

  function exportCsv() {
    const params = buildParams(false);
    params.set("columns", visibleColumns.join(","));
    window.location.href = `/api/leads/export?${params.toString()}`;
  }

  async function saveView(name: string) {
    const res = await fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        columns: visibleColumns,
        filters: filterSpecs,
        sort: { key: sortKey, dir: sortDir },
        pageSize,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      view?: SavedViewRecord;
      error?: string;
    };
    if (!res.ok || !data.view) {
      toast.error(data.error ?? "Could not save the view");
      return;
    }
    setViews((prev) => [...prev, data.view!]);
    setActiveViewId(data.view.id);
    toast.success(`Saved view "${data.view.name}"`);
  }

  function loadView(id: string) {
    const view = views.find((v) => v.id === id);
    if (view) applyView(view);
  }

  async function setDefaultView(id: string) {
    const res = await fetch(`/api/views/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (!res.ok) {
      toast.error("Could not set the default view");
      return;
    }
    setViews((prev) => prev.map((v) => ({ ...v, isDefault: v.id === id })));
    toast.success("Default view set");
  }

  async function deleteView(id: string) {
    const res = await fetch(`/api/views/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete the view");
      return;
    }
    setViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveViewId(null);
    toast.success("View deleted");
  }

  function openDetail(lead: Lead) {
    setDetailLead(lead);
    setDetailOpen(true);
  }

  function cellContent(lead: Lead, column: TableColumn) {
    if (column.isCustom) {
      const slug = customFieldSlug(column.key);
      const value = slug ? lead.customFields?.[slug] : undefined;
      return (
        <span className="block truncate text-sm">
          {value == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            String(value)
          )}
        </span>
      );
    }

    const key = column.key;

    if (EDITABLE_TEXT_KEYS.has(key)) {
      const raw = (lead as unknown as Record<string, unknown>)[key];
      return (
        <InlineEditCell
          value={typeof raw === "string" ? raw : ""}
          onSave={(next) => saveLeadField(lead.id, { [key]: next || null })}
        />
      );
    }

    if (key === "status") {
      return (
        <InlineEditCell
          type="select"
          value={lead.status}
          options={LEAD_STATUSES.map((s) => ({ value: s, label: s }))}
          onSave={(next) => saveLeadField(lead.id, { status: next })}
        />
      );
    }

    if (key === "score") {
      return (
        <span
          className="block truncate text-sm"
          title={lead.scoreReasoning ?? undefined}
        >
          {lead.score == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            lead.score
          )}
        </span>
      );
    }

    if (key === "emails") {
      const emails = lead.emails ?? [];
      return (
        <span className="block truncate text-sm">
          {emails.length > 0 ? (
            emails.join(", ")
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      );
    }

    if (key === "parseIssues") {
      return (
        <span className="block truncate text-sm">
          {lead.parseIssues.length > 0 ? (
            lead.parseIssues.join("; ")
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      );
    }

    if (key === "city") {
      return (
        <span className="block truncate text-sm">
          {lead.address?.city ?? ""}
        </span>
      );
    }
    if (key === "state") {
      return (
        <span className="block truncate text-sm">
          {lead.address?.state ?? ""}
        </span>
      );
    }

    if (column.type === "date") {
      const raw = (lead as unknown as Record<string, unknown>)[key];
      return <span className="block truncate text-sm">{formatDate(raw)}</span>;
    }

    if (key === "website" && lead.website) {
      return (
        <a
          href={lead.website}
          target="_blank"
          rel="noreferrer"
          className="text-primary block truncate text-sm hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {lead.website}
        </a>
      );
    }

    const raw = (lead as unknown as Record<string, unknown>)[key];
    return (
      <span className="block truncate text-sm">
        {raw == null || raw === "" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          String(raw)
        )}
      </span>
    );
  }

  const shownColumns = visibleColumns
    .map((key) => columnByKey.get(key))
    .filter((c): c is TableColumn => Boolean(c));

  const selectedCount = allMatching ? total : selected.size;
  const allPageSelected =
    (leads?.length ?? 0) > 0 &&
    (allMatching || leads!.every((l) => selected.has(l.id)));
  const activeFilterCount =
    Object.keys(filterSpecs).length +
    (q ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (campaignId ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search name, phone, website, notes…"
          className="h-9 max-w-xs"
          aria-label="Search leads"
        />
        <CampaignPicker
          value={campaignId}
          onChange={(id) => withReset(() => setCampaignId(id))}
          campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
          onCreated={(campaign) => setCampaigns((prev) => [campaign, ...prev])}
          placeholder="All campaigns"
        />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SavedViewsMenu
            views={views.map((v) => ({
              id: v.id,
              name: v.name,
              isDefault: v.isDefault,
            }))}
            activeViewId={activeViewId}
            onLoad={loadView}
            onSave={(name) => void saveView(name)}
            onSetDefault={(id) => void setDefaultView(id)}
            onDelete={(id) => void deleteView(id)}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-2">
              <ColumnPicker
                columns={columns.map((c) => ({ key: c.key, label: c.label }))}
                visibleKeys={visibleColumns}
                onChange={setVisibleColumns}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload aria-hidden="true" />
            Import
          </Button>

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

          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" />
            Add lead
          </Button>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => withReset(() => setStatusFilter(""))}
          className={cn(
            "rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
            statusFilter === ""
              ? "bg-primary text-primary-foreground border-transparent"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          All
        </button>
        {LEAD_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => withReset(() => setStatusFilter(status))}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
              statusFilter === status
                ? "bg-primary text-primary-foreground border-transparent"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {status}
          </button>
        ))}
        <label className="text-muted-foreground ml-2 flex items-center gap-1.5 text-xs">
          <Checkbox
            checked={includeJunk}
            onChange={(e) => withReset(() => setIncludeJunk(e.target.checked))}
          />
          Show junk
        </label>
        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="ml-1">
            {activeFilterCount} active filter
            {activeFilterCount === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {/* Bulk actions */}
      <BulkActionBar
        selectedCount={selectedCount}
        totalMatching={total}
        onClear={resetSelection}
        onSelectAllMatching={() => setAllMatching(true)}
      >
        <Select
          className="h-8 w-36"
          aria-label="Set status"
          value=""
          onChange={(e) => {
            if (e.target.value)
              void runBulk({ action: "set-status", status: e.target.value });
          }}
        >
          <option value="">Set status…</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1">
          <Select
            className="h-8 w-36"
            aria-label="Add to campaign"
            value={bulkCampaignId}
            onChange={(e) => setBulkCampaignId(e.target.value)}
          >
            <option value="">Add to campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={!bulkCampaignId}
            onClick={() =>
              void runBulk({
                action: "add-campaign",
                campaignId: bulkCampaignId,
              }).then(() => setBulkCampaignId(""))
            }
          >
            Add
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void runBulk({ action: "mark-junk" })}
        >
          Mark junk
        </Button>
        <ConfirmDialog
          title={`Delete ${selectedCount} lead(s)?`}
          description="This can't be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => runBulk({ action: "delete" })}
          trigger={
            <Button variant="destructive" size="sm">
              Delete
            </Button>
          }
        />
      </BulkActionBar>

      {/* Table */}
      {leads === null ? (
        <p className="text-muted-foreground text-sm">Loading leads…</p>
      ) : leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Capture businesses with the extension, import a CSV, or add one manually to get started."
          action={
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus aria-hidden="true" />
              Add lead
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allPageSelected}
                    aria-label="Select all on page"
                    onChange={(e) => togglePage(e.target.checked)}
                  />
                </TableHead>
                {shownColumns.map((column) => {
                  const hasFilter = filterSpecs[column.key] !== undefined;
                  return (
                    <TableHead key={column.key} className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {column.sortable ? (
                          <SortableHeader
                            label={column.label}
                            columnKey={column.key}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                        ) : (
                          <span className="text-muted-foreground font-medium">
                            {column.label}
                          </span>
                        )}
                        {column.filterable && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Filter ${column.label}`}
                                className={cn(
                                  "rounded-sm p-0.5",
                                  hasFilter
                                    ? "text-primary"
                                    : "text-muted-foreground/50 hover:text-foreground",
                                )}
                              >
                                <Filter
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="start"
                              className="w-56 p-2"
                            >
                              <DropdownMenuLabel className="px-0">
                                Filter {column.label}
                              </DropdownMenuLabel>
                              <ColumnFilter
                                column={{
                                  key: column.key,
                                  label: column.label,
                                  type: column.filterType,
                                  enumValues: column.enumValues,
                                }}
                                value={columnFilters[column.key]}
                                onChange={(value) =>
                                  setColumnFilter(column.key, value)
                                }
                              />
                              {hasFilter && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 w-full"
                                  onClick={() => clearColumnFilter(column.key)}
                                >
                                  Clear
                                </Button>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer"
                  onClick={() => openDetail(lead)}
                >
                  <TableCell
                    className="w-8"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={allMatching || selected.has(lead.id)}
                      aria-label={`Select ${lead.businessName}`}
                      onChange={(e) => toggleRow(lead.id, e.target.checked)}
                    />
                  </TableCell>
                  {shownColumns.map((column) => {
                    const interactive =
                      column.editable ||
                      column.key === "status" ||
                      column.key === "website";
                    return (
                      <TableCell
                        key={column.key}
                        className="max-w-56"
                        onClick={
                          interactive ? (e) => e.stopPropagation() : undefined
                        }
                      >
                        {cellContent(lead, column)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {leads !== null && leads.length > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={(next) => {
            setPage(next);
            resetSelection();
          }}
          onPageSizeChange={(size) =>
            withReset(() => setPageSize(size as SavedViewPageSize))
          }
        />
      )}

      {loading && leads !== null && (
        <p className="text-muted-foreground text-xs">Refreshing…</p>
      )}

      <LeadDetailDrawer
        lead={detailLead}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={(updated) => {
          setLeads(
            (prev) =>
              prev?.map((l) => (l.id === updated.id ? updated : l)) ?? null,
          );
          setDetailLead(updated);
        }}
      />

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={importLeads}
      />

      <Dialog
        open={addOpen}
        onOpenChange={(next) => {
          if (addBusy) return;
          setAddOpen(next);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add lead</DialogTitle>
            <DialogDescription>
              Manually add a business to the Lead Directory.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-business">Business name</Label>
              <Input
                id="add-business"
                value={addForm.businessName}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, businessName: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-phone">Phone</Label>
              <Input
                id="add-phone"
                value={addForm.phone}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-website">Website</Label>
              <Input
                id="add-website"
                value={addForm.website}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, website: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-city">City</Label>
              <Input
                id="add-city"
                value={addForm.city}
                onChange={(e) =>
                  setAddForm((f) => ({ ...f, city: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={addBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void createLead()}
              disabled={addBusy || addForm.businessName.trim().length === 0}
            >
              {addBusy ? "Adding…" : "Add lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
