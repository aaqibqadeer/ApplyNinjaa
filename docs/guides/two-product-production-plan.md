# Two-Product Production Plan — ApplyNinjaa + ScrapperNinja

How both products get built, released and deployed from this one repository,
with extension updates published from CI instead of hand-uploaded.

Supersedes nothing — it sits on top of `docs/guides/production-roadmap.md`
(Railway + Atlas, CI, extension release), which stays the reference for
per-environment detail. This document covers what changes now that there are
**two** products, **two** web apps and **two** extensions.

---

## Context

`docs/guides/production-roadmap.md` was written for one product. The repo now
carries two:

- **ApplyNinjaa** — job-application SaaS (v1.1, feature-complete, never run
  against a live database)
- **ScrapperNinja** — lead-generation scraper (planned in
  `docs/prompts/scrapperninja-execution-plan.md`, not yet built)

Both are sold as SaaS. Both need a web app and a Chrome extension in
production. Neither is live today, so this is a greenfield launch for both
rather than a migration.

---

## Two corrections to the ScrapperNinja execution plan

The earlier plan assumed ScrapperNinja replaced ApplyNinjaa. It doesn't. Two
parts of it are now wrong and must be amended before Phase 2 is handed to an
agent:

1. **Phase 2 said to replace `extension/src/background.ts` and
   `popup/App.tsx`.** Both extensions ship, so nothing is replaced. The
   extension folder becomes multi-product (§P1 below), with ApplyNinjaa's
   existing capture/fill code moved intact into its own product folder.

2. **Phase 1 said to rewrite the marketing components for lead-gen.** Both
   products need a landing page. `Hero`, `HowItWorks`, `Testimonials` and the
   pricing copy become **product-aware**, selecting their copy from
   `config/products.ts` rather than being rewritten in place.

Amend those two sections when handing Phase 1 and Phase 2 over.

---

## Locked decisions

| # | Decision |
|---|---|
| A | Both products are **sold SaaS** — full production treatment for each |
| B | **One repo, two long-lived release branches** |
| C | **Separate Atlas databases** — no shared users, no shared data |
| D | ApplyNinjaa **public** on the Chrome Web Store; ScrapperNinja **unlisted** |
| E | **6 Railway services**: 2 production + 2 staging + 2 hard-delete crons |
| F | **One Stripe account**, two Product/Price sets, two webhook endpoints |
| G | **Two separate root domains** (names TBD — placeholders until §P3.3) |
| H | Observability (Sentry, uptime, backup rehearsal) **deferred by decision** |

### Placeholders used throughout

| Placeholder | Meaning |
|---|---|
| `APPLY_DOMAIN` | ApplyNinjaa's root domain, e.g. `applyninjaa.com` |
| `SCRAP_DOMAIN` | ScrapperNinja's root domain |

Fill these in at §P3.3. Only OAuth redirect URIs and the extension's
compiled-in backend origin actually block on them.

---

## Branch topology

Two release branches give independent release timing. To stop that becoming
permanent merge pain, **product identity is env-driven, not branch-diverged** —
the branches should differ only in which product's *features* have landed, not
in configuration.

```
staging                        shared base: boilerplate, auth, db, theme, CI
│                              (no Railway service — integration only)
├── apply-next        ───────► apply-staging      Railway
│   └── master        ───────► apply-prod         Railway  + apply-cron
│
└── scrapper-next     ───────► scrapper-staging   Railway
    └── scrapper-master ─────► scrapper-prod      Railway  + scrapper-cron
```

Rules:

- A change to **shared** code (`lib/auth`, `lib/db`, `lib/payments`,
  `config/theme.ts`, `components/shared`, CI) is a PR into `staging`, then
  `staging` is merged into **both** `*-next` branches.
- A change to **one product** is a PR into that product's `*-next` branch only.
- A **release** is a merge from `*-next` into that product's prod branch.
  Railway deploys on push, gated by "Wait for CI".
- Never commit directly to `master` or `scrapper-master`.

The existing `ScrapperNinja` branch becomes the ancestor of `scrapper-next`.

> Merge conflicts are the tax on this topology. Keep them cheap by never
> hardcoding product-specific values in shared files — that is what
> `config/products.ts` (§P0) is for.

---
---

# P0 — Product registry

> Agent-ready. Land on `staging`.

```
You are working in /home/user/ApplyNinjaa. Read CLAUDE.md first, especially §8
(no hardcoded configurable values) and §10 (theme tokens only). Package manager
is npm. `npm run lint` and `npm run typecheck` must pass.

## Goal
Make product identity a runtime/env concern so the two release branches don't
diverge on configuration.

## 1. config/products.ts (new)
Export a typed registry keyed by product id:

  export const PRODUCT_IDS = ["applyninja", "scrapperninja"] as const;
  export type ProductId = (typeof PRODUCT_IDS)[number];

  interface ProductDefinition {
    id: ProductId;
    name: string;              // "ApplyNinjaa" | "ScrapperNinja"
    description: string;
    tagline: string;
    supportEmail: string;
    marketing: {
      hero: { headline: string; sub: string; cta: string };
      howItWorks: { title: string; body: string }[];
      testimonials: { quote: string; who: string }[];
    };
  }

  export const PRODUCTS: Record<ProductId, ProductDefinition>
  export const activeProduct: ProductDefinition

`activeProduct` resolves from env.NEXT_PUBLIC_PRODUCT. Unknown or absent value
must throw at boot with a clear message naming the valid ids — a silent wrong
default would ship the wrong brand to customers.

## 2. config/env.schema.ts
Add NEXT_PUBLIC_PRODUCT as a required z.enum(PRODUCT_IDS). It has no
flag-conditional rule — it is always required.

## 3. config/brand.ts
Replace the hardcoded APP_NAME/APP_DESCRIPTION/APP_TAGLINE constants with
re-exports derived from activeProduct, keeping the existing export names so no
call site changes.

## 4. Product-aware marketing
components/marketing/{Hero,HowItWorks,Testimonials}.tsx and the pricing section
read their copy from activeProduct.marketing instead of literals. Keep the
component structure and theme tokens exactly as they are — this is a data
change, not a redesign. Write real ScrapperNinja copy (find local businesses,
capture from any directory, enrich and score, export cold-email-ready CSVs);
move the existing job-seeker copy into the applyninja entry verbatim.

## 5. Legal + metadata
app/layout.tsx metadata, app/privacy, app/terms, app/cookie-policy and
app/robots.ts / app/sitemap.ts must all read the product name from brand.ts
rather than a literal. Where privacy/terms differ materially between products
(ApplyNinjaa handles resumes and Gmail; ScrapperNinja handles scraped business
data), branch on activeProduct.id inside the page and keep both texts.

## 6. .env.example
Add NEXT_PUBLIC_PRODUCT with both valid values documented, at the top of the
file — it is now the first variable anyone sets.

## 7. Docs
- docs/architecture/feature-flags.md: a short section explaining the split —
  NEXT_PUBLIC_PRODUCT controls IDENTITY (name, copy, legal), the
  NEXT_PUBLIC_FEATURE_* flags control CAPABILITY. They are independent on
  purpose: a staging service can run ScrapperNinja's identity with enrichment
  off.
- docs/knowledge-base/decisions.md: dated entry for the two-branch topology.

## Definition of done
npm run lint / typecheck pass. Building with NEXT_PUBLIC_PRODUCT=applyninja
gives today's site unchanged; NEXT_PUBLIC_PRODUCT=scrapperninja gives
ScrapperNinja branding and copy. Omitting it fails the build with a readable
error.

Suggest the commit command and stop.
```

---
---

# P1 — Multi-product extension build

> Agent-ready. Land on `staging`. **This is the change that makes both
> extensions shippable.**

```
You are working in /home/user/ApplyNinjaa. Read CLAUDE.md and
docs/architecture/scraping.md (if it exists yet). Package manager is npm.

## Goal
Restructure extension/ so it builds TWO independent MV3 extensions from shared
code — without breaking the existing ApplyNinjaa extension, which must keep
working exactly as it does today.

## 1. Target layout
extension/
  shared/
    api.ts            <- MOVED from src/lib/api.ts, unchanged logic
    types.ts          <- MOVED from src/lib/types.ts
    popup.css         <- shared token mirror from globals.css
  products/
    applyninja/
      manifest.template.json   <- MOVED from extension/manifest.template.json
      popup.html               <- MOVED from extension/popup.html
      src/background.ts        <- MOVED from src/background.ts
      src/popup/{App.tsx,main.tsx}
      src/lib/{dom-actions.ts,quick-fill.ts}
    scrapperninja/
      manifest.template.json   <- NEW
      popup.html               <- NEW
      src/background.ts        <- NEW (stub this phase; Phase 2 of the
                                  ScrapperNinja plan fills it in)
      src/popup/{App.tsx,main.tsx}   <- NEW (stub)
  vite.config.ts        <- product-parameterised
  vite.content.config.ts<- NEW, scrapperninja only, IIFE output
  package.json

Moving ApplyNinjaa's files is a pure `git mv` plus import-path fixes. Do NOT
rewrite its behaviour in this phase — it is a working extension and this is a
refactor. Verify by diffing the built bundle before and after if unsure.

## 2. Product-parameterised build
vite.config.ts reads process.env.PRODUCT (applyninja | scrapperninja) and:
  - resolves the popup entry to products/<product>/popup.html
  - resolves the background entry to products/<product>/src/background.ts
  - emits manifest.json from products/<product>/manifest.template.json,
    keeping the existing __API_ORIGIN__ substitution and the icon
    auto-detection plugin exactly as they work now
  - outputs to dist/<product>/ so both can exist side by side
  - reads icons from products/<product>/icons/

Unknown or missing PRODUCT must fail the build with a readable error listing
the valid values. A default would silently ship the wrong extension.

## 3. The content-script format problem (ScrapperNinja only)
MV3 content scripts CANNOT be ES modules, but the popup and service worker are
built with rollup output format "es", and rollup cannot mix formats in one
build. So ScrapperNinja needs a second pass:
  - vite.content.config.ts: single entry products/scrapperninja/src/content.ts,
    output format "iife", emptyOutDir FALSE, same dist/scrapperninja/ folder
  - the scrapperninja build script chains both passes
ApplyNinjaa has no content script and needs no second pass.

## 4. package.json scripts (root)
  "build:extension:apply":    "PRODUCT=applyninja npm --prefix extension run build"
  "build:extension:scrapper": "PRODUCT=scrapperninja npm --prefix extension run build"
  "build:extension":          runs both
Use cross-env-free syntax that works on the Ubuntu CI runner; if Windows
support matters, add cross-env as a devDependency rather than inlining shell.

## 5. Manifests
Each product's manifest.template.json carries its own name, description,
version and permissions. They are NOT the same:
  applyninja:    activeTab, scripting, contextMenus, storage
                 host_permissions: ["__API_ORIGIN__/*"]
  scrapperninja: activeTab, scripting, storage, alarms
                 host_permissions: ["__API_ORIGIN__/*", "https://www.google.com/*"]
                 content_scripts: matches https://www.google.com/maps/*, content.js
Versions are independent — the two extensions are released on their own
cadence and their version numbers will drift apart immediately.

## 6. Docs
- docs/architecture/components.md: note the extension restructure.
- docs/guides/scraper-setup.md and the extension README: the new build commands
  and where each product's dist lands.
- Record the IIFE content-script constraint in
  docs/architecture/scraping.md — it is non-obvious and will otherwise be
  rediscovered painfully.

## Definition of done
npm run build:extension produces dist/applyninja/ and dist/scrapperninja/, each
with a correct manifest.json and substituted API origin. Loading
dist/applyninja/ unpacked in Chrome gives the SAME behaviour as before this
refactor. npm run lint / typecheck pass.

Suggest the commit command and stop.
```

---
---

# P2 — CI and automated releases

> Agent-ready. Land on `staging`. **This is the "stop hand-uploading
> extensions" deliverable.**

```
You are working in /home/user/ApplyNinjaa. Read .github/workflows/ci.yml and
.github/workflows/extension-release.yml first — both exist and work; this phase
extends them for two products.

## 1. .github/workflows/ci.yml
- Trigger on pull_request and on push to: staging, apply-next, master,
  scrapper-next, scrapper-master.
- Matrix the build over product: [applyninja, scrapperninja], setting
  NEXT_PUBLIC_PRODUCT and SKIP_ENV_VALIDATION=1 so both product builds are
  proven on every PR. Keep NEXT_PUBLIC_APP_URL=https://example.com as today.
- Build BOTH extensions (npm run build:extension).
- Add `npm test` once Phase 1 of the ScrapperNinja plan has introduced Vitest.
  Until then, leave it out rather than adding a step that fails on a missing
  script.
- Keep the existing comment explaining why format:check is not a gate.

## 2. .github/workflows/extension-release.yml — two products, one workflow
Replace the single `ext-v*` trigger with two prefixes:
  ext-apply-v*   -> applyninja
  ext-scrap-v*   -> scrapperninja

Steps:
  a. Derive PRODUCT and VERSION from GITHUB_REF_NAME by prefix. An unmatched
     tag must fail loudly, not silently pick a default.
  b. Keep the existing version-match guard, pointed at
     extension/products/$PRODUCT/manifest.template.json. The Web Store rejects
     a re-used version, so this guard is what stops a wasted release.
  c. Build with PRODUCT set and VITE_API_ORIGIN from the per-product repo
     variable (below).
  d. Zip dist/$PRODUCT.
  e. Upload + publish with chrome-webstore-upload-cli, using the per-product
     extension id.
  f. Upload the zip as a build artifact (keep — it is your rollback copy).

Secrets and variables:
  Secrets (repo-level):
    CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN   <- SHARED. One OAuth
      client on the Chrome Web Store developer account can publish every item
      that account owns, so these are not per-product.
    CWS_APPLY_EXTENSION_ID
    CWS_SCRAP_EXTENSION_ID
  Variables (repo-level):
    APPLY_PRODUCTION_APP_URL     https://APPLY_DOMAIN
    SCRAPPER_PRODUCTION_APP_URL  https://SCRAP_DOMAIN

  Delete the now-ambiguous CWS_EXTENSION_ID and PRODUCTION_APP_URL after
  migrating.

Note in a comment: "unlisted" is a LISTING VISIBILITY setting in the Developer
Dashboard, not a manifest or API field. The publish call is identical for a
public and an unlisted item — set ScrapperNinja's visibility once by hand and
CI does not need to know about it.

## 3. A release helper (optional but worth it)
scripts/release-extension.mjs: takes a product and a semver bump, edits that
product's manifest.template.json version, commits, tags with the right prefix,
and prints the push command. This is the step most likely to be got wrong by
hand, because the tag and the manifest must agree exactly.

## 4. Docs
Rewrite docs/guides/production-roadmap.md §4 for two extensions, and add a
"Releasing" section to this file's runbook covering both.

## Definition of done
A PR shows CI building both products and both extensions. Pushing a tag
ext-scrap-v0.1.0 whose manifest says 0.1.0 runs the workflow through to the
publish step. (It will fail at publish until the CWS ids exist — that is
expected and is §P5.)

Suggest the commit command and stop.
```

---
---

# P3 — Infrastructure provisioning

> **Human checklist.** Dashboards and credentials — an agent cannot do these.

### P3.1 MongoDB Atlas

Two clusters, one per product, so a bad migration or a restore on one cannot
touch the other.

| Cluster | Databases |
|---|---|
| `applyninjaa` | `apply_prod`, `apply_staging` |
| `scrapperninja` | `scrap_prod`, `scrap_staging` |

- Separate database users per database, least privilege (`readWrite` on that
  database only).
- Network access: Railway egress IPs, or `0.0.0.0/0` with strong credentials if
  Railway's egress isn't static on your plan — note which you chose and why.
- `TEST_DB_PATTERN` must match your staging database names so the `TEST_MODE`
  boot guard in `config/env.schema.ts` can actually protect you. With names
  like `apply_staging` the default pattern `test` will NOT match — either name
  the databases `*_test` or set `TEST_DB_PATTERN=staging|test`.

> Atlas backups exist on paid tiers and are off by default on free ones.
> Deferred by decision (H) — noted here so it is a choice, not an oversight.

### P3.2 Railway — 6 services

| Service | Branch | Start command |
|---|---|---|
| `apply-prod` | `master` | `npm start` |
| `apply-staging` | `apply-next` | `npm start` |
| `apply-cron` | `master` | `npm run hard-delete` (cron `0 3 * * *`) |
| `scrapper-prod` | `scrapper-master` | `npm start` |
| `scrapper-staging` | `scrapper-next` | `npm start` |
| `scrapper-cron` | `scrapper-master` | `npm run hard-delete` (cron `0 3 * * *`) |

For every service: build command `npm run build`, and **Settings → enable "Wait
for CI"** so a red build never reaches users. That setting is what makes CI a
gate rather than a report.

The cron services exist because `/privacy` promises deleted accounts are purged
within 30 days and nothing runs `hard-delete` automatically. Each product has
its own database, so each needs its own cron.

### P3.3 Domains and DNS

Decide the two root domains now and record them here:

- ApplyNinjaa → `APPLY_DOMAIN` = ______________________
- ScrapperNinja → `SCRAP_DOMAIN` = ______________________

Per domain: add it as a custom domain on the product's prod Railway service
(Railway issues TLS), and give staging a subdomain such as
`staging.APPLY_DOMAIN`.

### P3.4 Email (Resend)

Two sending domains, one per product, each with SPF + DKIM records. The Resend
sandbox sender only delivers to the account owner's own address, so until a
domain is verified every verification email to a real user silently vanishes.

Set `AUTH_EMAIL_FROM` per service to an address on that product's domain.

### P3.5 Environment variables

Set per service in Railway. `NEXT_PUBLIC_*` are **baked in at build time** — a
change requires a redeploy, not a restart.

Shared shape (values differ per service):

```
NEXT_PUBLIC_PRODUCT=applyninja | scrapperninja
NEXT_PUBLIC_APP_URL=https://<that service's domain>
DB_PROVIDER=mongodb
MONGODB_URI=<that service's database>
AUTH_SECRET=<unique per product>
EEO_ENCRYPTION_KEY=<unique per product — UNRECOVERABLE, back it up
                    somewhere that is not only Railway>
DEEPSEEK_API_KEY=...
RESEND_API_KEY=...
AUTH_EMAIL_FROM=...
SUPER_ADMIN_EMAIL=...
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_FEATURE_AI_PROVIDERS=deepseek
```

ApplyNinjaa services add:
```
NEXT_PUBLIC_FEATURE_JOB_APPLICATIONS=1
NEXT_PUBLIC_FEATURE_GMAIL=1          (only once Google verification lands)
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
```

ScrapperNinja services add:
```
NEXT_PUBLIC_FEATURE_SCRAPER=1
NEXT_PUBLIC_FEATURE_SCRAPER_ENRICHMENT=1
NEXT_PUBLIC_FEATURE_SCRAPER_OFFER_LINES=1
NEXT_PUBLIC_FEATURE_SCRAPER_GENERIC_EXTRACTOR=1
PAGESPEED_API_KEY=...                (optional — absent leaves the fields blank)
```

Staging services additionally set `TEST_MODE=true` and a `TEST_DB_PATTERN` that
matches their database name.

**Never set `SKIP_ENV_VALIDATION` at runtime.** It disables the Zod boot guard
that catches a missing secret at startup instead of at 2am. CI sets it because
CI has no secrets and only needs to prove the app compiles.

---
---

# P4 — Stripe

One account, two Product/Price sets, two webhook endpoints.

1. **Activate the account** — business details, bank account, tax info. Test
   keys never charge anyone.
2. **Two webhook endpoints**, one per product:
   `https://APPLY_DOMAIN/api/payments/webhook` and
   `https://SCRAP_DOMAIN/api/payments/webhook`. Each has its own signing
   secret; paste each into that product's `STRIPE_WEBHOOK_SECRET`. The route is
   public and signature-verified, and is already exempt from the login redirect
   in `middleware.ts`.
3. **Seed and sync each product separately.** The databases are separate, so
   each has its own `plans` table:
   ```
   # against apply_prod
   npm run seed && npm run sync:plans
   # against scrap_prod
   npm run seed && npm run sync:plans
   ```
   Test-mode Price IDs are meaningless in live mode — plans must be re-synced
   per environment, never copied.
4. Name the Stripe Products distinctly (`ApplyNinjaa Pro`, `ScrapperNinja Pro`)
   — one dashboard now holds both, and identical names are the fastest way to
   refund the wrong customer.
5. ScrapperNinja's plan limits differ (`leadLimit`, `campaignLimit`,
   `enrichment`, `offerLines`) per the execution plan. Confirm
   `scripts/seed.ts` seeds the right set for the product it is run against.

---
---

# P5 — Chrome Web Store, first submissions

Both extensions need **one manual submission each** before CI can ever publish
them. The item id does not exist until that first upload, and the id is what
the workflow needs.

1. **Register** as a Chrome Web Store developer — one-time $5 fee, once for the
   account, not per extension.
2. Build locally: `npm run build:extension`, then zip `dist/applyninja` and
   `dist/scrapperninja` separately.
3. **Upload ApplyNinjaa by hand.** Listing, screenshots, privacy disclosures,
   visibility **Public**. Submit for review.
4. **Upload ScrapperNinja by hand.** Same, but visibility **Unlisted**.
5. Copy each item id into the repo secrets `CWS_APPLY_EXTENSION_ID` and
   `CWS_SCRAP_EXTENSION_ID`.
6. **Create the publish OAuth credentials** (Google Cloud project → Chrome Web
   Store API → OAuth client → generate a refresh token) and set
   `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`. One set covers
   both items.
7. From then on, every release is `scripts/release-extension.mjs` + a tag push.

### What to expect from review

- **Every update is reviewed**, taking hours to days. The web app and the
  extension therefore cannot be assumed to ship together — **the backend must
  stay compatible with the published extension**, not merely the one in this
  repo. Adding fields is safe; removing or repurposing them is not, until the
  new extension has actually rolled out.
- **ScrapperNinja carries genuine rejection risk.** The Web Store's
  single-purpose and data-use policies are applied strictly to extensions that
  collect data from third-party sites. Unlisted reduces attention but is not an
  exemption. Give the listing a narrow, honest single-purpose description,
  disclose the data collection accurately, and request only the permissions the
  manifest actually needs — `alarms` and one host pattern, not `<all_urls>`.
- **Have a fallback ready.** If review rejects it twice, the self-hosted route
  (signed CRX + `updates.xml` on your own domain, installed via enterprise
  policy) works for you and your own team with no review at all. It does not
  scale to paying customers, so it is a stopgap, not a plan.

---
---

# P6 — Launch sequence

Order matters; several steps have multi-week lead times.

**Start immediately (they block on other people):**

1. **Google OAuth verification for ApplyNinjaa.** `gmail.readonly` is a
   restricted scope. Until verified, the consent screen shows an unverified-app
   warning and is capped at 100 test users. Needs a live privacy policy at the
   production domain, a demo video, verified domain ownership, and possibly a
   paid CASA assessment. **Budget weeks.** ScrapperNinja does not need this
   unless you enable Google login on it.
2. **Stripe account activation.**
3. **Domain registration + Resend domain verification.**
4. **Legal review** — have a human read `/privacy`, `/terms`, `/cookie-policy`
   against what each product actually does. Google will read ApplyNinjaa's.

**Then, in order:**

5. Land P0, P1, P2 on `staging`; merge into both `*-next` branches.
6. Provision Atlas + Railway (P3). Deploy both staging services first.
7. **Run the first live database pass for ApplyNinjaa.** Per
   `current-state.md`, nothing DB-touching has ever executed — all CRUD,
   quotas, trials, admin and Gmail are unexercised. `docs/guides/testing-guide.md`
   is the 66-case manual pass. Do this on staging before production exists.
8. Build ScrapperNinja (Phases 1–3 of
   `docs/prompts/scrapperninja-execution-plan.md`) on `scrapper-next`, with the
   two amendments at the top of this document applied.
9. Stripe live mode + per-product seed and sync (P4).
10. Manual CWS submissions, capture ids, set secrets (P5).
11. Promote: merge `apply-next` → `master`, `scrapper-next` → `scrapper-master`.
12. Post-deploy smoke on each domain: app loads, `/robots.txt` and
    `/sitemap.xml` return absolute production URLs, signup → verify → land on
    the product's home route, a test checkout reaches Stripe and the webhook
    records the subscription, cookie banner persists.

---

## Day-to-day runbook

**Ship a change to one product**
```
git checkout apply-next && git pull
# ...work...
git push                         # CI runs, apply-staging deploys
git checkout master && git merge apply-next && git push
                                 # CI runs, apply-prod deploys
```

**Ship a shared/boilerplate change**
```
git checkout staging && git pull
# ...work...
git push
git checkout apply-next    && git merge staging && git push
git checkout scrapper-next && git merge staging && git push
# then promote each product on its own schedule
```

**Release an extension**
```
node scripts/release-extension.mjs --product scrapperninja --bump patch
git push --follow-tags           # tag ext-scrap-v0.1.1 triggers publish
```

**Roll back the web app** — Railway keeps previous deployments; redeploy the
last good one from the dashboard. Then fix forward on the `*-next` branch;
never commit a revert directly to a prod branch.

**Roll back an extension** — there is no un-publish. Bump the version, rebuild
from the last good commit, and release again. The previous zip is on the
GitHub Actions run as an artifact, which is why P2 keeps it.

---

## Deferred by decision

Not oversights — chosen, and cheap to add later:

- **Error monitoring, uptime checks, backup rehearsal** (decision H). Until
  these exist, a 500 in production is invisible unless a user reports it, and
  an Atlas backup you have never restored is a guess rather than a plan.
- **Analytics** — deliberately absent since v1.
- **`npm run format:check` as a CI gate** — the repo has never been fully
  Prettier-clean, so adding it makes CI red on arrival. To adopt: run
  `npm run format` once, commit that alone, then add the step.

## Known risks

- **`EEO_ENCRYPTION_KEY` is unrecoverable.** Lose it and every encrypted EEO
  answer and stored Gmail refresh token is permanently unreadable. Two products
  means two keys to back up outside Railway.
- **Two long-lived branches accumulate merge debt.** The mitigation is P0 —
  keep product differences in env and `config/products.ts`, never in diverged
  shared files. Audit the `staging`→`*-next` diff periodically; if it is
  growing, something product-specific has leaked into shared code.
- **Backend/extension version skew.** Web deploys are minutes, extension
  releases are days. Treat the published extension's API contract as frozen
  until its replacement has rolled out.
- **ScrapperNinja Web Store rejection** — see P5.
- **`docs/guides/deployment.md` is stale**: it says Vercel and pnpm, while the
  roadmap says Railway and the repo uses npm. Fix or delete it as part of P2's
  docs step so nobody follows it into a wrong setup.
