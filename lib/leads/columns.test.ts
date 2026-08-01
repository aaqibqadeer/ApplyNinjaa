/**
 * lib/leads/columns.test.ts — the column catalog is the single source every
 * surface (query whitelist, filters, picker, CSV) reads, so these tests guard
 * its integrity: no duplicate keys, the documented default-visible set, and a
 * complete, well-typed definition for every column. Pure module, no DB.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISIBLE_COLUMNS,
  LEAD_COLUMNS,
  type ColumnType,
} from "./columns";

const COLUMN_TYPES: readonly ColumnType[] = [
  "text",
  "number",
  "date",
  "enum",
  "boolean",
];

describe("LEAD_COLUMNS catalog integrity", () => {
  it("has unique keys", () => {
    const keys = LEAD_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every column a non-empty label", () => {
    for (const column of LEAD_COLUMNS) {
      expect(column.label.length).toBeGreaterThan(0);
    }
  });

  it("gives every column a valid type", () => {
    for (const column of LEAD_COLUMNS) {
      expect(COLUMN_TYPES).toContain(column.type);
    }
  });

  it("declares enumValues for every enum column and none for others", () => {
    for (const column of LEAD_COLUMNS) {
      if (column.type === "enum") {
        expect(column.enumValues?.length ?? 0).toBeGreaterThan(0);
      } else {
        expect(column.enumValues).toBeUndefined();
      }
    }
  });
});

describe("DEFAULT_VISIBLE_COLUMNS", () => {
  it("matches the plan's default-visible set (spec §7)", () => {
    expect([...DEFAULT_VISIBLE_COLUMNS]).toEqual([
      "businessName",
      "phone",
      "website",
      "category",
      "city",
      "ownerName",
      "offerLine",
      "status",
    ]);
  });

  it("is derived from the defaultVisible flag", () => {
    const flagged = LEAD_COLUMNS.filter((c) => c.defaultVisible).map(
      (c) => c.key,
    );
    expect([...DEFAULT_VISIBLE_COLUMNS]).toEqual(flagged);
  });
});

describe("editable columns", () => {
  it("are exactly the known inline-editable set (spec §7)", () => {
    const editable = LEAD_COLUMNS.filter((c) => c.editable).map((c) => c.key);
    expect(editable.sort()).toEqual(
      [
        "businessName",
        "phone",
        "website",
        "ownerName",
        "offerLine",
        "status",
        "notes",
      ].sort(),
    );
  });

  it("keeps AI-generated columns read-only", () => {
    for (const key of ["score", "scoreReasoning"]) {
      const column = LEAD_COLUMNS.find((c) => c.key === key);
      expect(column?.editable).toBe(false);
    }
  });
});
