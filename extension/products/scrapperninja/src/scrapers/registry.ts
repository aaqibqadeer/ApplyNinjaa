/**
 * Adapter registry: resolve(url) -> the most specific SourceAdapter, falling
 * back to the generic tier-"b" adapter for any site without a named adapter.
 *
 * Safe to import in the service worker: only `match`/`automationTier`/
 * `supportsDeep` are read there (for tier enforcement); the DOM-touching
 * harvest methods run only when the content script calls them.
 */

import { genericAdapter } from "./generic";
import { googleMapsAdapter } from "./google-maps";
import { manualAdapter } from "./manual";
import type { SourceAdapter } from "./types";

/** Named adapters, most specific first. `generic` is the fallback, not listed. */
const NAMED_ADAPTERS: SourceAdapter[] = [googleMapsAdapter, manualAdapter];

export function resolve(url: string): SourceAdapter {
  for (const adapter of NAMED_ADAPTERS) {
    if (adapter.match(url)) return adapter;
  }
  return genericAdapter;
}

export { genericAdapter, googleMapsAdapter, manualAdapter };
