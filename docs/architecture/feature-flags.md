# Feature Flags

**Living source of truth for every flag in the template.** See CLAUDE.md §1, §7.
Every future phase that adds a flag MUST update this table in the same commit.

Every optional feature is gated by a flag resolved in `config/features.ts` from
an environment variable. App code checks `features.*`; it never reads
`process.env` directly and never hardcodes an optional feature as always-on. A
feature whose flag is off degrades to "not rendered / not routable" — never a
broken page.

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

| Flag (`features.*`)      | Toggle env var                                | Controls                                                                                                                                         | Required secrets when on                                                                                                                                         |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.emailPassword`     | `NEXT_PUBLIC_FEATURE_AUTH_EMAIL_PASSWORD`     | Email + password sign-in                                                                                                                         | `AUTH_SECRET`                                                                                                                                                    |
| `auth.magicLink`         | `NEXT_PUBLIC_FEATURE_AUTH_MAGIC_LINK`         | Passwordless magic-link sign-in                                                                                                                  | `AUTH_SECRET`, `RESEND_API_KEY`                                                                                                                                  |
| `auth.oauth.google`      | `NEXT_PUBLIC_FEATURE_AUTH_OAUTH_GOOGLE`       | Google OAuth sign-in                                                                                                                             | `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                                                                        |
| `auth.oauth.github`      | `NEXT_PUBLIC_FEATURE_AUTH_OAUTH_GITHUB`       | GitHub OAuth sign-in                                                                                                                             | `AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`                                                                                                        |
| `auth.oauth.linkedin`    | `NEXT_PUBLIC_FEATURE_AUTH_OAUTH_LINKEDIN`     | LinkedIn OAuth sign-in (OpenID Connect)                                                                                                          | `AUTH_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`                                                                                                    |
| `payments.enabled`       | `NEXT_PUBLIC_FEATURE_PAYMENTS`                | Stripe billing (checkout, portal, webhook, subscriptions)                                                                                        | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`                                                                               |
| `payments.annualBilling` | `NEXT_PUBLIC_FEATURE_PAYMENTS_ANNUAL_BILLING` | Annual pricing cadence — plans expose `priceAnnual` + `annualDiscountPercent`; checkout offers monthly/annual. No schema change to toggle (§15). | _(none — reuses the Stripe secrets above)_                                                                                                                       |
| `storage`                | `NEXT_PUBLIC_FEATURE_STORAGE`                 | File storage — the CV / cover letter saved on a profile (**on** in this fork)                                                                    | `STORAGE_PROVIDER` = `mongodb` \| `s3`; when `=s3` also `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (`AWS_S3_ENDPOINT` optional) |
| `phoneVerification`      | `NEXT_PUBLIC_FEATURE_PHONE_VERIFICATION`      | SMS phone verification (Twilio Verify)                                                                                                           | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`                                                                                           |
| `admin`                  | `NEXT_PUBLIC_FEATURE_ADMIN`                   | Admin panel routes/UI                                                                                                                            | _(none)_                                                                                                                                                         |
| `cookieBanner`           | `NEXT_PUBLIC_FEATURE_COOKIE_BANNER`           | Cookie-consent banner (accept/reject, choice stored in a cookie)                                                                                 | _(none)_                                                                                                                                                         |
| `gmail`                  | `NEXT_PUBLIC_FEATURE_GMAIL`                   | Gmail integration — separate opt-in read-only OAuth + manual inbox scans proposing application-status updates                                    | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (required even if Google login is off)                                                                                |
| `aiProviders`            | `NEXT_PUBLIC_FEATURE_AI_PROVIDERS`            | Enabled AI providers (comma-separated: `anthropic`, `openai`, `deepseek`)                                                                        | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` per listed provider                                                                                  |
| `multiTenant`            | `NEXT_PUBLIC_FEATURE_MULTI_TENANT`            | Org switching/invites UI. Off = one silent default org per user. Schema is always multi-tenant.                                                  | _(none required; email invites reuse `RESEND_API_KEY` if set, else log to console in dev)_                                                                       |

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
- **Storage is on in this fork, with `STORAGE_PROVIDER=mongodb`.** GridFS
  reuses `MONGODB_URI`, so profile documents work on Railway + Atlas with no
  object-store credentials; the S3 adapter is untouched and selectable with
  `STORAGE_PROVIDER=s3`. GridFS cannot presign, so the Mongo provider returns a
  same-origin `/api/storage/objects/…` route and authority comes from the
  caller's session plus a key-prefix ownership check
  (`lib/storage/mongodb/adapter.ts`).
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

## Adding a flag (checklist, per CLAUDE.md §7)

1. Add the flag to `config/features.ts` (resolved via `!!process.env.X`).
2. Add its toggle var and any required secrets to `.env.example` (grouped,
   commented).
3. Add required-when-on rules to `config/env.schema.ts`.
4. Add a row to the table above — same commit.
