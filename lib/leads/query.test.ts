/**
 * lib/leads/query.test.ts — the pure lead-query builder is the safety-critical
 * layer (regex escaping, column whitelisting, tenant-safe filter shape), so it
 * gets the most coverage. No DB, no mongoose — everything here is deterministic.
 */

import { describe, expect, it } from "vitest";

import { customFieldColumnKey } from "./columns";
import {
  buildLeadQuery,
  escapeRegex,
  leadQueryParamsSchema,
  type LeadQueryParams,
} from "./query";

const ORG = "org-123";

/** Build validated params from a partial, applying the schema defaults. */
function params(partial: Partial<LeadQueryParams> = {}): LeadQueryParams {
  return leadQueryParamsSchema.parse(partial);
}

describe("escapeRegex", () => {
  it("escapes every regex metacharacter", () => {
    expect(escapeRegex("a.b*c+d?e^f$g")).toBe("a\\.b\\*c\\+d\\?e\\^f\\$g");
    expect(escapeRegex("(x)[y]{z}")).toBe("\\(x\\)\\[y\\]\\{z\\}");
    expect(escapeRegex("a|b\\c")).toBe("a\\|b\\\\c");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeRegex("Joe's Plumbing")).toBe("Joe's Plumbing");
  });
});

describe("buildLeadQuery — junk exclusion default", () => {
  it("hides junk when neither includeJunk nor an explicit status is set", () => {
    const { filter } = buildLeadQuery(ORG, params(), []);
    expect(filter.status).toEqual({ $ne: "junk" });
  });

  it("keeps junk when includeJunk is true", () => {
    const { filter } = buildLeadQuery(ORG, params({ includeJunk: true }), []);
    expect(filter.status).toBeUndefined();
  });

  it("does not override an explicit top-level status filter", () => {
    const { filter } = buildLeadQuery(ORG, params({ status: "junk" }), []);
    expect(filter.status).toBe("junk");
  });

  it("does not add the junk guard when status is filtered per-column", () => {
    const { filter } = buildLeadQuery(
      ORG,
      params({ filters: { status: { in: ["new", "ready"] } } }),
      [],
    );
    expect(filter.status).toEqual({ $in: ["new", "ready"] });
  });

  it("never writes organizationId onto the filter (adapter forces it)", () => {
    const { filter } = buildLeadQuery(ORG, params(), []);
    expect(filter.organizationId).toBeUndefined();
    expect(filter.organization_id).toBeUndefined();
  });
});

describe("buildLeadQuery — regex escaping of text filters and global q", () => {
  it("escapes a global q into a literal, case-insensitive regex across fields", () => {
    const { filter } = buildLeadQuery(ORG, params({ q: "a.b*" }), []);
    expect(filter.$or).toEqual([
      { business_name: { $regex: "a\\.b\\*", $options: "i" } },
      { phone: { $regex: "a\\.b\\*", $options: "i" } },
      { website: { $regex: "a\\.b\\*", $options: "i" } },
      { notes: { $regex: "a\\.b\\*", $options: "i" } },
    ]);
  });

  it("escapes a per-column text filter", () => {
    const { filter } = buildLeadQuery(
      ORG,
      params({ filters: { businessName: { text: "Joe's (Pizza)" } } }),
      [],
    );
    expect(filter.business_name).toEqual({
      $regex: "Joe's \\(Pizza\\)",
      $options: "i",
    });
  });
});

describe("buildLeadQuery — unknown column rejection", () => {
  it("throws on an unknown filter column", () => {
    expect(() =>
      buildLeadQuery(ORG, params({ filters: { bogus: { text: "x" } } }), []),
    ).toThrow(/Unknown filter column/);
  });

  it("throws on an unknown sort column", () => {
    expect(() => buildLeadQuery(ORG, params({ sort: "bogus" }), [])).toThrow(
      /Unknown sort column/,
    );
  });

  it("throws when filtering a non-filterable column", () => {
    // `parseIssues` is exportable but not filterable in the catalog.
    expect(() =>
      buildLeadQuery(ORG, params({ filters: { parseIssues: { text: "x" } } }), []),
    ).toThrow(/not filterable/);
  });

  it("throws when sorting a non-sortable column", () => {
    // `emails` is filterable but not sortable.
    expect(() => buildLeadQuery(ORG, params({ sort: "emails" }), [])).toThrow(
      /not sortable/,
    );
  });
});

describe("buildLeadQuery — custom fields", () => {
  const priorityKey = customFieldColumnKey("priority");

  it("allows a custom-field filter only when the slug is in the org's list", () => {
    const { filter } = buildLeadQuery(
      ORG,
      params({ filters: { [priorityKey]: { text: "high" } } }),
      ["priority"],
    );
    expect(filter["custom_fields.priority"]).toEqual({
      $regex: "high",
      $options: "i",
    });
  });

  it("rejects a custom-field key that is not a real org custom field", () => {
    expect(() =>
      buildLeadQuery(
        ORG,
        params({ filters: { [priorityKey]: { text: "high" } } }),
        [],
      ),
    ).toThrow(/Unknown filter column/);
  });

  it("rejects sorting on a custom field not in the org's list", () => {
    expect(() =>
      buildLeadQuery(ORG, params({ sort: priorityKey }), []),
    ).toThrow(/Unknown sort column/);
  });
});

describe("buildLeadQuery — f.col.in membership", () => {
  it("maps `in` to a $in condition on the stored field", () => {
    const { filter } = buildLeadQuery(
      ORG,
      params({ filters: { sourceType: { in: ["google_maps", "manual"] } } }),
      [],
    );
    expect(filter.source_type).toEqual({ $in: ["google_maps", "manual"] });
  });
});

describe("buildLeadQuery — numeric min/max ranges", () => {
  it("coerces numeric bounds and builds $gte/$lte", () => {
    const { filter } = buildLeadQuery(
      ORG,
      params({ filters: { rating: { min: "3.5", max: "5" } } }),
      [],
    );
    expect(filter.rating).toEqual({ $gte: 3.5, $lte: 5 });
  });

  it("supports a lower-bound-only range", () => {
    const { filter } = buildLeadQuery(
      ORG,
      params({ filters: { reviewCount: { min: "10" } } }),
      [],
    );
    expect(filter.review_count).toEqual({ $gte: 10 });
  });

  it("throws on a non-numeric bound for a numeric column", () => {
    expect(() =>
      buildLeadQuery(ORG, params({ filters: { rating: { min: "abc" } } }), []),
    ).toThrow(/Invalid numeric bound/);
  });
});

describe("buildLeadQuery — page/skip/limit math", () => {
  it("computes skip from page and pageSize", () => {
    expect(buildLeadQuery(ORG, params({ page: 1, pageSize: 25 }), []).skip).toBe(
      0,
    );
    expect(buildLeadQuery(ORG, params({ page: 3, pageSize: 50 }), []).skip).toBe(
      100,
    );
  });

  it("uses pageSize as the limit", () => {
    expect(
      buildLeadQuery(ORG, params({ page: 2, pageSize: 100 }), []).limit,
    ).toBe(100);
  });
});

describe("buildLeadQuery — single-column sort", () => {
  it("defaults to createdAt desc", () => {
    expect(buildLeadQuery(ORG, params(), []).sort).toEqual({ createdAt: -1 });
  });

  it("resolves a public sort key to its stored field with direction", () => {
    expect(
      buildLeadQuery(ORG, params({ sort: "businessName", dir: "asc" }), []).sort,
    ).toEqual({ business_name: 1 });
  });

  it("maps aliased columns (city → address.city)", () => {
    expect(
      buildLeadQuery(ORG, params({ sort: "city", dir: "desc" }), []).sort,
    ).toEqual({ "address.city": -1 });
  });
});

describe("buildLeadQuery — scalar filters", () => {
  it("maps campaignId to campaign_ids membership", () => {
    const { filter } = buildLeadQuery(
      ORG,
      params({ campaignId: "camp-1" }),
      [],
    );
    expect(filter.campaign_ids).toBe("camp-1");
  });
});
