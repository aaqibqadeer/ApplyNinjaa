/**
 * lib/scrape/blocks.test.ts — the generic adapter's repeated-block heuristic
 * must find the largest set of structurally-similar siblings while ignoring
 * chrome (short text) and undersized groups, and tie-break toward the
 * content-richest group. Pure, no jsdom.
 */

import { describe, expect, it } from "vitest";

import {
  pickBestRepeatedGroup,
  repeatedBlockTexts,
  type BlockCandidate,
} from "./blocks";

/** Build `n` candidates of one signature with distinct, long-enough text. */
function group(signature: string, n: number, prefix: string): BlockCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    signature,
    text: `${prefix} business number ${i + 1} — Austin, TX`,
  }));
}

describe("pickBestRepeatedGroup", () => {
  it("returns the largest structurally-similar group", () => {
    const candidates: BlockCandidate[] = [
      ...group("nav>a", 4, "Home About Contact link"),
      ...group("div.result", 7, "Result"),
    ];
    const best = pickBestRepeatedGroup(candidates);
    expect(best).toHaveLength(7);
    expect(best.every((c) => c.signature === "div.result")).toBe(true);
  });

  it("ignores groups below minGroupSize", () => {
    const candidates = group("div.result", 2, "Result");
    expect(pickBestRepeatedGroup(candidates)).toEqual([]);
  });

  it("drops short-text chrome nodes before grouping", () => {
    const chrome: BlockCandidate[] = Array.from({ length: 9 }, () => ({
      signature: "span.dot",
      text: "·",
    }));
    const results = group("li.card", 3, "Plumbing");
    const best = pickBestRepeatedGroup([...chrome, ...results]);
    expect(best).toHaveLength(3);
    expect(best[0].signature).toBe("li.card");
  });

  it("tie-breaks equal-sized groups toward the richer text", () => {
    const lean: BlockCandidate[] = [
      { signature: "a.lean", text: "Acme LLC ok" },
      { signature: "a.lean", text: "Beta LLC ok" },
      { signature: "a.lean", text: "Cade LLC ok" },
    ];
    const rich = group("div.rich", 3, "A much longer richer result entry for");
    const best = pickBestRepeatedGroup([...lean, ...rich]);
    expect(best).toHaveLength(3);
    expect(best[0].signature).toBe("div.rich");
  });

  it("returns [] for no candidates", () => {
    expect(pickBestRepeatedGroup([])).toEqual([]);
  });

  it("collapses whitespace in the returned text", () => {
    const candidates: BlockCandidate[] = Array.from({ length: 3 }, (_, i) => ({
      signature: "div.result",
      text: `  Result   ${i}\n\n  with   spaces  `,
    }));
    const texts = repeatedBlockTexts(candidates);
    expect(texts).toHaveLength(3);
    expect(texts[0]).toBe("Result 0 with spaces");
  });
});
