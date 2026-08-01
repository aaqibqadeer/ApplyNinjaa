"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

export interface PaginationProps {
  /** Current page, 1-indexed. */
  page: number;
  pageSize: number;
  /** Total number of matching rows across all pages. */
  total: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
}

/**
 * Range summary ("1–25 of 412") + Prev/Next + a page-size Select. Purely
 * presentational — the parent owns the query state and refetches on change.
 */
export function Pagination({
  page,
  pageSize,
  total,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const first = total === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const last = Math.min(clampedPage * pageSize, total);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-3">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <span>Rows</span>
          <Select
            className="h-8 w-20"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(clampedPage - 1)}
            disabled={clampedPage <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden="true" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(clampedPage + 1)}
            disabled={clampedPage >= totalPages}
            aria-label="Next page"
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
