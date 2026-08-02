/**
 * ScrapperNinja content script — STUB (P1).
 *
 * Built by the second (IIFE) Vite pass — MV3 content scripts cannot be ES
 * modules. The full page-harvest message handler (HARVEST_LIST,
 * HARVEST_DETAIL, CAPTURE_PAGE, SCROLL, PING) lands in Phase 2.
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if ((message as { type?: string })?.type === "PING") {
    sendResponse({ ok: true });
  }
  return true;
});

export {};
