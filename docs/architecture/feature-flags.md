# Feature Flags

**Living source of truth for every flag in the template.** See CLAUDE.md §1, §7.
Every future phase that adds a flag MUST update this table in the same commit.

Every optional feature is gated by a flag resolved in `config/features.ts` from
an environment variable. App code checks `features.*`; it never reads
`process.env` directly and never hardcodes an optional feature as always-on. A
feature whose flag is off degrades to "not rendered / not routable" — never a
broken page.

## Identity vs capability

Two independent knobs (two-product production plan §P0):

| Knob | Env | Controls |
| ---- | --- | -------- |
| **Identity** | `NEXT_PUBLIC_PRODUCT` (`applyninja` \| `scrapperninja`) | Name, tagline, marketing copy, product-specific legal text via `config/products.ts` → `config/brand.ts` |
| **Capability** | `NEXT_PUBLIC_FEATURE_*` | Which features are on (auth methods, payments, scraper, job applications, …) via `config/features.ts` |

They are independent on purpose: a staging service can run ScrapperNinja's
identity with enrichment off. `NEXT_PUBLIC_PRODUCT` is **always required** (no
flag-conditional rule, no silent default).

## How resolution works

- **Toggle vars** use the `NEXT_PUBLIC_FEATURE_` prefix and are resolved with
  `!!process.env.X` (presence = on). Any non-empty value enables the flag —
  including `"0"`/`"false"` — so **disable by omitting the var**, not by setting
  it to false. NEXT_PUBLIC prefix lets the registry resolve identically on
  server and client.
- **Secret vars** (API keys, client secrets) are server-only and **required only
  when their flag is on**. `config/env.schema.ts` validates them at boot and
  throws a message listing exactly which required var is missing and why.

## Flag reference

| Flag (`features.*`)      | Toggle env var                                | Controls                                                                                                                                         | Required secrets when on                                                                                                                     |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.emailPassword`     | `NEXT_PUBLIC_FEATURE_AUTH_EMAIL_PASSWORD`     | Email + password sign-in                                                                                                                         | `AUTH_SECRET`                                                                                                                                |
| `auth.magicLink`         | `NEXT_PUBLIC_FEATURE_AUTH_MAGIC_LINK`         | Passwordless magic-link sign-in                                                                                                                  | `AUTH_SECRET`, `RESEND_API_KEY`                                                                                                              |
| `auth.oauth.google`      | `NEXT_PUBLIC_FEATURE_AUTH_OAUTH_GOOGLE`       | Google OAuth sign-in                                                                                                                             | `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                                                    |
| `auth.oauth.github`      | `NEXT_PUBLIC_FEATURE_AUTH_OAUTH_GITHUB`       | GitHub OAuth sign-in                                                                                                                             | `AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`                                                                                    |
| `auth.oauth.linkedin`    | `NEXT_PUBLIC_FEATURE_AUTH_OAUTH_LINKEDIN`     | LinkedIn OAuth sign-in (OpenID Connect)                                                                                                          | `AUTH_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`                                                                                |
| `payments.enabled`       | `NEXT_PUBLIC_FEATURE_PAYMENTS`                | Stripe billing (checkout, portal, webhook, subscriptions)                                                                                        | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`                                                           |
| `payments.annualBilling` | `NEXT_PUBLIC_FEATURE_PAYMENTS_ANNUAL_BILLING` | Annual pricing cadence — plans expose `priceAnnual` + `annualDiscountPercent`; checkout offers monthly/annual. No schema change to toggle (§15). | _(none — reuses the Stripe secrets above)_                                                                                                   |
| `storage`                | `NEXT_PUBLIC_FEATURE_STORAGE`                 | File storage (S3 presigned URLs)                                                                                                                 | `STORAGE_PROVIDER`; when `=s3` also `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (`AWS_S3_ENDPOINT` optional) |
| `phoneVerification`      | `NEXT_PUBLIC_FEATURE_PHONE_VERIFICATION`      | SMS phone verification (Twilio Verify)                                                                                                           | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`                                                                       |
| `admin`                  | `NEXT_PUBLIC_FEATURE_ADMIN`                   | Admin panel routes/UI                                                                                                                            | _(none)_                                                                                                                                     |
| `cookieBanner`           | `NEXT_PUBLIC_FEATURE_COOKIE_BANNER`           | Cookie-consent banner (accept/reject, choice stored in a cookie)                                                                                 | _(none)_                                                                                                                                     |
| `gmail`                  | `NEXT_PUBLIC_FEATURE_GMAIL`                   | Gmail integration — separate opt-in read-only OAuth + manual inbox scans proposing application-status updates                                    | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (required even if Google login is off)                                                            |
| `aiProviders`            | `NEXT_PUBLIC_FEATURE_AI_PROVIDERS`            | Enabled AI providers (comma-separated: `anthropic`, `openai`, `deepseek`)                                                                        | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` per listed provider                                                              |
| `multiTenant`            | `NEXT_PUBLIC_FEATURE_MULTI_TENANT`            | Org switching/invites UI. Off = one silent default org per user. Schema is always multi-tenant.                                                  | _(none required; email invites reuse `RESEND_API_KEY` if set, else log to console in dev)_                                                   |
| `jobApplications`        | `NEXT_PUBLIC_FEATURE_JOB_APPLICATIONS`        | ApplyNinjaa's job-application surface: profiles, onboarding, applications tracker, job filters, Gmail scans, and the resume/field-map/analyze-job AI tasks. Off = those pages 404, their APIs return 404, and their nav hides. | _(none)_                                                                                                                                     |
| `scraper.enabled`        | `NEXT_PUBLIC_FEATURE_SCRAPER`                 | ScrapperNinja's lead-scraping surface (Leads / Campaigns nav). Master switch for the scraper sub-flags below.                                     | _(none)_                                                                                                                                     |
| `scraper.enrichment`     | `NEXT_PUBLIC_FEATURE_SCRAPER_ENRICHMENT`      | Enrichment pass over scraped leads (Phase 3).                                                                                                    | _(none)_                                                                                                                                     |
| `scraper.offerLines`     | `NEXT_PUBLIC_FEATURE_SCRAPER_OFFER_LINES`     | Per-lead offer-line generation (Phase 3).                                                                                                        | _(none)_                                                                                                                                     |
| `scraper.genericExtractor` | `NEXT_PUBLIC_FEATURE_SCRAPER_GENERIC_EXTRACTOR` | Generic (non-site-specific) extractor (Phase 2).                                                                                             | _(none)_                                                                                                                                     |

Notes:

- `aiProviders` is an **array**, not a boolean — the toggle var is a
  comma-separated allow-list, parsed and filtered against the known providers in
  `config/features.ts`. An empty/absent list means AI is off.
- `AUTH_SECRET` is required whenever **any** auth method is enabled
  (`isAnyAuthEnabled` in `config/features.ts`).
- **Phase 3 (auth core) added no new flags** — it implements the existing
  `auth.*` flags. It did add non-flag env vars: `NEXT_PUBLIC_APP_URL` (base URL
  for OAuth redirects / email links) and `AUTH_EMAIL_FROM` (optional). See
  `docs/guides/auth-setup.md`.
- **Phase 4 (roles & multi-tenant UX) added no new flag** — it wires the existing
  `multiTenant` flag to real UI (org creation, email invites, workspace switcher)
  and adds `requireRole()`/permissions (`config/permissions.ts`). It added one
  non-flag env var, `SUPER_ADMIN_EMAIL` (optional, seed-time). **Super-admin is
  deliberately flag-independent** — it is NOT gated behind `multiTenant` and
  exists identically in single- and multi-tenant deployments (§14). See
  `docs/guides/multi-tenancy.md`.
- **Phase 5 (payments & pricing)** promoted `payments` from a bare boolean to a
  nested object `{ enabled, annualBilling }` (mirroring `auth.oauth.*`) and added
  the `payments.annualBilling` cadence sub-flag. Code that used to read
  `features.payments` now reads `features.payments.enabled`. See
  `docs/guides/payments-setup.md`.
- **Phase 6 (storage / phone / email) added no new flag** — it implements the
  existing `storage` (S3 adapter + `FileUpload`) and `phoneVerification` (Twilio
  Verify + `PhoneVerify`) flags, and added S3 secret rows above (required only
  when `STORAGE_PROVIDER=s3`). Email (`lib/email/send.ts`) is not flag-gated — it
  reuses `RESEND_API_KEY` and falls back to console logging in dev. See
  `docs/guides/storage-phone-email.md`.
- **Phase 7 (admin panel) added no new flag** — it wires the existing `admin`
  flag to the `/admin` route group (404 when off). The panel is entered by an org
  admin **or** a super-admin; org-admin tabs (`users`, `organizations`) use
  `requireRole('admin')`, super-admin tabs (`plans`, `subscriptions`, `settings`)
  use `requireSuperAdmin()` — the two tiers never collapse (§14). `subscriptions`
  additionally requires `payments.enabled`; annual price fields in the plan editor
  show only when `payments.annualBilling` is on.
- **Phase 8 (AI integration) added no new flag** — it implements the existing
  `aiProviders` array flag behind `@/lib/ai` (Anthropic + OpenAI adapters, one
  interface). It added one optional non-flag env var, `AI_DEFAULT_PROVIDER`
  (`anthropic`|`openai`), which picks the default provider when several are
  enabled; unset falls back to the first enabled provider. It unlocks no secret,
  so it has no required-when rule. See `docs/guides/ai-providers.md`.
- **Phase 9 (SEO & legal) added one flag** — `cookieBanner` (flat boolean). It
  gates the `CookieBanner` shared component (accept/reject → first-party
  `ninjakit_cookie_consent` cookie, read client-side). It unlocks no secret, so
  there's no `env.schema.ts` rule. Phase 9 also added SEO plumbing that is NOT
  flag-gated: expanded Metadata API in `app/layout.tsx`, `app/sitemap.ts`, and
  `app/robots.ts` (all reuse `NEXT_PUBLIC_APP_URL`).
- **ScrapperNinja Phase 1 added the product-surface flags** — `jobApplications`
  (flat boolean) and the nested `scraper` group (`enabled`, `enrichment`,
  `offerLines`, `genericExtractor`). `jobApplications` gates ApplyNinjaa's
  existing surface: the `profiles`/`onboarding`/`settings/filters`/`settings/gmail`
  pages `notFound()` when off, `/dashboard` redirects to `/leads` (or `notFound()`
  when `scraper.enabled` is also off), and every route under
  `api/{profiles,applications,filters,gmail}` plus the job-app AI routes
  (`parse-resume`, `analyze-job`, `map-fields`) return 404 when off. `scraper.*`
  only wires nav (Leads / Campaigns) so far — the leads UI/schema land in later
  phases. None of these flags unlock a secret, so there's no `env.schema.ts` rule.
- **ScrapperNinja Phase 1 (foundation)** landed the Lead Directory at `/leads`
  (schema, query/service/CSV layer, API routes, table UI) plus a `vitest` unit
  suite for the pure logic (`lib/leads/{query,csv,columns}.test.ts`). `npm run
  seed` now also seeds ~30 demo leads across 2 campaigns, 2 saved views, and one
  `priority` custom field for the admin org — **idempotent** (keyed on the
  `seed-demo-` `clientCaptureId` prefix), and only meaningful when `scraper` is
  on. See `docs/guides/scraper-setup.md`.

## Adding a flag (checklist, per CLAUDE.md §7)

1. Add the flag to `config/features.ts` (resolved via `!!process.env.X`).
2. Add its toggle var and any required secrets to `.env.example` (grouped,
   commented).
3. Add required-when-on rules to `config/env.schema.ts`.
4. Add a row to the table above — same commit.
