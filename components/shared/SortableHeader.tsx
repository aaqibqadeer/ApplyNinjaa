"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc" | null;

export interface SortableHeaderProps {
  label: string;
  /** The key this header sorts by. */
  columnKey: string;
  /** The currently-sorted column key (null when nothing is sorted). */
  sortKey: string | null;
  /** Direction of the active sort. */
  sortDir: SortDir;
  /** Called with this column's key when the header is clicked. */
  onSort: (key: string) => void;
  className?: string;
}

/**
 * A clickable table header that toggles sort direction (asc → desc → asc) and
 * shows an arrow indicator. The parent owns the sort state; clicking a
 * different column is the parent's cue to switch the active key.
 */
export function SortableHeader({
  label,
  columnKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: SortableHeaderProps) {
  const active = sortKey === columnKey && sortDir !== null;
  const sortState = active
    ? sortDir === "asc"
      ? "sorted ascending"
      : "sorted descending"
    : "not sorted";

  return (
    <button
      type="button"
      onClick={() => onSort(columnKey)}
      aria-label={`${label}, ${sortState}. Click to sort.`}
      className={cn(
        "hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm font-medium focus-visible:ring-2 focus-visible:outline-none",
        active ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {label}
      {active ? (
        sortDir === "asc" ? (
          <ChevronUp className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-3.5" aria-hidden="true" />
        )
      ) : (
        <ChevronsUpDown
          className="size-3.5 opacity-50"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
