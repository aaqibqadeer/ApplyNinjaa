/**
 * lib/leads/dedupe.test.ts — PURE dedupe key generation, grouping, and pair
 * detection (Phase 3). Pins the locked key shapes (`phone:`/`domain:`/`name:…|
 * zip:…`), the connected-component grouping, and the pair confidence. No DB.
 */

import { describe, expect, it } from "vitest";

import {
  dedupeKeys,
  findDuplicatePairs,
  groupBySharedKeys,
  nameSlug,
  pairConfidence,
  type DedupeItem,
} from "./dedupe";

describe("dedupeKeys", () => {
  it("emits phone/domain/name keys in the locked shapes", () => {
    const keys = dedupeKeys({
      phoneE164: "+15125550110",
      websiteDomain: "example.com",
      businessName: "Lone Star Plumbing Co.",
      address: { postalCode: "78701" },
    });
    expect(keys).toEqual([
      "phone:+15125550110",
      "domain:example.com",
      "name:lonestarplumbingco|zip:78701",
    ]);
  });

  it("falls back to phone digits when no E.164 is present", () => {
    expect(dedupeKeys({ phone: "(512) 555-0110" })).toEqual([
      "phone:5125550110",
    ]);
  });

  it("skips a too-short phone and a nameless lead", () => {
    expect(dedupeKeys({ phone: "12345" })).toEqual([]);
    expect(dedupeKeys({ businessName: "   " })).toEqual([]);
  });

  it("emits a name key with an empty zip when postal is missing", () => {
    expect(dedupeKeys({ businessName: "Acme Co" })).toEqual([
      "name:acmeco|zip:",
    ]);
  });

  it("collapses accents and punctuation to alphanumerics", () => {
    // NFKD decomposes "é" → "e" + combining accent; the accent is then stripped.
    expect(nameSlug("Café  Del-Mar!!")).toBe("cafedelmar");
  });
});

describe("groupBySharedKeys", () => {
  it("groups the transitive closure and drops singletons", () => {
    const items: DedupeItem[] = [
      { id: "a", keys: ["phone:1", "domain:x"] },
      { id: "b", keys: ["domain:x"] }, // links to a via domain
      { id: "c", keys: ["phone:1"] }, // links to a via phone
      { id: "d", keys: ["phone:9"] }, // isolated → dropped
    ];
    const groups = groupBySharedKeys(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids.sort()).toEqual(["a", "b", "c"]);
  });

  it("returns no groups when nothing overlaps", () => {
    expect(
      groupBySharedKeys([
        { id: "a", keys: ["phone:1"] },
        { id: "b", keys: ["phone:2"] },
      ]),
    ).toEqual([]);
  });
});

describe("findDuplicatePairs + pairConfidence", () => {
  it("emits each unordered pair once with the shared kinds", () => {
    const pairs = findDuplicatePairs([
      { id: "a", keys: ["phone:1", "domain:x"] },
      { id: "b", keys: ["phone:1"] },
      { id: "c", keys: ["domain:x"] },
    ]);
    expect(pairs).toHaveLength(2);
    const ab = pairs.find((p) => p.aId === "a" && p.bId === "b");
    expect(ab?.matchedOn).toEqual(["phone"]);
    const ac = pairs.find((p) => p.aId === "a" && p.bId === "c");
    expect(ac?.matchedOn).toEqual(["domain"]);
  });

  it("weights phone highest and boosts for multiple matched kinds", () => {
    expect(pairConfidence(["phone"])).toBe(0.9);
    expect(pairConfidence(["domain"])).toBe(0.85);
    expect(pairConfidence(["name"])).toBe(0.5);
    expect(pairConfidence(["phone", "domain"])).toBe(0.95);
    expect(pairConfidence([])).toBe(0);
  });
});
