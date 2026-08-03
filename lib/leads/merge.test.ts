/**
 * lib/leads/merge.test.ts — the PURE field-choice resolver behind duplicate
 * merge (Phase 3). Given a candidate's two leads and a per-field `'a' | 'b'`
 * choice, `resolveMergedFields` returns the patch for the survivor. `campaignIds`
 * is ALWAYS the union (never a choice). No DB — the write side is exercised
 * against a real Mongo elsewhere.
 */

import { describe, expect, it } from "vitest";

import { type Lead, leadSchema } from "@/lib/db/schema";

import { resolveMergedFields } from "./merge-fields";

/** Build a valid Lead from a partial, letting schema defaults fill the rest. */
function makeLead(overrides: Partial<Lead>): Lead {
  return leadSchema.parse({
    id: "lead-x",
    organizationId: "org-1",
    sourceType: "manual",
    capturedAt: new Date("2026-01-01T00:00:00Z"),
    businessName: "Placeholder",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

const leadA = makeLead({
  id: "a",
  businessName: "Lone Star Plumbing",
  phone: "(512) 555-0110",
  phoneE164: "+15125550110",
  website: "https://lonestar.example",
  websiteDomain: "lonestar.example",
  ownerName: "Marcus",
  emails: ["marcus@lonestar.example"],
  rating: 4.7,
  reviewCount: 212,
  campaignIds: ["c1", "c2"],
});

const leadB = makeLead({
  id: "b",
  businessName: "Lone Star Plumbing Co.",
  phone: "512-555-0110",
  phoneE164: "+15125550110",
  website: "https://lonestarplumbing.example",
  websiteDomain: "lonestarplumbing.example",
  ownerName: "Marcus Reed",
  emails: ["info@lonestarplumbing.example"],
  rating: 4.5,
  reviewCount: 305,
  campaignIds: ["c2", "c3"],
});

describe("resolveMergedFields", () => {
  it("defaults every field to leadA when no choice is given", () => {
    const patch = resolveMergedFields(leadA, leadB, {});
    expect(patch.businessName).toBe("Lone Star Plumbing");
    expect(patch.ownerName).toBe("Marcus");
    expect(patch.website).toBe("https://lonestar.example");
    expect(patch.reviewCount).toBe(212);
  });

  it("takes leadB's value for a field chosen 'b'", () => {
    const patch = resolveMergedFields(leadA, leadB, {
      businessName: "b",
      reviewCount: "b",
      website: "b",
      websiteDomain: "b",
    });
    expect(patch.businessName).toBe("Lone Star Plumbing Co.");
    expect(patch.reviewCount).toBe(305);
    expect(patch.website).toBe("https://lonestarplumbing.example");
    expect(patch.websiteDomain).toBe("lonestarplumbing.example");
    // Unchosen fields still fall to leadA.
    expect(patch.ownerName).toBe("Marcus");
  });

  it("always unions campaignIds regardless of choices (order preserved)", () => {
    expect(resolveMergedFields(leadA, leadB, {}).campaignIds).toEqual([
      "c1",
      "c2",
      "c3",
    ]);
    expect(
      resolveMergedFields(leadA, leadB, { businessName: "b" }).campaignIds,
    ).toEqual(["c1", "c2", "c3"]);
  });

  it("can mix per-field winners across the two leads", () => {
    const patch = resolveMergedFields(leadA, leadB, {
      ownerName: "b",
      rating: "a",
      emails: "b",
    });
    expect(patch.ownerName).toBe("Marcus Reed");
    expect(patch.rating).toBe(4.7);
    expect(patch.emails).toEqual(["info@lonestarplumbing.example"]);
  });
});
