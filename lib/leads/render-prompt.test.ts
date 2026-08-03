/**
 * lib/leads/render-prompt.test.ts — PURE offer-prompt placeholder validation +
 * rendering (Phase 3). Pins that unknown placeholders are a save-time error and
 * that known ones substitute lead values (absent → empty string). No DB, no AI.
 */

import { describe, expect, it } from "vitest";

import {
  extractPlaceholders,
  PromptValidationError,
  renderPrompt,
  validatePromptText,
  type RenderableLead,
} from "./render-prompt";

const LEAD: RenderableLead = {
  businessName: "Lone Star Plumbing",
  category: "Plumber",
  address: { city: "Austin", state: "TX" },
  website: "https://lonestarplumbing.example",
  websiteStatus: "has",
  rating: 4.7,
  reviewCount: 212,
  businessSize: "small",
  industrySubType: "residential",
  ownerName: "Marcus",
  techStack: ["WordPress", "jQuery"],
};

describe("extractPlaceholders", () => {
  it("returns distinct tokens in order, ignoring whitespace", () => {
    expect(
      extractPlaceholders("{{businessName}} in {{ city }} — {{businessName}}"),
    ).toEqual(["businessName", "city"]);
  });
});

describe("validatePromptText", () => {
  it("accepts a prompt using only known placeholders", () => {
    expect(validatePromptText("Hi, {{businessName}} in {{city}}")).toEqual([
      "businessName",
      "city",
    ]);
  });

  it("throws PromptValidationError listing unknown placeholders", () => {
    expect(() => validatePromptText("Hi {{ownerFirstName}} at {{email}}")).toThrow(
      PromptValidationError,
    );
    try {
      validatePromptText("Hi {{ownerFirstName}}");
    } catch (error) {
      expect(error).toBeInstanceOf(PromptValidationError);
      expect((error as PromptValidationError).unknownPlaceholders).toEqual([
        "ownerFirstName",
      ]);
      expect((error as PromptValidationError).status).toBe(400);
    }
  });
});

describe("renderPrompt", () => {
  it("substitutes known placeholders with lead values", () => {
    expect(
      renderPrompt("{{businessName}} ({{category}}) in {{city}}, {{state}}", LEAD),
    ).toBe("Lone Star Plumbing (Plumber) in Austin, TX");
  });

  it("joins techStack and stringifies numbers", () => {
    expect(renderPrompt("{{techStack}} · {{rating}} ({{reviewCount}})", LEAD)).toBe(
      "WordPress, jQuery · 4.7 (212)",
    );
  });

  it("renders absent values as an empty string", () => {
    expect(renderPrompt("Hi {{ownerName}}!", { businessName: "Acme" })).toBe(
      "Hi !",
    );
  });

  it("throws on an unknown placeholder (should have been caught at save)", () => {
    expect(() => renderPrompt("Hi {{bogus}}", LEAD)).toThrow(
      PromptValidationError,
    );
  });
});
