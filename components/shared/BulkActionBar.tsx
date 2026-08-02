"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BulkActionBarProps {
  /** Number of currently-selected rows. */
  selectedCount: number;
  /** Total rows matching the active filter (across all pages). */
  totalMatching: number;
  /** Clear the current selection. */
  onClear: () => void;
  /** When provided, offers a "select all N matching" affordance. */
  onSelectAllMatching?: () => void;
  /** Action buttons for the selection (e.g. delete, export, tag). */
  children?: ReactNode;
  className?: string;
}

/**
 * A selection toolbar that appears once rows are selected. Shows the count, a
 * clear button, the caller's action buttons, and — when the page selection is
 * a subset of the filtered total — a "select all N matching" link.
 */
export function BulkActionBar({
  selectedCount,
  totalMatching,
  onClear,
  onSelectAllMatching,
  children,
  className,
}: BulkActionBarProps) {
  if (selectedCount <= 0) return null;

  const canSelectAll =
    Boolean(onSelectAllMatching) && selectedCount < totalMatching;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={cn(
        "bg-accent text-accent-foreground flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm",
        className,
      )}
    >
      <span className="font-medium">{selectedCount} selected</span>
      {canSelectAll && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={onSelectAllMatching}
        >
          Select all {totalMatching} matching this filter
        </Button>
      )}
      <div className="ml-auto flex items-center gap-2">
        {children}
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
