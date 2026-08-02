/**
 * lib/leads/csv.test.ts — the CSV serializer must both quote correctly
 * (RFC-4180) and neutralize spreadsheet formula injection, so both are
 * exercised here alongside the header/row helpers. Pure module, no DB.
 */

import { describe, expect, it } from "vitest";

import type { Lead } from "@/lib/db/schema";

import { customFieldColumnKey } from "./columns";
import { csvHeader, escapeCsvCell, serializeLeadRow } from "./csv";

/** A minimal but schema-complete lead for row serialization. */
function makeLead(overrides: Partial<Lead> = {}): Lead {
  const now = new Date("2026-01-02T03:04:05.000Z");
  return {
    id: "lead-1",
    organizationId: "org-1",
    campaignIds: [],
    sourceType: "manual",
    sourceUrl: null,
    capturedAt: now,
    capturedByUserId: null,
    clientCaptureId: null,
    businessName: "Acme Plumbing",
    category: "Plumber",
    categories: [],
    phone: "555-1234",
    phoneE164: null,
    website: "https://acme.example",
    websiteDomain: "acme.example",
    address: { city: "Austin", state: "TX" },
    lat: null,
    lng: null,
    rating: null,
    reviewCount: null,
    priceLevel: null,
    hours: null,
    plusCode: null,
    ownerName: "Jane Doe",
    emails: ["jane@acme.example", "info@acme.example"],
    socials: {},
    techStack: [],
    pageSpeed: {},
    businessSize: "small",
    industrySubType: null,
    websiteStatus: "has",
    enrichmentStatus: null,
    enrichedAt: null,
    offerLine: null,
    offerLineEditedAt: null,
    offerLinePromptId: null,
    score: null,
    scoreReasoning: null,
    status: "new",
    notes: "",
    customFields: {},
    parseIssues: [],
    rawSnippet: null,
    dedupeKeys: [],
    mergedIntoId: null,
    exportedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

describe("escapeCsvCell — quoting", () => {
  it("leaves a plain value unquoted", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
  });

  it("quotes and doubles embedded quotes", () => {
    expect(escapeCsvCell('she said "hi"')).toBe('"she said ""hi"""');
  });

  it("quotes values containing a comma", () => {
    expect(escapeCsvCell("Smith, John")).toBe('"Smith, John"');
  });

  it("quotes values containing newlines", () => {
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("quotes values with leading/trailing whitespace", () => {
    expect(escapeCsvCell("  padded  ")).toBe('"  padded  "');
  });

  it("renders null/undefined as an empty cell", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("joins arrays with a semicolon", () => {
    expect(escapeCsvCell(["a", "b", "c"])).toBe("a; b; c");
  });

  it("serializes dates as ISO strings", () => {
    expect(escapeCsvCell(new Date("2026-01-02T03:04:05.000Z"))).toBe(
      "2026-01-02T03:04:05.000Z",
    );
  });
});

describe("escapeCsvCell — formula injection", () => {
  it.each(["=", "+", "-", "@"])(
    "prefixes a leading %s with a single quote and quotes the cell",
    (prefix) => {
      const out = escapeCsvCell(`${prefix}CMD("x")`);
      expect(out.startsWith('"\'')).toBe(true);
    },
  );

  it("neutralizes the classic =cmd payload", () => {
    // Leading `=` → prefixed with `'` → cell begins with `'` so it is quoted.
    expect(escapeCsvCell("=1+1")).toBe('"\'=1+1"');
  });

  it("does not prefix a formula character in the middle of a value", () => {
    expect(escapeCsvCell("a=b")).toBe("a=b");
  });
});

describe("csvHeader", () => {
  it("uses catalog labels for known columns", () => {
    expect(csvHeader(["businessName", "phone", "city"])).toBe(
      "Business Name,Phone,City",
    );
  });

  it("uses the slug as the label for a custom field", () => {
    expect(csvHeader([customFieldColumnKey("priority")])).toBe("priority");
  });

  it("escapes an unknown key that happens to need quoting", () => {
    // An unknown key falls back to itself as the label.
    expect(csvHeader(["a,b"])).toBe('"a,b"');
  });
});

describe("serializeLeadRow", () => {
  it("reads values by column key, resolving city/state aliases", () => {
    const lead = makeLead();
    expect(serializeLeadRow(lead, ["businessName", "city", "state"])).toBe(
      "Acme Plumbing,Austin,TX",
    );
  });

  it("joins array-valued columns (emails); no quoting when comma-free", () => {
    const lead = makeLead();
    expect(serializeLeadRow(lead, ["emails"])).toBe(
      "jane@acme.example; info@acme.example",
    );
  });

  it("reads a custom field from the customFields map", () => {
    const lead = makeLead({ customFields: { priority: "high" } });
    expect(serializeLeadRow(lead, [customFieldColumnKey("priority")])).toBe(
      "high",
    );
  });

  it("renders missing values as empty cells", () => {
    const lead = makeLead({ ownerName: null });
    expect(serializeLeadRow(lead, ["ownerName"])).toBe("");
  });
});
