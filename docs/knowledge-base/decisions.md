# Decisions

> Non-obvious decisions and _why_ (CLAUDE.md §11). Short entries, dated, **newest
> at the top** — only what a future agent would otherwise re-derive or get wrong.
> Recent phases stay here; older entries live in
> [`decisions-archive.md`](./decisions-archive.md). Keep this file small.

## 2026-07-28 — v1.1: first-live-run bug fixes

- **Never import a runtime value from a `"use client"` module into a Server
  Component.** React hands back a client-reference *proxy* whose only own props
  (`$$typeof`, `$$id`, `$$async`) are non-enumerable, so `{ ...value }` yields
  `{}` — silently, at SSR time. This crashed `/profiles/new`, which spread
  `emptyProfileValues` out of `ProfileForm.tsx`. Fix: shared form values/types
  live in **`lib/profiles/form-values.ts`** (a plain module both sides import).
  `import type` from a client module stays safe — types are erased. Don't
  "fix" a recurrence with optional chaining; that only moves the crash.
- **`pdfjs-dist` must never be webpack-bundled.** Its `legacy/build/pdf.mjs` is
  itself a pre-built webpack bundle declaring a top-level
  `var __webpack_exports__`, which shadows the binding Next injects — so the
  injected prologue runs `Object.defineProperty(undefined, …)` on import.
  `next.config.ts` lists `pdf-parse`/`pdfjs-dist`/`mammoth` in
  **`serverExternalPackages`** (the Next 15 top-level key; the `experimental.`
  form is deprecated). Verify by grepping the compiled route for a bare
  `import("pdf-parse")` and zero `__webpack_exports__`. Wipe `.next/` after
  changing this or the stale bundle is reused.
- **Form value types are the schema's mirror — extend both together.**
  `projects` existed end-to-end (Zod, adapter, service create *and* update) but
  was missing from `ProfileFormValues`/`toFormValues`, so a resume-parsed
  projects list was persisted at create and erased on the first edit-and-save.
  Any field added to `profileSchema` needs a matching form value + editor
  section, or edits become silent data loss.

## 2026-07-28 — ApplyNinjaa v1 build (fork of template v1.0.0)

- **User-level billing rides the org schema.** `multiTenant` stays off; the
  silent default org (org ≡ user) is the billing entity, so checkout/webhook/
  subscriptions are reused unchanged. Never refactor subscriptions to userId —
  resolve "the user's plan" via `getEffectivePlan(session)`
  (lib/payments/access.ts: live sub → lazy trial expiry → Free-slug fallback).
- **No-card trial ≠ Stripe trial.** The 7-day Pro trial is a local `trialing`
  subscription row (no Stripe ids, end in `currentPeriodEnd`), started at
  email verification, once per verified email (`users.trial_used_at`), lazily
  expired on read — no cron. `checkout.ts` hard-sends `trialEnd: null`;
  re-enabling Stripe trials via `app_settings.trialDays` is intentionally
  impossible (that knob now sets the LOCAL trial length instead).
- **Usage/rate-limit data bypasses the DB adapter** (`lib/usage/`,
  `lib/gmail/store.ts`): atomic `$inc` + TTL indexes are Mongo primitives and
  operational, not tenant-domain, data — same precedent as
  `auth_credentials`. The fork is Mongo-only (Supabase adapters deleted §1.5),
  so no portability is lost. Cap enforcement is increment-first with
  refund-on-overshoot so the hard cap holds under concurrency.
- **One AI call per user action.** Popup analysis (all filter verdicts + fit
  score + company/role extraction) is a single `analyzeJob` generation; a
  whole Gmail scan (≤50 msgs, batched classification) bills as one action.
  Don't split these back into per-filter/per-email calls.
- **Extension has NO content script.** All page-DOM work is closure-free
  functions passed to `chrome.scripting.executeScript` (constraint documented
  in `extension/src/lib/dom-actions.ts`); activeTab+scripting on user gesture,
  host permission = backend origin only. Auth = one-time cookie→Bearer
  exchange (`purpose:"extension"`, 30d, chrome.storage.local); server side is
  `authorizeApi()` + middleware Bearer passthrough. Stateless tokens are
  unrevocable until expiry — accepted; add `users.tokenVersion` if that
  changes.
- **/admin is platform-staff only.** Every user is org-admin of their silent
  default org, so the template's org-admin gate would admit everyone. Support
  tier = `users.is_support_admin` (view users + refunds ONLY); destructive/
  pricing/filter/audit paths stay `superAdmin`. Two booleans, not a role
  enum, so existing `isSuperAdmin` checks stayed untouched.
- **EEO encryption boundary is the profile service.** `lib/profiles/service.ts`
  is the only importer of `lib/crypto/field-encryption.ts` for profile data
  (AES-256-GCM, per-user AAD, `v1.` version prefix); schema/adapter/routes
  only ever see packed ciphertext. Gmail refresh tokens reuse the same key.
- **Plan slugs are create-only.** Code finds plans by slug (`free`, `pro`) —
  names/prices are admin-editable, slugs never change after creation (admin
  PATCH omits slug by schema).
- **pdf-parse is v2, not v1.** Use the `PDFParse` class from the package root
  (`new PDFParse({ data })` → `getText()` → **`destroy()`**, or every upload
  leaks a pdf.js worker). Do NOT reach for the widely-copied v1 workaround
  `import pdf from "pdf-parse/lib/pdf-parse.js"` — v2's exports map rejects
  it and the failure surfaces only at `next build`, not at typecheck. Join
  `result.pages[].text` yourself; the concatenated `result.text` interleaves
  `-- 1 of N --` page markers that would read as resume content to the model.

## 2026-07-19 — Phase 10: docs finalization (template v1.0.0)

Closes the template. **CLAUDE.md and `.cursorrules` were already complete**, so
per the user's call we **reconciled rather than rewrote**: fixed CLAUDE.md §10
(it still described the Tailwind **v3** `tailwind.config.ts` + `hsl(var(--x))`
model; the fork is v4 CSS-first with `@theme inline` + `oklch` — now matches
`theming.md`) and lightly expanded `.cursorrules` (theming/v4, super-admin
separation, Zod-at-boundary, "read current-state first"). Established the
**prompt-file format** (framing → fenced copy-paste block with `[INPUTS]` →
related-links footer) across all six `docs/prompts/*`. Wrote a full
`getting-started.md` (standardized on **pnpm**, dropped the stub's `npm` +
`seed:test` claims since `seed:test` is still a stub) and a new `deployment.md`
(stresses `NEXT_PUBLIC_*` are build-time and `SKIP_ENV_VALIDATION` is build/CI
only). Refreshed `docs/README.md` (removed the stale "populated later" notes) and
seeded `docs/llm-context/` as a pointer to the distilled rulebook rather than
duplicating content. Marked the template **v1.0.0**.

## 2026-07-19 — Phase 9: SEO metadata, sitemap/robots, cookie banner, legal templates

SEO plumbing is **not flag-gated** (every fork wants it): the root `metadata`
export gained `metadataBase`/title-template/OpenGraph/Twitter/robots, and
`app/sitemap.ts` + `app/robots.ts` build absolute URLs from
`NEXT_PUBLIC_APP_URL`. **Runtime check caught a real bug** — `middleware.ts`
redirected `/robots.txt` and `/sitemap.xml` to `/login` (its matcher catches
them and they weren't public), so both were added to `isPublicPath`. The cookie
banner **is** flag-gated (`cookieBanner`, a flat boolean). Its consent cookie
(`ninjakit_cookie_consent`) is deliberately **client-managed and non-httpOnly**
(unlike the server-set auth/active-org cookies) because the banner must read it in
the browser to decide whether to render — its constant lives in the component,
not `lib/auth/constants.ts`, since it isn't an auth concern. The banner **starts
hidden and reveals after mount** (via `useEffect`) to avoid an SSR hydration
mismatch, and exposes `getCookieConsent()` so a fork can gate analytics on the
choice. It takes an optional `policyHref` rather than hardcoding a `/cookie-policy`
route that doesn't exist yet (no broken link). Legal docs ship as `[PLACEHOLDER]`
**templates** (not routed pages) plus a `generate-legal-docs.md` prompt — the fork
decides whether/how to route them. Verified end-to-end with a headless browser:
banner shows → Accept sets cookie → stays hidden on reload; `/robots.txt` +
`/sitemap.xml` render; metadata present in `<head>`.

## 2026-07-19 — Phase 8: AI integration (Anthropic + OpenAI behind one interface)

Two providers landed behind the standard `@/lib/ai` seam — `AiAdapter` interface
(`generate()` / `stream()`) with `anthropic/` and `openai/` implementations. Two
choices differ from the other adapters. **(1) Official SDKs over raw `fetch`** —
unlike the Twilio/Resend adapters, we added `@anthropic-ai/sdk` and `openai`
(user-confirmed) because they handle streaming and typing cleanly and follow the
Stripe/AWS-SDK precedent; hand-rolling SSE parsing for two providers wasn't worth
it. **(2) Provider-keyed accessor, not a single singleton** — `aiProviders` is an
**array** (several providers enable-able at once), so `lib/ai/index.ts` exposes
`ai(provider?)` with lazy per-provider caching rather than one global instance
like storage/phone/payments. Default provider = optional `AI_DEFAULT_PROVIDER`
env (no secret, no required-when rule) else the first enabled entry. DTOs are
provider-neutral (no SDK type past the seam); default model ids live in
`lib/ai/models.ts` so none are hardcoded in app code (§8). The example route
`app/api/ai/generate` is a non-streaming smoke test following the flag-404 →
`authorize()` → Zod contract; `stream()` exists on the adapter but the repo has
**no shared SSE helper yet** (noted for a future phase). Not runtime-verified
against live provider APIs (no keys here): typecheck + prod build pass, and the
selector/route 404 correctly when AI is off.

---

Earlier entries (Phase 7 and before) are in
[`decisions-archive.md`](./decisions-archive.md).
