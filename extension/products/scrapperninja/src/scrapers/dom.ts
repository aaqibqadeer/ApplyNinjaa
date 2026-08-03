/**
 * Small DOM helpers shared by the content-script adapters.
 *
 * These run in the PAGE context (inside the content script), so `document` and
 * `window` are available. Kept dependency-free and defensive — directory DOMs
 * are hostile and change often.
 */

/** Trim + collapse whitespace; empty string becomes null. */
export function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

/** First element matching any of the selectors, or null. */
export function pick(root: ParentElement, selectors: string[]): Element | null {
  for (const selector of selectors) {
    if (!selector) continue;
    try {
      const el = root.querySelector(selector);
      if (el) return el;
    } catch {
      // Invalid selector from a server pack — skip it.
    }
  }
  return null;
}

type ParentElement = Document | Element;

/** textContent of the first matching selector, cleaned. */
export function pickText(root: ParentElement, selectors: string[]): string | null {
  const el = pick(root, selectors);
  return el ? cleanText(el.textContent) : null;
}

/** A named attribute of the first matching selector, cleaned. */
export function pickAttr(
  root: ParentElement,
  selectors: string[],
  attr: string,
): string | null {
  const el = pick(root, selectors);
  return el ? cleanText(el.getAttribute(attr)) : null;
}

/** Parse the first float in a string (e.g. "4.6 stars" -> 4.6). */
export function parseNumber(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : null;
}

/** Parse an integer review count from "(1,234)" / "1,234 reviews". */
export function parseCount(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(/[(),]/g, "").match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until `predicate` is truthy or `timeout` ms elapse. */
export async function waitFor(
  predicate: () => boolean,
  timeout = 4000,
  interval = 100,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(interval);
  }
  return predicate();
}
