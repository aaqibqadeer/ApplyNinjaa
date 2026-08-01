# ScrapperNinja — Execution Plan (3 phases)

## Context

`ApplyNinjaa` is a fork of the **ninjakit** boilerplate that resolved into a
job-application product. We are building a **new product** on the same
infrastructure: **ScrapperNinja**, a lead-generation scraper.

The workflow: a Chrome extension harvests businesses from directory sites →
records queue offline in IndexedDB → sync to a hosted **Lead Directory**
dashboard → server-side AI passes dedupe, normalize, label, enrich and score
them → a prompt generates a personalized cold-email opening line per row →
filter, review, export CSV.

The old job-application surface is switched off, not deleted. Everything the
boilerplate already provides (auth, orgs, plans/Stripe, admin, extension Bearer
auth, the AI adapter with DeepSeek, AI quota enforcement) is reused as-is.

> **Branch:** the user asked for `ScrapperNinja` cut from `staging`. Note the
> environment's designated branch is `claude/lead-gen-scraper-app-du5mf7`; the
> user's explicit instruction takes precedence. Confirm before the first push if
> the pipeline requires the designated name.

---

## Locked decisions

| # | Decision |
|---|---|
| 1 | Old product **flag-gated off**, code kept (`features.jobApplications`, default OFF) |
| 2 | Marketing landing page **rewritten in Phase 1** |
| 3 | Scale target **≤100k leads/org** → offset pagination + Mongo indexes, **in-process** job runner (no Redis) |
| 4 | Lead table gets **full power in Phase 1**: column show/hide + reorder, per-column filters, sort, pagination, bulk actions, inline edit, CSV export, **saved views**, **user-defined custom columns** |
| 5 | Capture has a **Fast / Deep toggle** in the popup |
| 6 | DeepSeek rescue fires **on the backend at sync time** |
| 7 | **Server-pushed selector packs** — selectors live in the DB, extension fetches them per run |
| 8 | Dedupe **never auto-merges** — everything goes to a review queue |
| 9 | Enrichment = crawl + tech stack; **PageSpeed optional** behind an optional `PAGESPEED_API_KEY` |
| 10 | Score is **AI-judged** (with stored reasoning), not rule-based |
| 11 | **Vitest** added in Phase 1 + `scripts/seed-test.ts` implemented for real |
| 12 | **Named adapters + a generic AI extractor** for the long tail of directories |
| 13 | Phase 2 ships **Google Maps (deep)**, the **generic AI extractor**, and **manual single-page capture**. Not Yelp. |
| 14 | Tier C (SoS registries) deferred — **CSV import** covers it in Phase 1 |
| 15 | Tier D (LinkedIn/IG/FB) — `automationTier` **enforced in code**, manual capture only |
| 16 | **Two review surfaces**: parse issues inline in the main table (status filter); duplicates get their own page |
| 17 | Workflow **stops at export** (`new`, `needs_review`, `ready`, `exported`, `junk`, `archived`) — no CRM statuses |
| 18 | **DeepSeek for every AI task**, routing kept in one config file so tasks can be re-pointed later |
| 19 | **CSV only**, server-streamed, visible columns × filtered rows |
| 20 | Leads are **org-scoped** (a team shares one directory); lead↔campaign is **many-to-many** |

---

## Infrastructure being reused (do not rebuild)

| Need | Where |
|---|---|
| Feature flags (env-resolved by presence) | `config/features.ts` |
| Env validation + `TEST_MODE` boot guard | `config/env.schema.ts` |
| DB adapter interface + Mongo impl + lazy Proxy | `lib/db/adapter.ts`, `lib/db/mongodb/adapter.ts`, `lib/db/index.ts` |
| All Zod domain models (`xSchema`/`newXSchema`/`updateXSchema`) | `lib/db/schema.ts` |
| **Extension Bearer auth** (cookie → token, auto-refresh on 401) | `extension/src/lib/api.ts`, `app/api/auth/extension-token/route.ts`, `lib/auth/bearer.ts` |
| **DeepSeek provider** (already first-class) | `config/features.ts` `AI_PROVIDERS`, `lib/ai/index.ts`, `lib/ai/models.ts` |
| Zod-validated AI task pattern | `lib/ai/tasks.ts` |
| **AI quota + rate limits** (402 + upgrade payload) | `lib/usage/{enforce,ai-usage,rate-limit}.ts` |
| Org/role/super-admin guards | `lib/auth/roles.ts` (`authorizeApi`, `authErrorResponse`) |
| Offset-pagination precedent | `components/admin/AdminUsersTable.tsx`, `ListUsersParams` |
| Rich-table precedent (sort/filter/select/bulk/inline-edit/CSV) | `components/dashboard/ApplicationsTable.tsx` |
| Shared UI | `components/shared/{DataTable,ConfirmDialog,EmptyState,UpgradeNotice,AppHeader}.tsx` |
| MV3 build (Vite, manifest templating, icon auto-detect) | `extension/vite.config.ts`, `extension/manifest.template.json` |

**Gaps to build:** no table library, no `Pagination`, no drag-reorder (use native
HTML5 DnD — no new dep), no content script, no job runner, no test framework.
Package manager is **npm**, not pnpm.

---

## Data model (10 new collections, introduced per phase)

**Phase 1:** `leads`, `campaigns`, `lead_sources`, `saved_views`, `lead_custom_fields`
**Phase 2:** `capture_sessions`, `source_packs`
**Phase 3:** `batch_jobs`, `offer_prompts`, `duplicate_candidates`

Every one is org-scoped (`organizationId`) per CLAUDE.md §1.3, and every one
ships Zod schema + adapter methods + seed entry in the same commit (§1.4).

---
---

# PHASE 1 — Foundation & Lead Directory

> Hand this block to the implementing agent verbatim.

```
You are working in /home/user/ApplyNinjaa, a Next.js 15 App Router + React 19 +
TypeScript + Tailwind v4 + shadcn/ui + Mongoose codebase. Read CLAUDE.md first
and follow it exactly — especially §1 (config-driven), §3 (logic in /lib, routes
are thin), §4 (strict TS, no `any`, Zod at every boundary, no raw process.env),
§9 (reusable components go in /components/shared AND get a same-commit entry in
docs/architecture/components.md), §10 (no hardcoded colors/px — theme tokens
only), §11 (update the knowledge base before you finish).

Package manager is npm (not pnpm — CLAUDE.md is stale on this).
`npm run lint` and `npm run typecheck` must pass before you call the phase done.

## Goal
Turn this job-application app into ScrapperNinja, a lead-generation scraper, and
build the Lead Directory dashboard — the table where every scraped business
lands. No browser extension in this phase; manual entry + CSV import make it
fully exercisable on its own.

## 0. Branch
git fetch origin staging && git checkout -b ScrapperNinja origin/staging

## 1. Switch off the old product (do not delete any code)
- config/features.ts: add `jobApplications: boolean` resolved from
  NEXT_PUBLIC_FEATURE_JOB_APPLICATIONS (absent = OFF, which is the default).
  Add a `scraper` group: { enabled, enrichment, offerLines, genericExtractor }
  from NEXT_PUBLIC_FEATURE_SCRAPER{,_ENRICHMENT,_OFFER_LINES,_GENERIC_EXTRACTOR}.
- Every page under app/profiles, app/onboarding, app/settings/gmail,
  app/settings/filters, and the applications view in app/dashboard: early
  `if (!features.jobApplications) notFound()`.
- Every API route under app/api/{profiles,applications,gmail,filters} and
  app/api/ai/{parse-resume,analyze-job,map-fields}: return 404 when the flag is
  off, before any other work.
- components/shared/AppHeader.tsx currently hardcodes /dashboard, /profiles,
  /settings/filters with no flag guard — gate those links on
  features.jobApplications and add the new scraper links.
- Do NOT delete files, do NOT remove deps (mammoth, pdf-parse stay).
- Document the flag in docs/architecture/feature-flags.md.

## 2. Rebrand
- config/brand.ts → APP_NAME "ScrapperNinja", new APP_DESCRIPTION/APP_TAGLINE
  for lead generation.
- Rewrite components/marketing/{Hero,HowItWorks,Testimonials}.tsx and the
  pricing copy for lead-gen positioning (find local businesses, capture them
  from any directory, enrich and score them, export cold-email-ready CSVs).
  Keep the existing component structure and theme tokens — copy change only.
- Update app/layout.tsx metadata, app/privacy, app/terms, app/cookie-policy
  copy where it references resumes/Gmail/job applications.
- Routing: /leads is the Lead Directory and the post-login landing page.
  app/dashboard/page.tsx redirects to /leads when jobApplications is off.

## 3. Plan limits (keep Stripe wiring untouched)
In scripts/seed.ts swap the `limits` keys on the 4 plans:
  aiCallsPerMonth (keep), leadLimit, campaignLimit, enrichment (bool),
  offerLines (bool), dataExport (keep). Drop profileLimit/gmailScan/customFilters.
Update lib/payments/access.ts PLAN_FEATURES accordingly. The seed already only
backfills missing keys — preserve that behaviour.

## 4. Schema — 5 new collections
Add to lib/db/schema.ts (follow the existing xSchema/newXSchema/updateXSchema
triple + exported value-set constants):

LEAD_STATUSES = ["new","needs_review","ready","exported","junk","archived"]
LEAD_SOURCE_TYPES = ["google_maps","generic_web","manual","csv"]
AUTOMATION_TIERS = ["a","b","c","d"]
WEBSITE_STATUSES = ["has","none","bad","unknown"]
BUSINESS_SIZES = ["solo","small","medium","large","unknown"]

leads (org-scoped) — one row per business:
  identity: organizationId, campaignIds[], sourceType, sourceUrl, capturedAt,
            capturedByUserId, clientCaptureId (nullable, extension idempotency)
  captured: businessName, category, categories[], phone, phoneE164, website,
            websiteDomain, address{raw,street,city,state,postalCode,country},
            lat, lng, rating, reviewCount, priceLevel, hours, plusCode
  enriched: ownerName, emails[], socials{facebook,instagram,linkedin,x,youtube,tiktok},
            techStack[], pageSpeed{mobile,desktop}, businessSize,
            industrySubType, websiteStatus, enrichmentStatus, enrichedAt
  generated: offerLine, offerLineEditedAt, offerLinePromptId, score,
             scoreReasoning
  workflow: status, notes, customFields (open Record<string, unknown>),
            parseIssues[], rawSnippet, dedupeKeys[], mergedIntoId,
            exportedAt, createdAt, updatedAt, deletedAt
  Indexes: (organization_id, created_at -1), (organization_id, status),
           (organization_id, phone_e164), (organization_id, website_domain),
           (organization_id, campaign_ids), (organization_id, score -1),
           unique sparse (organization_id, client_capture_id),
           text index on business_name.

campaigns: organizationId, name, description, query, location, sourceType,
  status ("active"|"archived"), leadCount, createdByUserId, timestamps.

lead_sources (provenance; many per lead): organizationId, leadId, sourceType,
  sourceUrl, campaignId, capturedAt, rawPayload. Index (organization_id, lead_id).

saved_views: organizationId, userId, name, columns[] (ordered visible keys),
  filters (JSON), sort{key,dir}, pageSize, isDefault. Unique (user_id, name).

lead_custom_fields: organizationId, key (slug), label,
  type ("text"|"number"|"date"|"select"|"boolean"), options[], sortOrder.
  Unique (organization_id, key). Values live in leads.customFields[key].

For each: Mongoose model in lib/db/mongodb/adapter.ts (snake_case columns,
camelCase mappers, matching the existing toUser/toOrganization pattern),
adapter methods on DatabaseAdapter, and a seed entry. Three things, one commit.

Adapter methods to add (tenant-scoped, orgId first):
  listLeads(orgId, params) -> {leads, total}   // params below
  countLeads(orgId, filter)
  getLeadById(orgId, id) / createLead / updateLead / deleteLead
  bulkUpdateLeads(orgId, ids, patch) -> count
  bulkDeleteLeads(orgId, ids) -> count
  upsertLeadByClientCaptureId(orgId, clientCaptureId, data) -> {lead, created}
  streamLeads(orgId, filter, sort)   // async iterator for export
  createLeadSource / listLeadSourcesForLead
  campaigns: create/get/list/update/delete + incrementCampaignLeadCount
  savedViews: create/list/update/delete
  customFields: create/list/update/delete

## 5. Query layer — the piece to get right
lib/leads/query.ts — a PURE function, no Mongoose imports:
  buildLeadQuery(orgId, params) -> { filter, sort, skip, limit }
Params (Zod-parsed in the route from the query string):
  page, pageSize (25|50|100|250), sort=<columnKey>, dir=asc|desc,
  q=<global search across businessName/phone/website/notes>,
  f.<col>=<text>              -> case-insensitive contains
  f.<col>.min / f.<col>.max   -> numeric and date ranges
  f.<col>.in=a,b,c            -> enum membership
  campaignId, status, sourceType, includeJunk (default false)
Rules: single-column sort only. ESCAPE regex metacharacters in every text
filter (`[.*+?^${}()|[\]\\]`). Unknown column keys are rejected, not ignored —
customFields.<key> is the only dynamic path allowed, and only for keys that
exist in lead_custom_fields. Soft-deleted and junk rows excluded by default.

lib/leads/columns.ts — the single catalog: for each column key its label, type,
sortable, filterable, editable, exportable, and default visibility. The table
UI, the filter controls, the column picker and the CSV export all read from
this one file so they cannot drift.

lib/leads/csv.ts — export row serializer. Quote-escape properly AND neutralize
CSV injection by prefixing any cell starting with = + - @ with a single quote.

## 6. API routes (thin — all logic in lib/leads/service.ts)
  GET|POST   /api/leads
  GET|PATCH|DELETE /api/leads/[id]
  POST       /api/leads/bulk        (set-status | delete | add-campaign |
                                     remove-campaign | mark-junk)
  GET        /api/leads/export      (streaming CSV via ReadableStream, respects
                                     every filter, honours the visible-column
                                     list, NOT capped by pageSize)
  POST       /api/leads/import      (CSV upload + column mapping -> leads)
  GET|POST   /api/campaigns ; GET|PATCH|DELETE /api/campaigns/[id]
  GET|POST   /api/views ; PATCH|DELETE /api/views/[id]
  GET|POST   /api/custom-fields ; PATCH|DELETE /api/custom-fields/[id]
Every route: authorizeApi() first, then Zod-validate input, then call lib/.
Reuse authErrorResponse from lib/auth/roles.ts for error shaping.

## 7. UI
New shared components (each needs a docs/architecture/components.md row in the
same commit):
  components/shared/Pagination.tsx      page size select, prev/next, "1-25 of 412"
  components/shared/SortableHeader.tsx  click to toggle asc/desc, arrow indicator
  components/shared/ColumnFilter.tsx    polymorphic by column type (text /
                                        number range / date range / enum multi)
  components/shared/ColumnPicker.tsx    show/hide + reorder via native HTML5
                                        drag events — do NOT add a DnD library
  components/shared/BulkActionBar.tsx   appears on selection; supports
                                        "select all N matching this filter"
  components/shared/InlineEditCell.tsx  edit on click, PATCH on blur, optimistic
  components/shared/DetailDrawer.tsx    side panel built on the existing Radix
                                        dialog primitive (there is no Sheet)
  components/shared/SavedViewsMenu.tsx  save / load / set default / delete
  components/shared/CsvImportDialog.tsx file pick -> header preview -> map
                                        columns -> import summary

Feature components:
  components/leads/LeadsTable.tsx       the composition of the above
  components/leads/LeadDetailDrawer.tsx all fields + provenance + source URL +
                                        capture timestamp
  components/leads/CampaignPicker.tsx   select-or-create
  components/leads/CustomFieldManager.tsx

Pages: app/leads/page.tsx, app/leads/campaigns/page.tsx,
       app/leads/settings/page.tsx (custom fields).
All flag-gated on features.scraper.enabled with a graceful "not enabled" state,
never a thrown error (CLAUDE.md §2).

Default visible columns: businessName, phone, website, category, city,
ownerName, offerLine, status. Everything else available via the picker.
Editable inline: businessName, phone, website, ownerName, offerLine, status,
notes, and any customFields. score/scoreReasoning are read-only (AI-set in
Phase 3).

## 8. Testing
- Add vitest + a vitest.config.ts with the `@/` path alias. Add "test" and
  "test:watch" to package.json scripts.
- Tests (pure logic only, no DB): lib/leads/query.test.ts (filter building,
  regex escaping, rejection of unknown columns), lib/leads/csv.test.ts
  (quoting + injection prefixing), lib/leads/columns.test.ts (catalog integrity).
- Implement scripts/seed-test.ts for real (it is a 7-line stub today): assert
  TEST_MODE is on, drop the app collections, then run the same seed routine.
  Add "seed:test" to package.json. CLAUDE.md §12 requires this.

## 9. Seed
scripts/seed.ts gains ~30 realistic demo leads across 2 campaigns, spanning the
interesting states: some with no website, some with garbled parse output and
status needs_review, some enriched, some junk. Idempotent like the rest of the
file.

## 10. Docs (required, same commit)
- docs/architecture/components.md — every new shared component
- docs/architecture/feature-flags.md — the new flags
- docs/architecture/data-layer.md — the 5 new collections
- docs/guides/scraper-setup.md — new file, env vars + how to run
- docs/knowledge-base/current-state.md — overwrite with the new snapshot
- docs/knowledge-base/decisions.md — a terse dated entry for the 20 locked
  decisions in this plan

## Definition of done
`npm run lint`, `npm run typecheck`, `npm test` all pass. `npm run seed` then
`npm run dev` → sign in → /leads shows 30 demo leads. You can hide/show and
reorder columns, filter each column independently, sort any column, page
through, select rows and bulk-change status, edit a cell inline, save a view
and reload it, import a CSV, and export a filtered CSV. The old ApplyNinja
routes 404 and their nav links are gone.

Suggest the conventional-commit command(s) and stop. Do not start Phase 2.
```

---
---

# PHASE 2 — Capture Extension

```
You are working in /home/user/ApplyNinjaa on branch ScrapperNinja. Phase 1 is
complete: the Lead Directory at /leads, the leads/campaigns/lead_sources
schema, and the /api/leads routes all exist. Read CLAUDE.md and
docs/knowledge-base/current-state.md first.

## Goal
Build the Chrome MV3 capture extension: harvest businesses from directory sites,
queue offline in IndexedDB, sync to the dashboard, and repair bad parses with
DeepSeek on the server.

## What already exists in extension/
- Vite build with two entries (React popup + ES-module service worker) and a
  plugin that emits manifest.json from manifest.template.json, substituting
  __API_ORIGIN__. Reuse it.
- extension/src/lib/api.ts — Bearer auth that exchanges the dashboard session
  cookie for a token at POST /api/auth/extension-token and retries once on 401.
  Reuse it unchanged.
- extension/src/background.ts and popup/App.tsx are ApplyNinja's fill-a-field
  feature. Replace their contents.

## 1. Source adapter architecture
extension/src/scrapers/types.ts:
  type AutomationTier = "a" | "b" | "c" | "d";
  interface SourceAdapter {
    id: string;
    match(url: string): boolean;
    automationTier: AutomationTier;
    supportsDeep: boolean;
    harvestList(ctx): Promise<RawRecord[]>;      // scroll + collect
    harvestDetail?(ctx, ref): Promise<Partial<RawRecord>>;  // open one card
  }
extension/src/scrapers/registry.ts — resolve(url) -> adapter, falling back to
the generic adapter.

Three adapters this phase:
  google-maps/  tier a, supportsDeep. Selectors in selectors.ts as the BUNDLED
                FALLBACK, overridden at runtime by the server pack (§3).
                Fast mode: scroll the results feed, harvest each card
                (name, category, rating, reviewCount, address snippet, href).
                Deep mode: then open each result, read the detail panel for
                phone / website / hours / plus code / full address, and go back.
  generic/      tier b. No selectors. Heuristically finds the repeated result
                block (largest set of sibling elements with similar structure),
                strips each to clean text, and sends the batch to the server for
                AI extraction (POST /api/scrape/extract). This is what makes
                Yellow Pages, BBB, Manta, Hotfrog, chamber directories, Avvo,
                Angi etc. work with no new code.
  manual/       tier d. No automation at all. One "Capture this page" click ->
                one record, extracted from the visible page.

TIER ENFORCEMENT IS A HARD RULE: if the resolved adapter's automationTier is
"d", the extension must refuse to auto-scroll or auto-click. Only manual capture
is reachable, and the popup shows a visible ban-risk warning. Enforce this in
the service worker, not just the UI.

## 2. Content script (build gotcha — read carefully)
MV3 content scripts CANNOT be ES modules, but the existing vite config sets
rollup output format "es" globally for the popup and service worker. Rollup
cannot mix formats in one build. So:
  - keep the current build for popup + background (format "es")
  - add extension/vite.content.config.ts producing content.js as IIFE with
    emptyOutDir: false
  - chain them: "build": "vite build && vite build --config vite.content.config.ts"

Injection strategy — avoid requesting <all_urls>, which scares users at install:
  - declare a static content_script only for https://www.google.com/maps/*
  - for generic and manual capture, inject on demand with
    chrome.scripting.executeScript({ target, files: ["content.js"] }) using the
    activeTab permission granted by the popup click.

manifest.template.json: permissions ["activeTab","scripting","storage","alarms"],
host_permissions ["__API_ORIGIN__/*", "https://www.google.com/*"].

## 3. Server-pushed selector packs
New collection source_packs (org-scoped? NO — platform-level, like plans):
  sourceId, version, automationTier, selectors (JSON), notes, isActive, updatedAt.
  GET /api/scrape/selectors (Bearer) returns the active packs; the extension
  fetches on each capture start and caches in chrome.storage.local with the
  version. Bundled selectors are the fallback when the fetch fails.
  Admin CRUD at /admin/source-packs + /api/admin/source-packs, guarded by
  requireSuperAdmin (NOT requireRole("admin") — CLAUDE.md §14).
  Seed the Google Maps pack in scripts/seed.ts.
This is what lets you fix a Google DOM change without shipping a new build.

## 4. Offline queue + sync
extension/src/lib/queue.ts — hand-rolled IndexedDB (no new dependency).
  Store "captureQueue", keyed by clientId (crypto.randomUUID()).
  Record: { clientId, campaignId, sessionId, payload, attempts, state, createdAt }
extension/src/lib/sync.ts — drain in batches of 50 to POST /api/leads/ingest.
  Exponential backoff on failure; a chrome.alarms tick every 5 minutes retries
  while the queue is non-empty, so capture works fully offline.
Idempotency: clientId is sent as clientCaptureId and the server upserts on the
unique sparse (organization_id, client_capture_id) index from Phase 1. Retries
can never double-insert.

## 5. Popup (rewrite extension/src/popup/App.tsx)
  - sign-in state (reuse SignInRequiredError from lib/api.ts)
  - campaign picker: select existing or create — required before Start
  - Fast / Deep toggle (Deep disabled when the adapter can't do it)
  - Start / Stop capture
  - live counters: "47 captured · 3 needs review · 12 queued to sync"
  - pacing setting: slow / normal / fast (randomized 800-2000ms at normal)
  - per-run cap, default 200, with a "keep going" button when hit
  - tier warning banner on tier-d sites
Badge: chrome.action.setBadgeText with the live captured count.

## 6. Server side
- POST /api/leads/ingest (Bearer): Zod-validate the batch, upsert by
  clientCaptureId, write a lead_sources provenance row per record, bump
  campaign.leadCount. Records arriving with a non-empty parseIssues[] get
  status "needs_review" and keep their rawSnippet.
- POST /api/scrape/extract (Bearer): the generic adapter's AI extraction —
  cleaned text blocks in, structured records out, DeepSeek via lib/ai, Zod
  validated.
- lib/scrape/rescue.ts + POST /api/leads/rescue: the second-layer repair.
  Sends only flagged records' rawSnippet to DeepSeek ("extract name, phone,
  address, website as JSON"), Zod-validates, patches the lead, clears
  parseIssues and moves status to "new" on success. The ingest route calls this
  for up to 25 flagged records inline; the rest are picked up by the /leads
  "Rescue N records" button. Phase 3's job runner will absorb this as a batch
  type.
- New collection capture_sessions: campaignId, sourceType, sourceUrl, mode,
  startedAt, endedAt, capturedCount, needsReviewCount, status, extensionVersion.
  POST /api/capture-sessions, PATCH /api/capture-sessions/[id].
- Every AI call goes through enforceAiQuota + enforceAiRateLimits from
  lib/usage/enforce.ts. Never call an AI provider from a route directly.
- Model routing lives in one file (lib/ai/routing.ts): every task points at
  deepseek today, changeable without touching call sites.

## 7. Dashboard additions
- /leads gains a "needs review" status filter chip with a count, and a
  "Rescue N records" action.
- /leads/sessions — capture session history (when, where, how many, mode).
- The detail drawer shows source URL + captured-at + every lead_sources row.

## 8. Docs + tests
- docs/architecture/scraping.md (new): SourceAdapter contract, the four tiers,
  selector-pack flow, the IIFE content-script build gotcha.
- docs/guides/scraper-setup.md: how to build and load the extension unpacked.
- Update components.md, current-state.md, decisions.md.
- Vitest: lib/scrape/rescue.test.ts (Zod validation of AI output, partial
  patches) and the generic adapter's block-detection heuristic.

## Definition of done
npm run lint / typecheck / test pass. npm run build:extension produces a dist/
that loads unpacked in Chrome. Signing in to the dashboard then opening the
popup on a Google Maps search lets you pick a campaign, run a Deep capture, see
the badge count climb, and find the businesses at /leads with phone and website
populated and correct source URLs. Killing the network mid-capture keeps
harvesting into IndexedDB and syncs when it returns. A tier-d site offers only
manual capture.

Suggest the commit command(s) and stop.
```

---
---

# PHASE 3 — AI Passes, Enrichment & Offer Lines

```
You are working in /home/user/ApplyNinjaa on branch ScrapperNinja. Phases 1 and
2 are complete: the Lead Directory, the capture extension, ingest + rescue.
Read CLAUDE.md and docs/knowledge-base/current-state.md first.

## Goal
Everything that turns raw captured rows into a cold-email-ready list: a batch
job runner, dedupe review, normalization, auto-labeling, website enrichment,
AI scoring, and generated offer lines.

## 1. Batch job runner (in-process — no Redis, no worker process)
New collection batch_jobs: organizationId, type, status, targetFilter (a
serialized lead query) or leadIds[], total, processed, succeeded, failed,
error, params (JSON), createdByUserId, startedAt, finishedAt.
  types: rescue | normalize | dedupe | label | enrich | score | offer
  statuses: queued | running | done | failed | canceled

lib/jobs/runner.ts:
  - POST /api/jobs creates the row, then kicks off processing with `after()`
    from next/server so the request returns immediately.
  - Process in chunks of 25, updating counters after each chunk and re-reading
    the status so cancel takes effect mid-run.
  - A job left "running" with no progress for >10 minutes shows as stale in the
    UI with a Resume button (an in-process runner does not survive a server
    restart — state this plainly in the UI, don't pretend otherwise).
  - GET /api/jobs, GET /api/jobs/[id] (polled every 2s), POST /api/jobs/[id]/cancel
  - Every AI-backed job runs through enforceAiQuota (lib/usage/enforce.ts) and
    surfaces the 402 upgrade payload as a real message, not a silent failure.
  - Before starting, the UI shows an estimated AI-call count and the user's
    remaining monthly quota.

UI: components/jobs/JobProgress.tsx (shared), a jobs drawer reachable from
/leads, and a "Run AI pass" action in the bulk action bar.

## 2. Normalization (job type: normalize)
- Phone -> E.164. Add the `libphonenumber-js` dependency (this is the one place
  hand-rolling is a mistake). Store phoneE164, keep the original in phone.
- Address -> {street, city, state, postalCode, country} via DeepSeek, Zod
  validated, with the raw string preserved.
- Website -> canonical origin + websiteDomain (strip www, lowercase, drop
  tracking params). Reject obvious non-sites (facebook.com/..., yelp.com/...)
  into socials instead.
Pure functions in lib/leads/normalize.ts with Vitest coverage; only the address
step touches AI.

## 3. Dedupe — review only, never auto-merge
lib/leads/dedupe.ts:
  dedupeKeys(lead) -> ["phone:<e164>", "domain:<domain>", "name:<slug>|zip:<postal>"]
  stored on the lead and indexed.
Job type `dedupe` scans the org's leads, groups by shared key, and writes
duplicate_candidates rows: organizationId, leadAId, leadBId, matchedOn[],
confidence, status ("pending"|"merged"|"dismissed").
NOTHING merges automatically — that was an explicit decision.

/leads/duplicates page: side-by-side comparison, field-by-field pick which value
survives, then Merge or Keep both.
lib/leads/merge.ts mergeLeads(primaryId, duplicateId, fieldChoices):
  - primary keeps the chosen values
  - all lead_sources rows repoint to the primary (this is why provenance is a
    separate collection — a merged lead still shows it came from Maps AND Yelp)
  - campaignIds union
  - loser gets mergedIntoId + deletedAt (soft), never a hard delete

## 4. Enrichment (job type: enrich, flag: features.scraper.enrichment)
lib/enrich/crawl.ts — fetch homepage + /contact + /about. Hard limits: 3 pages,
10s timeout each, 1MB response cap, follow max 2 redirects, respect robots.txt
(lib/enrich/robots.ts), and a descriptive User-Agent. Never crawl in parallel
against the same host.
Extract:
  - emails: mailto: hrefs + regex, deduped, obvious junk filtered
    (noreply@, sentry, wixpress, example.com)
  - socials: facebook/instagram/linkedin/x/youtube/tiktok link hrefs
  - techStack: lib/enrich/tech.ts, a signature map (wp-content -> WordPress,
    /_next/ -> Next.js, Shopify.theme -> Shopify, wix.com -> Wix, squarespace,
    GTM/GA/Meta Pixel, jQuery, Cloudflare headers, ...). Pure + unit tested.
  - on-page signals: HTTPS, viewport meta present, newest copyright year
  - ownerName: best-effort from about/contact text via DeepSeek; often blank,
    and blank is a correct answer — do not invent one.
  - pageSpeed: OPTIONAL. Google PageSpeed Insights via a new OPTIONAL env var
    PAGESPEED_API_KEY. Add it to .env.example and config/env.schema.ts as
    optional — an absent key must leave the pageSpeed fields blank and must NOT
    fail env validation or the job.

websiteStatus is RULE-derived, not AI: "none" if no website; "bad" if any of
(no HTTPS | no viewport meta | PSI mobile < 50 | newest copyright year > 3 years
old); else "has". Store which signals fired so the UI can explain it.

## 5. Labeling (job type: label)
DeepSeek assigns businessSize (solo/small/medium/large/unknown) and
industrySubType from the captured + enriched fields. Zod-validated enum output,
"unknown" on low confidence.

## 6. Scoring (job type: score) — AI-judged
lib/leads/score.ts: DeepSeek returns { score: 0-100, reasoning: string },
Zod-validated, written to score + scoreReasoning. The scoring rubric lives in
app_settings so it is editable without a deploy (CLAUDE.md §8 — no hardcoded
configurable values). The table's score column shows the number with the
reasoning on hover and in the detail drawer, so "sort by score" is explainable.

## 7. Offer lines (job type: offer, flag: features.scraper.offerLines)
New collection offer_prompts: organizationId, name, promptText, isDefault,
provider, model, createdByUserId.
Placeholders resolved by lib/leads/render-prompt.ts:
  {{businessName}} {{category}} {{city}} {{state}} {{website}} {{websiteStatus}}
  {{rating}} {{reviewCount}} {{businessSize}} {{industrySubType}} {{ownerName}}
  {{techStack}}
Unknown placeholders are a validation error at save time, not a silent blank.

/leads/prompts — prompt CRUD with a live preview against a real lead.
Run dialog: pick a prompt, pick target rows (selection or current filter),
choose "1 line" or "3 variants to pick from", and a "skip rows I've hand-edited"
toggle (offerLineEditedAt is non-null). Results are inline-editable in the
table; editing sets offerLineEditedAt.

Seed 2 starter prompts in scripts/seed.ts.

## 8. Wiring it together
- Bulk action bar gains "Run AI pass" -> job type picker -> estimate -> confirm.
- /leads gains chips: needs review, possible duplicates, not enriched, no offer
  line — each one just a preset filter, reusing the Phase 1 query layer.
- Model routing stays in lib/ai/routing.ts; all seven tasks point at deepseek.

## 9. Docs + tests
- docs/architecture/scraping.md: the job pipeline and its order of operations
  (rescue -> normalize -> dedupe review -> enrich -> label -> score -> offer).
- docs/guides/scraper-setup.md: PAGESPEED_API_KEY, DeepSeek setup, quotas.
- components.md, current-state.md, decisions.md.
- Vitest: normalize.test.ts, dedupe.test.ts (key generation + grouping),
  tech.test.ts (signature detection), render-prompt.test.ts (placeholder
  validation), merge.test.ts (field-choice resolution).

## Definition of done
npm run lint / typecheck / test pass. From a seeded + captured directory you can:
run normalize and see phones become E.164; run dedupe and resolve a real
duplicate pair from /leads/duplicates with provenance from both sources
surviving on the merged row; run enrich and get emails, socials and tech stack
with websiteStatus correctly explaining itself; run score and sort by it with
visible reasoning; write a prompt and batch-generate offer lines, edit one
inline, re-run with skip-edited on and watch it stay untouched; export the
filtered CSV.

Suggest the commit command(s) and stop.
```

---

## Verification (end to end, after Phase 3)

1. `npm run seed && npm run dev` → sign in → `/leads` shows demo leads.
2. `npm run build:extension`, load `extension/dist` unpacked in Chrome.
3. Run a Google Maps search, popup → pick a campaign → Deep capture → badge
   climbs → leads appear at `/leads` with phone/website and correct source URLs.
4. Kill the network mid-capture; harvesting continues into IndexedDB and syncs
   on reconnect. Nothing duplicates.
5. Capture the same businesses from a second directory via the generic adapter
   → run dedupe → resolve the pair at `/leads/duplicates` → merged row keeps
   both provenance entries.
6. Run enrich → score → offer, export the filtered CSV, open it.
7. `npm test` green; `TEST_MODE=1 npm run seed:test` refuses to run against a
   non-test database.

## Known risks

- **Google Maps DOM churn** — mitigated by server-pushed selector packs plus AI
  rescue, but expect to edit a pack occasionally.
- **In-process job runner** loses `running` jobs on server restart. Accepted
  (decision #3); the stale-job Resume button covers it.
- **Generic AI extractor cost** scales with pages captured, not records. The
  existing per-plan `aiCallsPerMonth` cap is the backstop.
- **Phase 1 is the largest phase** (schema + ~12 routes + the full table +
  landing rewrite + test setup). It is written with internal commit points so it
  can land incrementally.
