/**
 * Message protocol between the service worker and the content script.
 *
 * The service worker drives capture; the content script is a thin executor that
 * reads/scrolls the page on request. The same handler answers whether the
 * content script was declared statically (Google Maps) or injected on demand
 * via chrome.scripting.executeScript (generic / manual).
 */

import type { HarvestContext, RawRecord } from "../scrapers/types";

export type ContentRequest =
  | { type: "PING" }
  | { type: "HARVEST_LIST"; ctx: HarvestContext }
  | { type: "HARVEST_DETAIL"; ctx: HarvestContext; ref: RawRecord }
  | { type: "CAPTURE_PAGE"; ctx: HarvestContext }
  | { type: "SCROLL"; ctx: HarvestContext };

export type ContentResponse =
  | { ok: true; type: "PING" }
  | { ok: true; type: "HARVEST_LIST"; records: RawRecord[] }
  | { ok: true; type: "HARVEST_DETAIL"; patch: Partial<RawRecord> }
  | { ok: true; type: "CAPTURE_PAGE"; record: RawRecord }
  | { ok: true; type: "SCROLL"; reachedEnd: boolean }
  | { ok: false; error: string };
