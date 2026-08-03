/**
 * lib/enrich/tech.test.ts — PURE tech-stack signature detection (Phase 3
 * enrichment). Pins that the key platforms/analytics/libs are recognized from
 * HTML, that header-only signals (Cloudflare) fire, and that results are deduped
 * in catalog order. No network.
 */

import { describe, expect, it } from "vitest";

import { detectTechStack } from "./tech";

describe("detectTechStack (HTML)", () => {
  it("detects WordPress from wp-content", () => {
    expect(detectTechStack('<link href="/wp-content/themes/x/style.css">')).toContain(
      "WordPress",
    );
  });

  it("detects Next.js from the /_next/ chunk path", () => {
    expect(detectTechStack('<script src="/_next/static/chunks/main.js">')).toContain(
      "Next.js",
    );
  });

  it("detects Shopify, Wix, and Squarespace CDNs", () => {
    expect(detectTechStack('src="https://cdn.shopify.com/s/x.js"')).toContain(
      "Shopify",
    );
    expect(detectTechStack('src="https://static.wixstatic.com/x"')).toContain(
      "Wix",
    );
    expect(
      detectTechStack('src="https://static1.squarespace.com/x"'),
    ).toContain("Squarespace");
  });

  it("detects GTM, GA, Meta Pixel, and jQuery", () => {
    const html =
      '<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC"></script>' +
      '<script src="https://www.googletagmanager.com/gtag/js?id=G-XYZ"></script>' +
      "<script>fbq('init', '123')</script>" +
      '<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>';
    const found = detectTechStack(html);
    expect(found).toEqual(
      expect.arrayContaining([
        "Google Tag Manager",
        "Google Analytics",
        "Meta Pixel",
        "jQuery",
      ]),
    );
  });

  it("returns a deduped list in catalog order (platform → analytics → libs)", () => {
    const html =
      '<div id="__next"></div>' +
      '<script src="/wp-content/x.js"></script>' +
      '<script src="jquery.min.js"></script>' +
      '<script src="https://www.google-analytics.com/analytics.js"></script>';
    const found = detectTechStack(html);
    expect(found).toEqual([
      "WordPress",
      "Next.js",
      "Google Analytics",
      "jQuery",
    ]);
    expect(new Set(found).size).toBe(found.length);
  });

  it("finds nothing in bare markup", () => {
    expect(detectTechStack("<html><body>hi</body></html>")).toEqual([]);
  });
});

describe("detectTechStack (headers)", () => {
  it("detects Cloudflare from server/cf-ray headers", () => {
    expect(detectTechStack("", { server: "cloudflare" })).toContain(
      "Cloudflare",
    );
    expect(detectTechStack("", { "CF-RAY": "abc123-DFW" })).toContain(
      "Cloudflare",
    );
  });

  it("accepts a Headers instance and is case-insensitive", () => {
    const headers = new Headers({ Server: "cloudflare" });
    expect(detectTechStack("", headers)).toContain("Cloudflare");
  });

  it("detects Shopify from an x-shopify-stage header with no body", () => {
    expect(detectTechStack("", { "x-shopify-stage": "production" })).toContain(
      "Shopify",
    );
  });
});
