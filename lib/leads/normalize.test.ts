/**
 * lib/leads/normalize.test.ts — the PURE phone + website normalizers (Phase 3).
 * The address step is AI and lives outside these tests; here we pin the
 * deterministic E.164 conversion and the social/directory URL handling. No DB,
 * no AI, no network.
 */

import { describe, expect, it } from "vitest";

import { normalizePhone, normalizeWebsite } from "./normalize";

describe("normalizePhone", () => {
  it("converts a US national number to E.164 (default country)", () => {
    const result = normalizePhone("(512) 555-0110");
    expect(result.phoneE164).toBe("+15125550110");
    expect(result.phone).toBe("(512) 555-0110");
  });

  it("keeps an already-E.164 number", () => {
    expect(normalizePhone("+15125550110").phoneE164).toBe("+15125550110");
  });

  it("honors a non-US default country", () => {
    expect(normalizePhone("020 7946 0018", "GB").phoneE164).toBe(
      "+442079460018",
    );
  });

  it("returns null E.164 for unparseable or empty input, preserving the raw", () => {
    expect(normalizePhone("call us!").phoneE164).toBeNull();
    expect(normalizePhone("").phoneE164).toBeNull();
    expect(normalizePhone(null)).toEqual({ phone: null, phoneE164: null });
    expect(normalizePhone(undefined)).toEqual({ phone: null, phoneE164: null });
  });
});

describe("normalizeWebsite", () => {
  it("canonicalizes host + drops path/query/hash", () => {
    const result = normalizeWebsite("https://www.Example.com/home?utm=x#top");
    expect(result.website).toBe("https://example.com");
    expect(result.websiteDomain).toBe("example.com");
    expect(result.rejected).toBe(false);
    expect(result.social).toBeNull();
  });

  it("adds https:// to a schemeless host", () => {
    const result = normalizeWebsite("example.com");
    expect(result.website).toBe("https://example.com");
    expect(result.websiteDomain).toBe("example.com");
  });

  it("hands a social URL back as a social hint, not a website", () => {
    const result = normalizeWebsite("https://facebook.com/lonestarplumbing/");
    expect(result.website).toBeNull();
    expect(result.rejected).toBe(true);
    expect(result.social).toEqual({
      platform: "facebook",
      url: "https://facebook.com/lonestarplumbing",
    });
  });

  it("maps twitter.com / x.com to the x slot", () => {
    expect(normalizeWebsite("https://twitter.com/acme").social?.platform).toBe(
      "x",
    );
    expect(normalizeWebsite("https://x.com/acme").social?.platform).toBe("x");
  });

  it("rejects a directory host with no social slot", () => {
    const result = normalizeWebsite("https://www.yelp.com/biz/acme-austin");
    expect(result.website).toBeNull();
    expect(result.social).toBeNull();
    expect(result.rejected).toBe(true);
  });

  it("returns all-null (not rejected) for junk / empty input", () => {
    expect(normalizeWebsite("not a url")).toEqual({
      website: null,
      websiteDomain: null,
      social: null,
      rejected: false,
    });
    expect(normalizeWebsite(null).website).toBeNull();
  });
});
