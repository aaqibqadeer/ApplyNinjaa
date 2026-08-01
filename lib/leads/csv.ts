/**
 * lib/leads/csv.ts — PURE CSV serialization for lead export (no mongoose, no db).
 *
 * One row per lead, columns chosen by the caller (a list of column keys from
 * `columns.ts`, including `customFields.<slug>`). Values are read from the
 * domain `Lead` shape, formatted (arrays joined, dates ISO), and made safe:
 *   - standard CSV quoting (double quotes doubled, fields with special chars
 *     wrapped);
 *   - CSV-injection neutralized — a cell whose text begins with `= + - @` (the
 *     characters a spreadsheet treats as a formula) is prefixed with a single
 *     quote so it opens as text, never as a live formula.
 */

import type { Lead } from "@/lib/db/schema";

import { customFieldSlug, getColumn, isCustomFieldColumnKey } from "./columns";

/** Characters a spreadsheet may interpret as the start of a formula. */
const FORMULA_PREFIXES = ["=", "+", "-", "@"];

/** Format a raw cell value to a flat string (arrays joined, dates ISO). */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => formatCellValue(item)).join("; ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Format + escape a single cell for CSV output. Neutralizes formula injection,
 * then applies RFC-4180 quoting when the value contains a quote, comma, newline
 * or leading/trailing whitespace.
 */
export function escapeCsvCell(value: unknown): string {
  let str = formatCellValue(value);
  if (str.length > 0 && FORMULA_PREFIXES.includes(str[0]!)) {
    str = `'${str}`;
  }
  const needsQuoting =
    /[",\n\r]/.test(str) || str !== str.trim() || str.startsWith("'");
  if (needsQuoting) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * The raw value for `key` off a lead, resolving aliases (`city` →
 * `address.city`, `state` → `address.state`) and custom fields
 * (`customFields.<slug>` → `lead.customFields[slug]`).
 */
export function leadCellValue(lead: Lead, key: string): unknown {
  if (isCustomFieldColumnKey(key)) {
    const slug = customFieldSlug(key);
    return slug ? lead.customFields?.[slug] : undefined;
  }
  if (key === "city") return lead.address?.city ?? null;
  if (key === "state") return lead.address?.state ?? null;
  return (lead as unknown as Record<string, unknown>)[key];
}

/** The human header label for a column key (label for known, slug for custom). */
function headerLabel(key: string): string {
  if (isCustomFieldColumnKey(key)) return customFieldSlug(key) ?? key;
  return getColumn(key)?.label ?? key;
}

/** The header row (no trailing newline). */
export function csvHeader(columns: string[]): string {
  return columns.map((key) => escapeCsvCell(headerLabel(key))).join(",");
}

/** One lead serialized to a CSV row (no trailing newline). */
export function serializeLeadRow(lead: Lead, columns: string[]): string {
  return columns
    .map((key) => escapeCsvCell(leadCellValue(lead, key)))
    .join(",");
}
