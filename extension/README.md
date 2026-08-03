# Chrome Extensions (Manifest V3) — multi-product

This folder builds **two independent MV3 extensions** from one shared codebase
(`docs/guides/two-product-production-plan.md` §P1):

- **ApplyNinjaa** — analyze a job posting against your Valid Job filters, see
  your fit score, autofill the application form, and track it.
- **ScrapperNinja** — capture local businesses from directory sites into your
  ScrapperNinja lead directory (queue offline, sync to the dashboard).

Both talk only to the ApplyNinjaa/ScrapperNinja backend — the extension never
calls the AI provider directly.

## Layout

```
shared/                api.ts (Bearer auth) · types.ts · popup.css   (both)
products/
  applyninja/          manifest.template.json · popup.html · src/…
  scrapperninja/       manifest.template.json · popup.html · src/… (+ content.ts)
vite.config.ts         product-parameterised (reads PRODUCT)
vite.content.config.ts scrapperninja content-script pass (IIFE)
build.mjs              tsc --noEmit → vite build → (scrapper) content pass
```

## Build

```bash
# from the repo root
npm run build:extension            # both products
npm run build:extension:apply      # ApplyNinjaa only  -> extension/dist/applyninja/
npm run build:extension:scrapper   # ScrapperNinja only -> extension/dist/scrapperninja/

# custom backend origin (defaults to http://localhost:3000)
VITE_API_ORIGIN=https://app.example.com PRODUCT=applyninja npm --prefix extension run build
```

`PRODUCT` (`applyninja` | `scrapperninja`) selects the product; an unknown or
missing value fails the build loudly. Output lands in `extension/dist/<product>/`.

## Load unpacked

1. Run the web app (`npm run dev`) and sign in at `http://localhost:3000`.
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select `extension/dist/applyninja` (or
   `extension/dist/scrapperninja`).

## How auth works

Both popups exchange your dashboard session cookie for a long-lived extension
token (`POST /api/auth/extension-token`) stored in `chrome.storage.local`; every
API call then uses `Authorization: Bearer`. Signing out of the dashboard doesn't
revoke an already-issued token until it expires (30 days).

## Icons

Drop `icon-{16,32,48,128}.png` into `products/<product>/icons/` for a
product-specific set, or into the shared `extension/icons/` as a fallback.
Missing sizes are skipped (a manifest declaring a missing icon makes Chrome
refuse to load the extension).

## Architecture notes

- **ApplyNinjaa** has no content script — all page-DOM work ships as
  self-contained functions passed to `chrome.scripting.executeScript` (see
  `products/applyninja/src/lib/dom-actions.ts`).
- **ScrapperNinja** has a content script for page harvesting. MV3 content
  scripts cannot be ES modules, so it is built by a second IIFE Vite pass — see
  `docs/architecture/scraping.md`.
