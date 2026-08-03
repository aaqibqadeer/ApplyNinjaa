# ScrapperNinja Setup (Phase 1)

Bring the **ScrapperNinja** surface up locally: the shared **Lead Directory** at
`/leads`, seeded with demo data. New here? Read
`docs/knowledge-base/current-state.md` first (what's built, which flags this fork
uses), then this guide. Identity vs capability lives in
`docs/architecture/feature-flags.md`; the collections in
`docs/architecture/data-layer.md`.

Package manager is **npm** in this fork (`package-lock.json`), Node 22.

## 1. Environment (`.env.local`)

Copy `.env.example` to `.env.local` and set the two independent knobs plus Mongo.
Identity (`NEXT_PUBLIC_PRODUCT`) picks the branding; the `NEXT_PUBLIC_FEATURE_*`
flags pick the capabilities — they are deliberately separate (§P0).

```env
# Identity — always required, no silent default.
NEXT_PUBLIC_PRODUCT=scrapperninja

# Capability — turn the scraper surface on, leave job applications off.
NEXT_PUBLIC_FEATURE_SCRAPER=1
# NEXT_PUBLIC_FEATURE_JOB_APPLICATIONS=1        # ApplyNinjaa's surface — off here
# Phase 2/3 sub-flags (leave off for Phase 1):
# NEXT_PUBLIC_FEATURE_SCRAPER_GENERIC_EXTRACTOR=1
# NEXT_PUBLIC_FEATURE_SCRAPER_ENRICHMENT=1        # unlocks the "enrich" AI pass
# NEXT_PUBLIC_FEATURE_SCRAPER_OFFER_LINES=1       # unlocks the "offer" pass + /leads/prompts
# PAGESPEED_API_KEY=<google-pagespeed-key>        # enrichment website-health lookups (Phase 3)

# Auth (email + password is enough for local sign-in) and the seed super admin.
NEXT_PUBLIC_FEATURE_AUTH_EMAIL_PASSWORD=1
AUTH_SECRET=<openssl rand -base64 32>
SUPER_ADMIN_EMAIL=admin@example.com

# Database — MongoDB only in this fork.
DB_PROVIDER=mongodb
MONGODB_URI=mongodb://localhost:27017/scrapperninja
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`config/env.schema.ts` validates env **by flag** at boot: enabling Google,
Stripe, DeepSeek, or Gmail makes their secrets boot-required. For a minimal
scraper run keep those flags off (or use placeholder keys) — see `.env.example`
and `AGENTS.md` for the full standard set.

## 2. Start MongoDB

The scraper needs Mongo on `localhost:27017`. `docker-compose.yml` ships a
`mongo:7` service (`docker compose up -d`); where Docker is unavailable, run a
native `mongod` against the same URI. Confirm it is up:

```bash
mongosh --quiet --eval 'db.runCommand({ ping: 1 })'   # -> { ok: 1 }
```

## 3. Seed

```bash
npm run seed
```

Seeds the users, plans, super admin — and, because `scraper` is on, the demo
**Lead Directory**: ~30 leads across 2 campaigns for the admin org, plus 2 saved
views and one `priority` custom field. It is **idempotent**: demo leads are keyed
on a `seed-demo-` `clientCaptureId` prefix, so re-running skips them (re-run
safely after schema changes). Seeded logins: `admin@example.com` /
`user@example.com`, password `Password123!`.

The demo leads deliberately span the workflow so the table is worth looking at:
businesses with no website, `needs_review` rows carrying `parseIssues`, enriched
rows (owner/emails/tech stack), `junk`, and `ready` rows with an `offerLine`;
across `google_maps` / `manual` / `csv` source types and varied
categories/cities.

## 4. Run

```bash
npm run dev            # http://localhost:3000
```

Sign in with `admin@example.com` / `Password123!`, then open **`/leads`**. Filter,
sort, show/hide columns, save a view, edit a lead inline or in the detail drawer,
manage campaigns, and export a filtered CSV. Email verification has no provider
locally — verification/reset links are printed to the dev-server console
(`lib/email/send.ts`).

## 5. Tests

Pure logic (query building, CSV serialization, the column catalog) has a `vitest`
suite:

```bash
npm test               # vitest run   (npm run test:watch to watch)
npm run seed:test      # wipe + reseed the isolated test DB (needs .env.test)
```

`seed:test` loads `.env.test`, asserts the `TEST_MODE` / `TEST_DB_PATTERN`
guardrail (§12), drops the test DB's app collections, then reruns the standard
seed — never touching dev or prod data.

## 6. Extension build (P1 multi-product)

`extension/` builds two independent MV3 extensions from shared code. Build the
ScrapperNinja capture extension and load it unpacked:

```bash
npm run build:extension:scrapper   # -> extension/dist/scrapperninja/
npm run build:extension:apply      # -> extension/dist/applyninja/  (ApplyNinjaa)
npm run build:extension            # both
```

`PRODUCT` (`applyninja` | `scrapperninja`) selects the product; a missing/unknown
value fails the build. `VITE_API_ORIGIN` (default `http://localhost:3000`) is
compiled into the manifest and API client. Contract and the IIFE content-script
constraint: `docs/architecture/scraping.md`; the extension README covers loading.

Load and use the ScrapperNinja capture extension:

```
npm run build:extension:scrapper
# chrome://extensions → Developer mode → Load unpacked:
#   extension/dist/scrapperninja
# Sign in to the dashboard first, then open the popup on Google Maps.
```

The popup gates on sign-in (it needs a Bearer token from the web app), so signing
in to the dashboard **before** opening the popup is required. Then browse to
Google Maps results and Start a capture; runs stream into `/leads` and each run
appears under `/leads/sessions`.

## 7. Admin: selector packs

Selector packs are **platform-level** (no `organization_id`, like plans) and are
edited by a super admin at **`/admin/source-packs`** — list packs, edit the
selectors JSON, toggle `isActive`, add notes, and bump the version. The extension
fetches active packs at capture start and caches them by version, so a Google DOM
change is fixed by editing a pack here, not shipping a new build. The nav tab
shows only when `features.scraper.enabled` and the viewer is a super admin.

## 8. Phase 3 UI — AI passes, duplicates, prompts

The Phase 3 **dashboard UI** is built (the `/api/jobs*`, `/api/prompts*`, and
`/api/duplicates*` routes land separately — until then every surface below shows
a friendly empty state / toast, never a broken page):

- **Run AI pass** — select leads in `/leads` → **Run AI pass** in the bulk bar.
  Pick a pass (`normalize`, `dedupe`, `label`, `enrich`, `score`, `offer`,
  `rescue`); the dialog shows an estimated AI-call count and confirms into
  `POST /api/jobs`. `enrich` needs `…_SCRAPER_ENRICHMENT`; `offer` needs
  `…_SCRAPER_OFFER_LINES` (disabled otherwise). AI passes consume the DeepSeek
  quota, so a real `DEEPSEEK_API_KEY` is required to actually run them.
- **Jobs drawer** — the **Jobs** toolbar button lists recent jobs; active ones
  render a live `JobProgress` (processed/total, Cancel, Resume if stalled),
  self-polling `GET /api/jobs/:id` every 2s.
- **Preset chips** — `/leads` gains **possible duplicates** (links to
  `/leads/duplicates` with a pending-count badge), **not enriched**
  (`enrichment_status != done`), and **no offer line** (empty `offer_line`).
- **Duplicates** — `/leads/duplicates` reviews candidate pairs side-by-side; pick
  the surviving value per field, then **Merge** or **Keep both**.
- **Offer prompts** — `/leads/prompts` CRUDs offer-line templates with a live
  preview against a recent lead (`POST /api/prompts/preview`). Editing a lead's
  offer line inline stamps `offerLineEditedAt`, so the offer pass's
  **skip-edited** toggle won't overwrite hand-written copy.

`PAGESPEED_API_KEY` (Google PageSpeed Insights) powers the enrichment pass's
website-health signal; leave it unset to skip that signal.

## Later phases

Phase 1 is the **foundation**: schema, Lead Directory UI, query/CSV layer, API
routes, and demo seed.

- **Phase 2 — capture (built).** The Chrome MV3 extension (built above) captures
  from Google Maps (fast/deep) and generic directories into `leads` (idempotent
  on `clientCaptureId`), queuing offline in IndexedDB and syncing to
  `/api/leads/ingest`. The generic extractor is
  `NEXT_PUBLIC_FEATURE_SCRAPER_GENERIC_EXTRACTOR`. Adapter/queue/sync details:
  `docs/architecture/scraping.md`.

Still to come behind its own flag:
- **Phase 3 — enrich & personalize.** The **UI** ships now (§8: AI-pass jobs,
  duplicate review, offer prompts). The server passes — email/tech-stack crawl,
  scoring, per-lead offer lines, dedupe detection — land behind
  `NEXT_PUBLIC_FEATURE_SCRAPER_ENRICHMENT` / `_OFFER_LINES` (AI provider +
  optional `PAGESPEED_API_KEY` required then).
