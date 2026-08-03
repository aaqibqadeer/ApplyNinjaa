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

## Ingest → rescue pipeline (parse repair)

Capture is best-effort: a card that scrolled half-rendered arrives with
`parseIssues[]` set and its `rawSnippet` kept. Those land as `needs_review`.
Repair is a DeepSeek pass (`lib/scrape/rescue.ts`, `parseRescueResponse` is the
pure, unit-tested core) that re-extracts `businessName`/`phone`/`website`/
`address` from the snippet and clears the flags.

- **Inline at ingest:** up to `INLINE_RESCUE_CAP = 25` flagged records per batch
  are rescued during ingest (locked decision — see `decisions.md`). Hitting the
  monthly AI cap stops rescuing but never fails the ingest — the leads are
  already saved.
- **On demand:** `POST /api/leads/rescue` (`{}` or `{ limit }`) drains the
  needs-review queue for the org, or repairs explicit `ids`. Returns
  `{ ok, attempted, rescued, capReached }`. Every repair consumes one AI-quota
  call; the cap returns HTTP 402 `AI_CAP_REACHED`.

## Phase 3 processing pipeline (batch AI passes)

Once leads are captured and rescued, an operator runs them through a sequence of
**batch jobs** (`batch_jobs`) over a lead selection (explicit ids or the current
filter). The intended order — each step assumes the prior one has run — is:

```
rescue → normalize → dedupe (review) → enrich → label → score → offer
```

- **rescue** — repair `needs_review` records from their `rawSnippet` (wraps the
  Phase 2 rescue pass). AI.
- **normalize** (`lib/leads/normalize.ts`) — phone → E.164 (`libphonenumber-js`),
  website → canonical origin + bare domain (social/directory URLs are folded into
  `socials` / dropped, never stored as a site), and a raw address string → the
  structured `{street,city,state,postalCode,country}` shape via DeepSeek. Only the
  address step is AI, and only when a raw address needs structuring.
- **dedupe** (`lib/leads/dedupe.ts`) — a whole-set scan: (re)compute
  `dedupeKeys` (`phone:<e164>`, `domain:<domain>`, `name:<slug>|zip:<postal>`),
  find pairs that share a key, and write `duplicate_candidates` for a human to
  review. **Never auto-merges** (locked decision). Pure — no AI.
- **duplicate review** — `GET /api/duplicates` lists pending candidates with both
  leads hydrated; `POST /api/duplicates/[id]/merge` (`{ primaryId, fieldChoices }`,
  each field `'a' | 'b'`) applies a human-approved merge (primary keeps the chosen
  values, `campaignIds` union, `lead_sources` repoint to the primary, loser
  soft-deleted with `mergedIntoId`); `POST /api/duplicates/[id]/dismiss` keeps
  both. `resolveMergedFields` (`lib/leads/merge-fields.ts`) is the pure,
  unit-tested field resolver.
- **enrich** (`lib/enrich/*`, gated `features.scraper.enrichment`) — crawl the
  homepage + `/contact` + `/about` (≤3 pages, 10s timeout, 1MB cap, ≤2 redirects,
  respects `robots.txt`, descriptive UA, never parallel on one host) to extract
  emails, socials, tech stack (`lib/enrich/tech.ts`), HTTPS, viewport, and
  copyright year; optional Google PageSpeed (`PAGESPEED_API_KEY`, absent = blank,
  never fails); best-effort owner name via DeepSeek. `websiteStatus` is then
  **rule-derived** (`lib/enrich/website-status.ts`): `none` when there is no
  site; `bad` when any red flag fired (no HTTPS, no viewport, PSI mobile < 50, or
  copyright > 3 years old); else `has`. The fired signals are stored on the lead's
  `customFields.websiteStatusSignals`.
- **label** (`lib/leads/label.ts`) — `businessSize` + `industrySubType` via
  DeepSeek (Zod enums). AI.
- **score** (`lib/leads/score.ts`) — `{ score 0-100, reasoning }` via DeepSeek
  against the rubric in `app_settings.leadScoringRubric` (seeded from
  `DEFAULT_SCORING_RUBRIC`; a blank setting falls back to it). AI.
- **offer** (`lib/leads/offer.ts`, gated `features.scraper.offerLines`) — render a
  chosen `offer_prompts` template's `{{placeholders}}` and generate the offer line
  via DeepSeek; `skipEdited` leaves hand-edited lines (`offerLineEditedAt`) alone.
  AI.

**The runner** (`lib/jobs/runner.ts`, decision "in-process, no Redis"):
`POST /api/jobs` creates the row and schedules processing with `after()` from
`next/server`, so the request returns immediately. Work proceeds in chunks of 25;
after each chunk the counters persist and the status is re-read, so `POST
/api/jobs/[id]/cancel` takes effect mid-run. An in-process runner does **not**
survive a server restart: a job left `running` with no progress for >10 min is
reported `stale`, and `POST /api/jobs/[id]/resume` re-queues it (the passes are
idempotent enough to re-run). Every AI-backed pass enforces the monthly AI quota
per lead; a job that starts already at the cap is rejected up front with 402, and
hitting the cap mid-run stops the job with the 402 message on `error`.
`POST /api/jobs` with `{ estimateOnly: true }` returns `{ estimate: { aiCalls,
remainingQuota } }` so the UI can show the cost before the user confirms.

## Dashboard surfaces (Phase 2 client)

The web app exposes the capture pipeline to operators:

- **`/leads`** — the needs-review status chip shows a live count
  (`needs_review (12)`) and a **"Rescue N records"** toolbar button posts to
  `/api/leads/rescue` (limit 50), toasts the result, and reloads. 402 is handled
  as an upgrade prompt.
- **Lead detail drawer** — the Provenance section lists every `lead_sources`
  row (`GET /api/leads/[id]/sources`: sourceType, sourceUrl, capturedAt) in
  addition to the lead's primary source, so a merged lead shows all its captures.
- **`/leads/sessions`** — read-only capture-session history
  (`GET /api/capture-sessions`): startedAt, sourceType, sourceUrl, mode,
  capturedCount, needsReviewCount, status, endedAt.
- **`/admin/source-packs`** — super-admin CRUD for selector packs (list, edit
  selectors JSON, toggle `isActive`, notes, bump version). Platform-level, gated
  on `features.scraper.enabled && isSuperAdmin`.
