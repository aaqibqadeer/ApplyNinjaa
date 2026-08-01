"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface InlineEditOption {
  value: string;
  label: string;
}

export interface InlineEditCellProps {
  value: string;
  /** Persist the new value. May be async; the cell shows the pending value optimistically. */
  onSave: (next: string) => Promise<void> | void;
  type?: "text" | "select";
  /** Options for `select` type. */
  options?: InlineEditOption[];
  readOnly?: boolean;
  className?: string;
  /** Shown (muted) when the value is empty and not editing. */
  placeholder?: string;
}

/**
 * A double-click-to-edit table cell (so a single click can bubble to a row
 * handler, e.g. open a detail drawer). Enter/blur commits (optimistically),
 * Escape cancels and restores the prior value. Renders a muted placeholder
 * when empty.
 */
export function InlineEditCell({
  value,
  onSave,
  type = "text",
  options = [],
  readOnly = false,
  className,
  placeholder = "—",
}: InlineEditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    if (type === "select") selectRef.current?.focus();
    else inputRef.current?.select();
  }, [editing, type]);

  function commit(next: string) {
    setEditing(false);
    if (next === value) return;
    setDraft(next);
    void onSave(next);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (readOnly) {
    return (
      <span className={cn("block truncate text-sm", className)}>
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </span>
    );
  }

  if (editing) {
    if (type === "select") {
      return (
        <Select
          ref={selectRef}
          className={cn("h-8", className)}
          value={draft}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      );
    }
    return (
      <Input
        ref={inputRef}
        className={cn("h-8", className)}
        value={draft}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Escape") {
            cancel();
          }
        }}
      />
    );
  }

  const displayLabel =
    type === "select"
      ? (options.find((o) => o.value === draft)?.label ?? draft)
      : draft;

  return (
    <button
      type="button"
      title="Double-click to edit"
      onDoubleClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setEditing(true);
      }}
      className={cn(
        "hover:bg-accent focus-visible:ring-ring block w-full truncate rounded-sm px-1 py-0.5 text-left text-sm focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
    >
      {displayLabel || (
        <span className="text-muted-foreground">{placeholder}</span>
      )}
    </button>
  );
}
