"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ColumnFilterType =
  | "text"
  | "number"
  | "date"
  | "enum"
  | "boolean";

export interface FilterColumn {
  key: string;
  label: string;
  type: ColumnFilterType;
  /** Options for `enum` columns. */
  enumValues?: string[];
}

/** Range value used by `number` and `date` filters. */
export interface RangeFilterValue {
  min?: string;
  max?: string;
}

/**
 * Polymorphic filter value, shaped by the column type:
 * - text: `string`
 * - number/date: `RangeFilterValue`
 * - enum: `string[]` (selected values)
 * - boolean: `"" | "true" | "false"` ("" = Any)
 */
export type ColumnFilterValue =
  | string
  | string[]
  | RangeFilterValue
  | undefined;

export interface ColumnFilterProps {
  column: FilterColumn;
  value: ColumnFilterValue;
  onChange: (value: ColumnFilterValue) => void;
  className?: string;
}

/**
 * A compact, type-aware filter control for a single column. Meant to sit in a
 * filter row beneath the table headers or inside a popover. The parent holds
 * the filter state and reads it back by column key.
 */
export function ColumnFilter({
  column,
  value,
  onChange,
  className,
}: ColumnFilterProps) {
  if (column.type === "text") {
    const text = typeof value === "string" ? value : "";
    return (
      <Input
        className={cn("h-8", className)}
        value={text}
        placeholder={`Filter ${column.label.toLowerCase()}…`}
        aria-label={`Filter by ${column.label}`}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (column.type === "number" || column.type === "date") {
    const range: RangeFilterValue =
      value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    const inputType = column.type === "number" ? "number" : "date";
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Input
          type={inputType}
          className="h-8"
          value={range.min ?? ""}
          placeholder="Min"
          aria-label={`Minimum ${column.label}`}
          onChange={(e) => onChange({ ...range, min: e.target.value })}
        />
        <span className="text-muted-foreground text-xs">–</span>
        <Input
          type={inputType}
          className="h-8"
          value={range.max ?? ""}
          placeholder="Max"
          aria-label={`Maximum ${column.label}`}
          onChange={(e) => onChange({ ...range, max: e.target.value })}
        />
      </div>
    );
  }

  if (column.type === "enum") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset
        className={cn("flex flex-col gap-1", className)}
        aria-label={`Filter by ${column.label}`}
      >
        {(column.enumValues ?? []).map((option) => {
          const checked = selected.includes(option);
          return (
            <label
              key={option}
              className="flex items-center gap-2 text-sm"
            >
              <Checkbox
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, option]
                    : selected.filter((v) => v !== option);
                  onChange(next);
                }}
              />
              <span>{option}</span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  const boolValue = typeof value === "string" ? value : "";
  return (
    <Select
      className={cn("h-8", className)}
      value={boolValue}
      aria-label={`Filter by ${column.label}`}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Any</option>
      <option value="true">Yes</option>
      <option value="false">No</option>
    </Select>
  );
}
