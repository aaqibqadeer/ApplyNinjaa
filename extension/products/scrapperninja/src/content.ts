/**
 * ScrapperNinja content script.
 *
 * Runs in the PAGE context and answers the service worker's capture messages
 * (PING / HARVEST_LIST / HARVEST_DETAIL / CAPTURE_PAGE / SCROLL). It resolves
 * the right source adapter for the current URL and delegates to it.
 *
 * Built as an IIFE by vite.content.config.ts — MV3 content scripts cannot be ES
 * modules. It works both as a statically-declared script (Google Maps) and when
 * injected on demand via chrome.scripting.executeScript (generic / manual), so
 * it guards against double-registration.
 */

import { resolve } from "./scrapers/registry";
import type { ContentRequest, ContentResponse } from "./lib/messages";

declare global {
  interface Window {
    __scrapperNinjaContentReady?: boolean;
  }
}

async function handle(message: ContentRequest): Promise<ContentResponse> {
  if (message.type === "PING") {
    return { ok: true, type: "PING" };
  }

  const adapter = resolve(location.href);
  try {
    switch (message.type) {
      case "HARVEST_LIST": {
        const records = await adapter.harvestList(message.ctx);
        return { ok: true, type: "HARVEST_LIST", records };
      }
      case "HARVEST_DETAIL": {
        if (!adapter.harvestDetail) {
          return { ok: true, type: "HARVEST_DETAIL", patch: {} };
        }
        const patch = await adapter.harvestDetail(message.ctx, message.ref);
        return { ok: true, type: "HARVEST_DETAIL", patch };
      }
      case "CAPTURE_PAGE": {
        const record = await adapter.capturePage(message.ctx);
        return { ok: true, type: "CAPTURE_PAGE", record };
      }
      case "SCROLL": {
        if (!adapter.scroll) {
          return { ok: true, type: "SCROLL", reachedEnd: true };
        }
        const { reachedEnd } = await adapter.scroll(message.ctx);
        return { ok: true, type: "SCROLL", reachedEnd };
      }
      default:
        return { ok: false, error: "Unknown message" };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Content script error",
    };
  }
}

if (!window.__scrapperNinjaContentReady) {
  window.__scrapperNinjaContentReady = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    void handle(message as ContentRequest).then(sendResponse);
    // Keep the message channel open for the async response.
    return true;
  });
}
