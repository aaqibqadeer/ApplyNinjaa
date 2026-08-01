# Current State

> **Read this first, every session** (CLAUDE.md §11). Living **snapshot** —
> overwritten, not appended. Keep it terse. Update at the end of every phase.

_Last updated: 2026-08-01 — **ScrapperNinja Phase 1 (foundation) complete** on
`cursor/scrapperninja-phase1-ba86`: product-identity registry (P0), Lead
Directory at `/leads`, and a vitest unit suite. Typecheck + lint + `npm test`
pass; seed + `/leads` runtime-verified against local Mongo._

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

- **Scraper Phase 2 (capture)** — the Chrome extension → `leads` ingest and the
  generic extractor (`genericExtractor` flag) are not built.
- **Scraper Phase 3 (enrich/score/offer-lines)** — `enrichment`/`offerLines`
  flags exist but wire nothing yet; schema fields (`emails`, `techStack`,
  `score`, `offerLine`) are seed-only for now.
- No dedupe/merge UI; `merged_into_id` exists but nothing writes it.
- `seed-test.ts` is now real, but there is still **no CI test gate** and no
  ApplyNinjaa test coverage — the vitest suite covers scraper pure logic only.
- Analytics deliberately absent (phase 2); Gmail scan synchronous (≤50 msgs).
