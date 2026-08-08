# Current State

> **Read this first, every session** (CLAUDE.md §11). Living **snapshot** —
> overwritten, not appended. Keep it terse. Update at the end of every phase.

_Last updated: 2026-08-08 — **Phase 3 complete** (left sidebar, résumé-parse
loaders, super-admin plan assignment, exclusions, richer application tracker,
profile documents, extension sign in/out + manual field fill). Not yet run
against a live database._

## What this fork is

**ApplyNinjaa** — SaaS for job seekers (web dashboard + platform admin +
Chrome MV3 extension in `/extension`): parses resumes into profiles, screens
job postings against "Valid Job" filters (Yes/No/Neutral via AI), scores fit
0-100, autofills applications, tracks them, and optionally scans Gmail.
Positioning: visa-constrained job seekers (F-1 OPT/STEM OPT, H1-B, TN,
H4-EAD). v1 shipped on `staging`; v1.1 work is on
`claude/nextjs-boilerplate-analysis-mt71w3`.

## Resolved choices

- **DB: MongoDB only** — Supabase db/auth adapters deleted (§1.5).
  `multiTenant` off: org ≡ user via silent default org; the org stays the
  billing entity so all Stripe plumbing is reused unchanged.
- **AI: DeepSeek** via `lib/ai/deepseek/adapter.ts` (OpenAI-compatible;
  `AI_PROVIDERS` now anthropic|openai|deepseek). All product AI tasks live in
  `lib/ai/tasks.ts` (parse resume, map fields, analyze job = filters+fit in
  ONE call, classify emails); routes wrap them with quota + rate limits.
- **Auth**: template custom-JWT auth + LinkedIn OAuth (OIDC) + email
  verification (send-on-signup; OAuth/magic-link verify implicitly). Bearer
  path for the extension: `POST /api/auth/extension-token` (cookie→30d JWT,
  purpose `extension`), `authorizeApi()` accepts Bearer-or-cookie; middleware
  passes Bearer API traffic through.
- **Trial**: local no-card 7-day Pro trial at email verification, one per
  verified email (`users.trial_used_at`); a `trialing` subscription row with
  no Stripe ids, `currentPeriodEnd` = trial end; lazy expiry to Free in
  `getEffectivePlan()` (lib/payments/access.ts). Legacy Stripe card-trial
  neutralized (`checkout.ts` sends `trialEnd:null`); `app_settings.trialDays`
  (default 7) is the trial length knob.
- **Caps/limits**: `lib/usage/` (Mongo-only, deliberately outside the DB
  adapter) — atomic monthly counters, hard 402 block w/ upgrade payload at
  `limits.aiCallsPerMonth`, per-user + per-IP fixed-window rate limits,
  one-time limit-reached email at exactly cap.
- **Plans**: Free/Starter/Pro/Premium seeded with stable **slugs** +
  `limits.aiCallsPerMonth` (5/50/150/300); `getPlanBySlug`; Stripe ids minted
  by `npm run sync:plans` (or admin save). Prices: 0 / 399 / 699 / 999 ¢mo,
  annual 3830/6710/9590 (~20% off, flag-gated).
- **Admin**: `/admin` is PLATFORM-staff only (`users.is_super_admin` |
  `users.is_support_admin`; org-admin no longer enters — every user org-admins
  their own silent org). Support tier: view users + refunds only. All admin
  mutations audited in `admin_actions` (reason required for refunds/suspend/
  ban/delete/cancel).
- **Extension** (`/extension`, Vite + React, own package.json): NO content
  script — DOM work ships as closure-free funcs via
  `chrome.scripting.executeScript` (activeTab+scripting+contextMenus+storage;
  host permission = backend origin only). Popup: analyze (session-cached per
  URL), autofill w/ manual-review list, Track (always "Applied"), profile
  picker (per-domain memory server-side). Build: `npm run build:extension`
  (VITE_API_ORIGIN). Popup tokens hand-mirrored from globals.css.
- **Gmail**: separate read-only consent (`/api/gmail/*`), encrypted refresh
  token (`gmail_tokens`), manual scans capped at 50 msgs = 1 AI action,
  per-proposal user approval before any tracker write.
- **Encryption**: `lib/crypto/field-encryption.ts` AES-256-GCM
  (`EEO_ENCRYPTION_KEY`, per-user AAD) — EEO profile fields (consent-gated,
  encrypted/decrypted ONLY in `lib/profiles/service.ts`) + Gmail tokens.
- **Compliance**: routed `/privacy` (Google Limited Use language), `/terms`
  (user-initiated-actions clause), `/cookie-policy`; cookie banner on;
  30-day soft delete (self-serve + admin) → `npm run hard-delete` purges PII;
  marketing emails opt-out via settings + tokenized one-click unsubscribe.
- **Theme**: violet oklch palette (primary hue 300) in `config/theme.ts` +
  `globals.css` (both, hand-mirrored) + extension popup css; dark mode toggle
  - pre-hydration script. Values verified in-gamut and AA-contrast — oklch can
    express colours sRGB can't, and browsers clip them silently.
- **Entitlements**: `plans.limits` carries `profileLimit`, `customFilters`,
  `gmailScan`, `dataExport` alongside `aiCallsPerMonth`. Booleans →
  `requireFeature()` (402 `FEATURE_LOCKED`); numerics → typed readers in
  `lib/usage/enforce.ts` (never `hasAccess`). Gate creation only, never delete
  on downgrade. Matrix + rationale in `docs/architecture/data-layer.md`.
- **Free trial grants Starter** (not Pro): `startTrialIfEligible`,
  `TRIAL_PLAN_SLUG` in `lib/payments/trials.ts`.
- **Extension**: opening the popup costs ZERO AI calls. Six actions; only
  Check Fit Score and AI Fill bill. Quick Fill matches offline in the popup
  (`extension/src/lib/quick-fill.ts`) so it survives the cap. Re-track appends
  to `applications.additionalLinks`, primary `url` unchanged, and then lists
  every link the application points at. Sign out clears the stored token only
  (the dashboard cookie is a separate session). Context menu is nested:
  AI fill (1 action) or Fill manually → profile → field (free); the tree is
  prebuilt from `/api/profiles/fill-data` and mirrored in
  `chrome.storage.session` (MV3 kills idle workers).
- **Exclusions** (`exclusion_rules`): per-user company + keyword blocklists,
  matched deterministically in `lib/exclusions/service.ts` and mirrored offline
  in the popup, so a warning costs no AI action. Gated by the `customFilters`
  entitlement. Popup shows one banner; filter verdicts collapsed to a tally.
- **Application tracker**: `analyzeJob` also returns `jobDetails` (location,
  arrangement, employment type, seniority, salary text, sponsorship, posted
  date, required skills) in the same billable call; rows expand into
  `ApplicationDetails` showing reasoning, verdicts, exclusion hits, every
  attached URL and timestamps. CSV export carries all of it.
- **Storage is ON**, `STORAGE_PROVIDER=mongodb` — new GridFS provider behind
  the existing `StorageAdapter` (no object-store credentials needed; S3 still
  selectable). Profiles hold a CV + cover letter; Quick/AI Fill attach them to
  a form's file inputs via `attachFiles` (base64 → `DataTransfer` in the page).
- **Super admin can assign any plan** to any org including their own
  (`lib/payments/admin-plan.ts`) — local grant, never a Stripe write, audited
  as `plan_assign` with a required reason.
- **Layout**: signed-in nav is a left sidebar (`AppShell` + `AppSidebar`);
  pages run full width, forms keep a reading column.
- **Hosting**: Railway + MongoDB Atlas. CI in `.github/workflows/ci.yml`; no
  CD workflow by design (Railway's GitHub integration + "Wait for CI").
  Roadmap: `docs/guides/production-roadmap.md`.

## Verification status

- `npm run typecheck`, `npm run lint`, and `next build` all pass (the latter
  with `SKIP_ENV_VALIDATION=1`); `npm run build:extension` produces
  `extension/dist` with a correctly substituted `manifest.json`.
- **Runtime-verified:** resume text extraction (PDF via pdf-parse v2 + DOCX
  via mammoth return clean text; unsupported types raise
  `UnsupportedResumeError`).
- **First live run (2026-07-28) surfaced three bugs, now fixed** — see the
  dated entry in `decisions.md`: PDF upload crashed (pdfjs bundling), creating
  a second profile crashed (client-reference proxy spread), and editing a
  profile silently wiped `projects`. Everything else below still stands.
- **v1.1 and Phase 3 features are typecheck/lint/build-verified only.** No
  entitlement gate, seed backfill, Quick Fill match, Re-track, exclusion match,
  document upload/attach, plan assignment or manual-fill menu has run against a
  live database or a real page. Re-run `npm run seed` before testing — new plan
  limit keys and the example exclusions only reach an existing database that
  way.
- **Never runtime-verified against a live MongoDB** — no Docker/mongod in the
  build sandbox (proxy blocks mongo binary downloads). First run needs:
  `.env.local` (see .env.example), `docker compose up -d`, `npm run seed`,
  smoke: signup → verify (console link) → onboarding → extension → admin.
  Everything touching the DB (all CRUD, quotas, trials, admin, Gmail) is
  therefore unexercised — treat the first live run as the real test pass.
- Stripe/DeepSeek/Google/LinkedIn/Resend flows need real keys (names in
  .env.example) — none were available here, so no AI/payment/email call has
  ever actually executed.
- **`docs/guides/testing-guide.md`** is the manual QA pass for all of the
  above: non-technical setup (incl. how to obtain every key) + 66 numbered
  test cases. Point the first live tester at it; there is no automated suite.

## Deferred / rough edges

- `seed-test.ts` still a stub; no test framework (template debt).
- Trial re-grant on delete-and-re-signup (new user row) — accepted for v1.
- Extension tokens are stateless 30d — no revocation list (add
  `users.tokenVersion` if needed).
- Gmail scan is synchronous in the route (fine ≤50 msgs; chunk if raised).
- Analytics (PostHog/GA) deliberately absent — phase 2.
- Out of scope for v1 (spec): job scraping/notifier, resume builder, teams,
  job caching, non-Chrome browsers, multi-currency.
