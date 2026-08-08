/**
 * MV3 service worker: the right-click menu on editable elements.
 *
 * Two ways to fill one field:
 *   - "Fill this field with AI" — one AI call, as before.
 *   - "Fill manually" → profile → field — no AI call at all, just paste a
 *     value the user already has.
 *
 * Chrome builds context menus AHEAD of time (there is no hover callback), so
 * the manual submenu is generated from a cached copy of every profile's fill
 * data and rebuilt on install, on startup, and whenever the popup tells us the
 * profiles may have changed.
 *
 * The context-menu click is a user gesture that grants activeTab, so
 * executeScript works without broad host permissions.
 */

import { api } from "./lib/api";
import {
  describeActiveElement,
  fillFields,
  type CollectedField,
} from "./lib/dom-actions";
import {
  fieldMenuTitle,
  profileFields,
  type ProfileField,
} from "./lib/profile-fields";
import type { MapFieldsResponse, ProfileFillData } from "./lib/types";

const ROOT_ID = "applyninjaa";
const AI_FILL_ID = "applyninjaa-fill-field";
const MANUAL_ID = "applyninjaa-fill-manual";
const MANUAL_PREFIX = "applyninjaa-manual:";

/**
 * Menu-item id → the value it pastes.
 *
 * Mirrored into `chrome.storage.session` because MV3 kills an idle service
 * worker within about 30 seconds while Chrome keeps the menu itself: without
 * the mirror, the first click after a pause would find an empty map and do
 * nothing at all.
 */
const MANUAL_VALUES_KEY = "manual-menu-values";
let manualValues = new Map<string, ProfileField>();

async function persistManualValues(): Promise<void> {
  await chrome.storage.session.set({
    [MANUAL_VALUES_KEY]: Object.fromEntries(manualValues),
  });
}

async function manualValueFor(id: string): Promise<ProfileField | null> {
  const cached = manualValues.get(id);
  if (cached) return cached;
  const stored = await chrome.storage.session.get(MANUAL_VALUES_KEY);
  const map = stored[MANUAL_VALUES_KEY] as
    Record<string, ProfileField> | undefined;
  if (!map) return null;
  manualValues = new Map(Object.entries(map));
  return manualValues.get(id) ?? null;
}

/* -- Menu construction ------------------------------------------------------ */

function createMenu(
  properties: chrome.contextMenus.CreateProperties,
): Promise<void> {
  return new Promise((resolve) => {
    chrome.contextMenus.create(properties, () => {
      // Reading lastError clears it; a duplicate id is not worth failing over.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function buildMenu(): Promise<void> {
  await chrome.contextMenus.removeAll();
  manualValues = new Map();
  await persistManualValues();

  await createMenu({
    id: ROOT_ID,
    title: "ApplyNinjaa",
    contexts: ["editable"],
  });
  await createMenu({
    id: AI_FILL_ID,
    parentId: ROOT_ID,
    title: "Fill this field with AI (1 action)",
    contexts: ["editable"],
  });

  let profiles: ProfileFillData[] = [];
  try {
    const data = await api<{ profiles: ProfileFillData[] }>(
      "/api/profiles/fill-data",
    );
    profiles = data.profiles;
  } catch {
    // Signed out or offline — the AI item stays, the manual submenu doesn't.
    return;
  }
  if (profiles.length === 0) return;

  await createMenu({
    id: MANUAL_ID,
    parentId: ROOT_ID,
    title: "Fill manually",
    contexts: ["editable"],
  });

  for (const profile of profiles) {
    const fields = profileFields(profile);
    if (fields.length === 0) continue;
    const profileMenuId = `${MANUAL_PREFIX}profile:${profile.id}`;
    await createMenu({
      id: profileMenuId,
      parentId: MANUAL_ID,
      title: profile.name,
      contexts: ["editable"],
    });
    for (const [index, field] of fields.entries()) {
      const id = `${MANUAL_PREFIX}${profile.id}:${index}`;
      manualValues.set(id, field);
      await createMenu({
        id,
        parentId: profileMenuId,
        title: fieldMenuTitle(field),
        contexts: ["editable"],
      });
    }
  }

  await persistManualValues();
}

chrome.runtime.onInstalled.addListener(() => {
  void buildMenu();
});
chrome.runtime.onStartup.addListener(() => {
  void buildMenu();
});

/**
 * The popup pings this on open. The service worker is killed and restarted
 * freely, which drops `manualValues`, so a rebuild is also how the menu
 * recovers after a restart — and how a newly added profile or saved answer
 * shows up without reloading the extension.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if ((message as { type?: string })?.type === "refresh-menu") {
    void buildMenu().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

/* -- Clicks ----------------------------------------------------------------- */

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const menuItemId = String(info.menuItemId);
  if (menuItemId === AI_FILL_ID) {
    void fillFocusedField(tab.id, tab.url ?? null);
    return;
  }
  if (!menuItemId.startsWith(MANUAL_PREFIX)) return;
  const tabId = tab.id;
  void manualValueFor(menuItemId).then((field) => {
    if (field) void pasteIntoFocusedField(tabId, field);
  });
});

/** Write a value the user already has — no AI call, no quota. */
async function pasteIntoFocusedField(
  tabId: number,
  field: ProfileField,
): Promise<void> {
  try {
    const target = await describeFocused(tabId);
    if (!target) {
      await notify(tabId, "Click into the field first, then use the menu.");
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      func: fillFields,
      args: [[{ id: "active", value: field.value }]],
    });
  } catch (error) {
    await notify(tabId, `ApplyNinjaa: ${errorMessage(error)}`);
  }
}

async function describeFocused(tabId: number): Promise<CollectedField | null> {
  // Right-clicking an input focuses it in Chrome, so activeElement is the
  // target. Exotic widgets may not focus — then we simply find nothing.
  const [described] = await chrome.scripting.executeScript({
    target: { tabId },
    func: describeActiveElement,
  });
  return (described?.result as CollectedField | null) ?? null;
}

async function fillFocusedField(
  tabId: number,
  tabUrl: string | null,
): Promise<void> {
  try {
    const field = await describeFocused(tabId);
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
        "ApplyNinjaa couldn't confidently fill this field from your profile. Try Fill manually.",
      );
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      func: fillFields,
      args: [[{ id: "active", value }]],
    });
  } catch (error) {
    await notify(tabId, `ApplyNinjaa: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
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
