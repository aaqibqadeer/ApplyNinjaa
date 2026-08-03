# Current State

> **Read this first, every session** (CLAUDE.md §11). Living **snapshot** —
> overwritten, not appended. Keep it terse. Update at the end of every phase.

_Last updated: 2026-08-02 — **ScrapperNinja Phase 2 complete (server + client)**
on `cursor/scrapperninja-phase2-ba86`. Server: capture ingest + parse-rescue +
generic extract APIs, server-pushed selector packs, capture sessions (typecheck
+ lint + `npm test` (68) pass; ingest/rescue/session/pack round-trip
runtime-verified against local Mongo). Client: the multi-product Chrome
extension (P1) + the ScrapperNinja capture extension — content-script adapters,
IndexedDB queue, sync, popup, tier enforcement. Both product builds pass; the
extension's wire payloads were validated against the server Zod schemas._

## What this repo is

**One codebase, two products** (`docs/guides/two-product-production-plan.md`).
`NEXT_PUBLIC_PRODUCT` (`applyninja` | `scrapperninja`) selects **identity**
(name/copy/legal via `config/products.ts`); `NEXT_PUBLIC_FEATURE_*` flags select
**capability**. The two are independent by design — always set `PRODUCT`, no
silent default.

- **ApplyNinjaa** — job-seeker SaaS (profiles, filters, fit scoring, autofill
  tracker, Gmail scans, Chrome extension). Gated by `jobApplications`.
- **ScrapperNinja** — lead-gen SaaS: capture local businesses, enrich/score
  them, export cold-email-ready CSVs from a shared **Lead Directory**. Gated by
  the `scraper` flag group.

This fork's `.env` ships the **ScrapperNinja** set: `scraper` on,
`jobApplications` **off** by default.

## ScrapperNinja Phase 1 — what's built (this phase)

- **Product registry (P0)** — `config/products.ts` resolves identity or throws;
  `jobApplications` + nested `scraper` (`enabled`/`enrichment`/`offerLines`/
  `genericExtractor`) flags added to `config/features.ts`. ApplyNinjaa's pages/
  APIs `notFound()` when `jobApplications` is off.
- **5 collections** (all tenant-scoped): `leads`, `campaigns`, `lead_sources`,
  `saved_views`, `lead_custom_fields` — Zod schema + Mongo adapter + seed, same
  commit. Capture is idempotent on unique-sparse `(org, client_capture_id)`;
  leads soft-delete via `deleted_at`. Detail: `docs/architecture/data-layer.md`.
- **Lead Directory at `/leads`** — server-filtered/sorted/paginated table with
  column show/hide, saved views, inline edits, a detail drawer, campaigns
  manager, custom-field manager, and CSV export. Query/service/CSV logic in
  `lib/leads/`; components in `components/leads/` (on shared table primitives).
- **Query safety** (`lib/leads/query.ts`): default junk + soft-deleted exclusion,
  regex-escaped text filters/global `q`, column allow-list (unknown/non-
  filterable/non-sortable rejected), `customFields.<key>` only when the key is
  registered, `f.col.in`/`min`/`max`, single-column sort, page/skip math.
- **CSV** (`lib/leads/csv.ts`): RFC-quoting + formula-injection prefix for
  `= + - @`; `csvHeader`/`serializeLeadRow` map the column catalog.
- **Vitest suite** — `lib/leads/{query,csv,columns}.test.ts` (55 tests, pure
  logic; `@/` alias in `vitest.config.mts`). Scripts: `test`, `test:watch`,
  `seed:test`.
- **Seed** — `npm run seed` seeds ~30 demo leads across 2 campaigns + 2 saved
  views + a `priority` custom field for the admin org (idempotent, `seed-demo-`
  prefix). `scripts/seed-test.ts` now wipes + reseeds the isolated test DB.

## ScrapperNinja Phase 2 — what's built (server side, this phase)

- **2 collections** — `source_packs` (**platform-level**, no `organization_id`,
  like `plans` §15; unique `source_id`, `is_active`) and `capture_sessions`
  (org-scoped; `(org, started_at desc)` index). Each shipped Zod schema + Mongo
  adapter + seed/CRUD in the same commit (§1.4).
- **Ingest** `POST /api/leads/ingest` (Bearer) — idempotent upsert on
  `(org, client_capture_id)`, one `lead_sources` provenance row per record,
  `campaign.lead_count` bumped for **new** leads only, `parse_issues[]` →
  `needs_review` (keeps `raw_snippet`), inline DeepSeek rescue for ≤25 flagged.
- **Rescue** `POST /api/leads/rescue` — batch repair by ids or the needs-review
  queue. **Extract** `POST /api/scrape/extract` — generic-adapter AI extraction
  of cleaned text blocks (gated on `scraper.genericExtractor`). Both enforce AI
  quota + `recordAiCall`.
- **Selector packs** — `GET /api/scrape/selectors` (active packs, Bearer) +
  super-admin CRUD `/api/admin/source-packs`. Google Maps pack seeded (11
  selector keys), idempotent by `sourceId`.
- **Capture sessions** — `POST /api/capture-sessions`, `GET`/`PATCH
  /api/capture-sessions/[id]` (auto-stamps `ended_at` on a terminal status).
- **AI plumbing** — `lib/ai/routing.ts` maps all 8 pipeline tasks → DeepSeek in
  one place; `lib/scrape/{generate,rescue,extract,blocks}.ts` hold the tasks +
  the pure `parseRescueResponse` / `pickBestRepeatedGroup` (unit-tested,
  DB/env-free via a lazy `ai()` import). New `AiCallKind`s `lead_rescue`,
  `scrape_extract`.

## ScrapperNinja Phase 2 — what's built (extension/client side, this phase)

- **Multi-product extension (P1)** — `extension/` builds TWO MV3 extensions from
  shared code: `shared/` (api/types/popup.css), `products/<product>/`, a
  `PRODUCT`-parameterised `vite.config.ts` → `dist/<product>/`, and a second
  IIFE pass (`vite.content.config.ts`) for ScrapperNinja's content script.
  ApplyNinjaa moved intact via `git mv` (behaviour unchanged). Root scripts:
  `build:extension:apply` / `:scrapper` / `build:extension`.
- **Capture extension** — `products/scrapperninja/`: source adapters
  (`scrapers/`: google-maps tier a + deep, generic tier b AI-extract, manual
  tier d) behind a `registry.resolve(url)`; **tier "d" enforced in the service
  worker** (auto capture refused, manual only). Content script answers
  HARVEST_LIST/DETAIL/CAPTURE_PAGE/SCROLL/PING, works static-declared (Maps) or
  `executeScript`-injected (generic/manual).
- **Offline + sync** — hand-rolled IndexedDB `captureQueue` (`lib/queue.ts`) keyed
  by `clientId`; `lib/sync.ts` groups by (sourceType, campaignId, sessionId) and
  drains to `/api/leads/ingest` in batches of 50 with backoff; a `chrome.alarms`
  tick every 5 min retries. Idempotent via `clientId` → `clientCaptureId`.
- **Popup** — sign-in gate, required campaign picker (select/create), Fast/Deep
  (Deep off when unsupported), pacing, per-run cap (200) + "keep going", live
  counters, tier-d warning, "Capture this page". Badge shows the live count.
- **Selector packs** — the worker fetches `GET /api/scrape/selectors` and caches
  by version; bundled `google-maps/selectors.ts` is the fallback. Pack keys +
  `sourceId` "google-maps" match the seeded pack. Docs: `architecture/scraping.md`.

## Resolved choices (carried from ApplyNinjaa v1.1 — still true)

- **DB: MongoDB only** (Supabase adapters deleted, §1.5). `multiTenant` off: org
  ≡ user via one silent default org; org stays the billing entity.
- **AI: DeepSeek** (`lib/ai/deepseek`, OpenAI-compatible); tasks in
  `lib/ai/tasks.ts`. Scraper enrichment/offer-lines (Phase 3) will use it.
- **Auth**: custom-JWT + LinkedIn OAuth + email verification; extension Bearer
  path (`/api/auth/extension-token`).
- **Payments**: Stripe; Free/Starter/Pro/Premium plans by stable slug with
  `limits`. **Admin `/admin`** is platform-staff only (`is_super_admin` /
  `is_support_admin`), audited in `admin_actions`.
- **Theme**: violet oklch tokens in `config/theme.ts` + `globals.css` (v4,
  hand-mirrored). **Encryption**: AES-256-GCM for EEO fields + Gmail tokens.

## Verification status

- `npm run typecheck`, `npm run lint`, and `NEXT_PUBLIC_PRODUCT=scrapperninja
  npm test` (55 tests) pass. `next build` passes with `SKIP_ENV_VALIDATION=1`.
- **Runtime-verified this phase** against a local `mongod`: `npm run seed` writes
  the demo Lead Directory and is idempotent on re-run (30 leads / 2 campaigns /
  2 views / 1 custom field, no dupes). `/leads` renders the seeded data.
- ApplyNinjaa's DB flows (quotas, trials, admin, Gmail) remain
  typecheck/lint/build-verified only; real Stripe/DeepSeek/OAuth/Resend keys were
  never available here. Manual QA: `docs/guides/testing-guide.md` (66 cases).

## Deferred / rough edges

- **Scraper Phase 2 capture extension** — built, but only build/typecheck/lint
  and a schema-contract check verify it here; the DOM harvesting (Google Maps
  cards/detail, generic block detection) is **not exercised in a real browser**
  (no Chrome + live sites in this environment). Selectors are inherently fragile
  — that's what the server selector packs are for.
- **Scraper Phase 3 (enrich/score/offer-lines)** — `enrichment`/`offerLines`
  flags exist but wire nothing yet; schema fields (`emails`, `techStack`,
  `score`, `offerLine`) are seed-only for now.
- No dedupe/merge UI; `merged_into_id` exists but nothing writes it.
- `seed-test.ts` is now real, but there is still **no CI test gate** and no
  ApplyNinjaa test coverage — the vitest suite covers scraper pure logic only.
- Analytics deliberately absent (phase 2); Gmail scan synchronous (≤50 msgs).
