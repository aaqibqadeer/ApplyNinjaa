/**
 * lib/scrape/blocks.ts — the generic adapter's repeated-block heuristic.
 *
 * The generic (tier-b) adapter has no site-specific selectors: it finds the
 * result list by locating the LARGEST set of sibling elements that share the
 * same structure, strips each to clean text, and sends that batch to the server
 * for AI extraction (POST /api/scrape/extract).
 *
 * This module holds the pure scoring heuristic so it is unit-testable with NO
 * jsdom and no DOM: the DOM walk (in the extension) reduces each candidate
 * element to a `{ signature, text }` pair, and this picks the winning group.
 * Keeping it pure and shared means the extension and the server agree on what a
 * "result block" is.
 */

/** One candidate element reduced to its structural signature + clean text. */
export interface BlockCandidate {
  /**
   * A structural fingerprint of the element (e.g. tag path + class shape). Two
   * elements with the same signature are considered the same "kind" of node.
   */
  signature: string;
  /** The element's cleaned, whitespace-collapsed text content. */
  text: string;
}

export interface PickBestOptions {
  /** A group must have at least this many members to count as a list. */
  minGroupSize?: number;
  /** Members with fewer than this many non-space chars are ignored as chrome. */
  minTextLength?: number;
}

const DEFAULTS: Required<PickBestOptions> = {
  minGroupSize: 3,
  minTextLength: 8,
};

/** Collapse runs of whitespace so text length/richness compares fairly. */
function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Pick the repeated result group from a flat list of sibling candidates.
 *
 * Groups candidates by `signature`, discards groups smaller than
 * `minGroupSize`, and scores the rest by size first (a directory result list is
 * the biggest repeated group) then by total text length (tie-break toward the
 * content-richest group, so a large group of empty spacer nodes never wins).
 * Returns the winning group's members in their original order, or `[]` when no
 * group qualifies.
 */
export function pickBestRepeatedGroup(
  candidates: BlockCandidate[],
  options: PickBestOptions = {},
): BlockCandidate[] {
  const { minGroupSize, minTextLength } = { ...DEFAULTS, ...options };

  const groups = new Map<string, BlockCandidate[]>();
  for (const candidate of candidates) {
    const text = normalizeText(candidate.text);
    if (text.length < minTextLength) continue;
    const normalized: BlockCandidate = { signature: candidate.signature, text };
    const existing = groups.get(candidate.signature);
    if (existing) existing.push(normalized);
    else groups.set(candidate.signature, [normalized]);
  }

  let best: BlockCandidate[] | null = null;
  let bestTextLength = 0;
  for (const group of groups.values()) {
    if (group.length < minGroupSize) continue;
    const totalTextLength = group.reduce((sum, c) => sum + c.text.length, 0);
    const bestSize = best?.length ?? 0;
    if (
      group.length > bestSize ||
      (group.length === bestSize && totalTextLength > bestTextLength)
    ) {
      best = group;
      bestTextLength = totalTextLength;
    }
  }

  return best ?? [];
}

/** Convenience: the cleaned text of the winning group, ready for extraction. */
export function repeatedBlockTexts(
  candidates: BlockCandidate[],
  options: PickBestOptions = {},
): string[] {
  return pickBestRepeatedGroup(candidates, options).map((c) => c.text);
}
