# ApplyNinjaa Chrome Extension (Manifest V3)

Popup-only UI: analyze the open job posting against your Valid Job filters,
see your fit score, autofill the application form, and track it — all through
the ApplyNinjaa backend (the extension never calls the AI provider directly).

## Build

```bash
# from the repo root
npm run build:extension

# or, custom backend origin (defaults to http://localhost:3000)
VITE_API_ORIGIN=https://app.example.com npm --prefix extension run build
```

The build output is `extension/dist/`.

## Load unpacked

1. Run the web app (`npm run dev`) and sign in at `http://localhost:3000`.
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select `extension/dist`.
4. Open a job posting, click the ApplyNinjaa icon.

## How auth works

The popup exchanges your dashboard session cookie for a long-lived
extension token (`POST /api/auth/extension-token`) and stores it in
`chrome.storage.local`; every API call then uses `Authorization: Bearer`.
Signing out of the dashboard doesn't revoke an already-issued token until it
expires (30 days).

## Architecture notes

- **No content script.** All page-DOM work (reading the posting + form
  fields, writing values) is done with self-contained functions passed to
  `chrome.scripting.executeScript` — see `src/lib/dom-actions.ts` and the
  serialization constraint documented there.
- **Permissions:** `activeTab` + `scripting` (granted per user click),
  `contextMenus` (right-click "Fill this field"), `storage`. Host permission
  is the backend origin only — never job sites.
- **Field detection** is a generic DOM heuristic (labels, aria, placeholders,
  nearby text) + AI mapping fallback — no per-site adapters.
- Analysis responses are cached per-URL in `chrome.storage.session` so
  reopening the popup on the same posting doesn't spend another AI call.
