# Scraping architecture — ScrapperNinja capture extension

How the Chrome extension harvests businesses from directory sites and lands them
in the shared Lead Directory. Read `docs/knowledge-base/current-state.md` first;
the collections are in `docs/architecture/data-layer.md`, the multi-product build
in `docs/guides/two-product-production-plan.md` §P1.

## Multi-product extension build (P1)

`extension/` builds two independent MV3 extensions from shared code:

```
extension/
  shared/                       api.ts · types.ts · popup.css   (both products)
  products/
    applyninja/                 manifest.template.json · popup.html · src/…
    scrapperninja/              manifest.template.json · popup.html · src/…
  vite.config.ts                product-parameterised (reads PRODUCT)
  vite.content.config.ts        scrapperninja content-script pass (IIFE)
  build.mjs                     tsc --noEmit → vite build → (scrapper) content pass
```

Build commands (from the repo root):

```bash
npm run build:extension:apply      # -> extension/dist/applyninja/
npm run build:extension:scrapper   # -> extension/dist/scrapperninja/
npm run build:extension            # both
```

`PRODUCT` (`applyninja` | `scrapperninja`) selects everything; an unknown or
missing value fails the build loudly — a default would ship the wrong extension.
`VITE_API_ORIGIN` (default `http://localhost:3000`) is compiled into both the
manifest `host_permissions` and the API client via `__API_ORIGIN__`.

## The IIFE content-script constraint (non-obvious — do not rediscover)

MV3 **content scripts cannot be ES modules**. The popup and service worker are
built by rollup with output `format: "es"`, and **rollup cannot mix output
formats in one build**. So ScrapperNinja's content script gets a *second* Vite
pass, `vite.content.config.ts`:

- single entry `products/scrapperninja/src/content.ts`
- `output.format: "iife"`, `inlineDynamicImports: true` (one self-contained file)
- `build.emptyOutDir: false` — it drops `content.js` into the SAME
  `dist/scrapperninja/` folder without wiping the main build's
  popup/background/manifest.

`build.mjs` chains the two passes for ScrapperNinja only; ApplyNinjaa has no
content script and runs a single pass.

## Injection strategy

To avoid requesting `<all_urls>` (which alarms users at install):

- A **static** `content_script` is declared only for `https://www.google.com/maps/*`.
- For **generic** and **manual** capture on any other site, the content script
  is injected on demand with
  `chrome.scripting.executeScript({ target, files: ["content.js"] })` under the
  `activeTab` permission the popup click grants.

`content.ts` is written to work in both modes: as a statically-declared script
and as an `executeScript`-injected file. It is idempotent (guards against double
injection) and answers the same message protocol either way.

## Source adapters and automation tiers

`products/scrapperninja/src/scrapers/` resolves a `SourceAdapter` per URL:

| Adapter       | Tier | Deep | Behaviour |
|---------------|------|------|-----------|
| `google-maps` | a    | yes  | Fast: scroll the results feed, harvest each card. Deep: open each result for phone/website/hours/plus code. Selectors bundled as a fallback, overridden by the server pack. |
| `generic`     | b    | no   | Heuristically finds the largest set of similar sibling blocks, strips each to clean text, and tags `parseIssues: ["needs_ai_extract"]` + a `rawSnippet` for server-side AI extraction. |
| `manual`      | d    | no   | No auto harvest at all — one "Capture this page" click yields one record from the visible page. |

`registry.resolve(url)` matches the most specific adapter and falls back to
`generic`.

**Tier enforcement is a hard rule, enforced in the service worker (not just the
UI):** if the resolved adapter's `automationTier === "d"`, the extension refuses
to auto-scroll or auto-click. Only manual capture is reachable and the popup
shows a ban-risk warning.

## Server-pushed selector packs

The extension fetches `GET /api/scrape/selectors` (Bearer) at capture start and
caches the packs in `chrome.storage.local` by version. Bundled selectors
(`google-maps/selectors.ts`) are the fallback when the fetch fails. This lets a
Google DOM change be fixed by editing a pack in the DB, without shipping a new
extension build.

## Offline queue + sync

- `src/lib/queue.ts` — a hand-rolled IndexedDB store `captureQueue` keyed by a
  client `clientId` (`crypto.randomUUID()`). Records: `{ clientId, campaignId,
  sessionId, payload, attempts, state, createdAt }`.
- `src/lib/sync.ts` — drains the queue in batches of 50 to `POST /api/leads/ingest`,
  with exponential backoff on failure. A `chrome.alarms` tick every 5 minutes
  retries while the queue is non-empty, so capture works fully offline.
- **Idempotency:** `clientId` is sent as `clientCaptureId`; the server upserts on
  the unique-sparse `(organization_id, client_capture_id)` index, so retries can
  never double-insert.

## Backend contract (built by the web app, not the extension)

The extension calls these paths; the server routes are implemented separately:

- `POST /api/leads/ingest` — batch upsert by `clientCaptureId`, write provenance,
  bump `campaign.leadCount`; records with a non-empty `parseIssues[]` land as
  `needs_review` keeping their `rawSnippet`.
- `POST /api/scrape/extract` — generic adapter's AI extraction (cleaned text →
  structured records).
- `GET /api/scrape/selectors` — active selector packs.
- `POST /api/capture-sessions`, `PATCH /api/capture-sessions/[id]` — session
  lifecycle (mode, counts, status, extension version).
