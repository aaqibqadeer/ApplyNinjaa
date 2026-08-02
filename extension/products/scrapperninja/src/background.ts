/**
 * ScrapperNinja service worker — STUB (P1).
 *
 * The full capture orchestration (start/stop, selector packs, offline queue,
 * sync, badge count, tier enforcement) lands in Phase 2. This stub only keeps
 * the service worker entry present so the multi-product build produces a valid
 * MV3 bundle.
 */

chrome.runtime.onInstalled.addListener(() => {
  // Phase 2 wires alarms + capture state here.
});

export {};
