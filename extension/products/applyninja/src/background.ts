/**
 * MV3 service worker: registers the right-click "Fill this field" context
 * menu on editable elements and performs the single-field fill (one AI call).
 *
 * The context-menu click is a user gesture that grants activeTab, so
 * executeScript works without broad host permissions.
 */

import { api } from "../../../shared/api";
import type { MapFieldsResponse } from "../../../shared/types";
import {
  describeActiveElement,
  fillFields,
  type CollectedField,
} from "./lib/dom-actions";

const MENU_ID = "applyninjaa-fill-field";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Fill this field with ApplyNinjaa",
    contexts: ["editable"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  void fillFocusedField(tab.id, tab.url ?? null);
});

async function fillFocusedField(
  tabId: number,
  tabUrl: string | null,
): Promise<void> {
  try {
    // Right-clicking an input focuses it in Chrome, so activeElement is the
    // target. Exotic widgets may not focus — then we simply find nothing.
    const [described] = await chrome.scripting.executeScript({
      target: { tabId },
      func: describeActiveElement,
    });
    const field = described?.result as CollectedField | null;
    if (!field) {
      await notify(tabId, "Click into the field first, then use the menu.");
      return;
    }

    const domain = tabUrl ? new URL(tabUrl).hostname : null;
    const response = await api<MapFieldsResponse>("/api/ai/map-fields", {
      body: { fields: [field], domain },
    });
    const value = response.mappings[0]?.value;
    if (!value) {
      await notify(
        tabId,
        "ApplyNinjaa couldn't confidently fill this field from your profile.",
      );
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      func: fillFields,
      args: [[{ id: "active", value }]],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    await notify(tabId, `ApplyNinjaa: ${message}`);
  }
}

/** Lightweight in-page toast (no notifications permission needed). */
async function notify(tabId: number, message: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (text: string) => {
        const el = document.createElement("div");
        el.textContent = text;
        el.setAttribute(
          "style",
          "position:fixed;bottom:16px;right:16px;z-index:2147483647;" +
            "background:#8843db;color:#fff;padding:10px 14px;border-radius:8px;" +
            "font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.25)",
        );
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
      },
      args: [message],
    });
  } catch {
    // Page may forbid injection (chrome:// etc.) — nothing to do.
  }
}
