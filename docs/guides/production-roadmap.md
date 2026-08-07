# Production roadmap

Everything between "it runs on my laptop" and "strangers pay for it", in the
order it has to happen. Read the blockers first — one of them takes weeks and
nothing else on this page shortens it.

**Hosting decision: Railway + MongoDB Atlas.**

---

## 0. Pre-launch blockers

These gate launch and are mostly waiting-on-someone-else, so start them before
any of the deployment work below.

### Google OAuth verification — the long pole

`gmail.readonly` is a **restricted** scope. Until Google verifies the app, the
consent screen shows an "unverified app" warning and is capped at 100 test
users, so the Premium tier's headline feature cannot ship to real customers.

Verification requires, at minimum:

- A published, reachable **privacy policy** stating Google Limited Use
  compliance. `/privacy` already carries this language — it just has to be
  live at the production domain.
- A **demo video** showing the whole consent flow and what the data is used
  for.
- **Domain ownership** verified in Search Console.
- Possibly a **third-party CASA security assessment**, which costs money and
  adds weeks. Whether it applies depends on how Google classifies the app.

Budget **weeks, not days**, and expect at least one round of review feedback.

Everything else in the product works without this — Gmail scanning is the only
casualty, and it is already gated behind the Premium entitlement, so a launch
without it degrades gracefully.

### Stripe live mode

Test-mode keys never charge anyone. Before launch: activate the account
(business details, bank account, tax info), swap to live keys, re-point the
webhook at the production URL, and re-run `npm run sync:plans` so the live
account gets its own Price objects. **Test-mode Price IDs are meaningless in
live mode** — the plans table has to be re-synced, not copied.

### A real sending domain

The Resend sandbox sender only delivers to the account owner's own address, so
every verification email to a real user silently goes nowhere. Verify a domain
(SPF + DKIM records), then set `AUTH_EMAIL_FROM` to an address on it.

### Legal

`/privacy`, `/terms`, `/cookie-policy` exist and are routed. Have someone who
is not an AI read them against what the product actually does before launch —
particularly the Gmail sections, since Google will read them too.

---

## 1. Environments

Three, sharing no data:

|            | Branch    | Database                              | Stripe   | Purpose                            |
| ---------- | --------- | ------------------------------------- | -------- | ---------------------------------- |
| Local      | —         | local Docker or an Atlas free cluster | test     | day-to-day work                    |
| Staging    | `staging` | its own Atlas cluster                 | test     | verify a change against real infra |
| Production | `master`  | its own Atlas cluster                 | **live** | customers                          |

Non-negotiables:

- **`SKIP_ENV_VALIDATION` is build/CI only.** Setting it at runtime disables
  the Zod boot guard that catches a missing secret at startup instead of at
  2am. CI sets it because CI has no secrets and only needs to prove the app
  compiles.
- **`NEXT_PUBLIC_*` are baked in at build time**, not read at boot. Changing
  `NEXT_PUBLIC_APP_URL` requires a rebuild, not a restart. This is also why
  every feature flag change needs a redeploy.
- **`EEO_ENCRYPTION_KEY` is unrecoverable.** Lose it and every encrypted EEO
  answer and stored Gmail refresh token is permanently unreadable. Back it up
  somewhere that is not only Railway.
- Production and staging must never share a database. `TEST_MODE=true` plus
  `TEST_DB_PATTERN` (§12) is the speed bump that stops a test run from
  pointing at production data.

Full variable list with per-flag requirements: `.env.example`.

---

## 2. Deploying on Railway

Railway's GitHub integration is the whole deployment story — connect the repo,
point a service at a branch, and it builds and deploys on push. There is
deliberately **no CD workflow in this repo**: a workflow needing a
`RAILWAY_TOKEN` that doesn't exist yet would just fail on every push.

Setup, once per environment:

1. New project → Deploy from GitHub repo → pick the branch (`staging` or
   `master`).
2. Build command `npm run build`, start command `npm start`. Railway detects
   Next.js, but set them explicitly so it can't guess wrong later.
3. Add the environment variables for that environment.
4. **Settings → enable "Wait for CI"** so a red build never reaches users.
   This is what makes the CI workflow a gate rather than a report.
5. Add the custom domain; Railway issues the TLS certificate.

To gate deploys on something CI can't express, or to deploy from a workflow
instead, `railway up --service <name>` with a `RAILWAY_TOKEN` secret does the
same job — but prefer the native integration until there's a reason not to.

### The scheduled job — not optional

`/privacy` promises that deleted accounts are purged within 30 days. The
purge is `npm run hard-delete`, and **nothing runs it automatically**. Without
a schedule the app is quietly out of compliance with its own privacy policy.

Add a Railway **cron service** on the same repo and variables, schedule
`0 3 * * *` (daily, 03:00 UTC), start command `npm run hard-delete`. It's
idempotent, so a missed or doubled run is harmless.

Kept as a plain npm script on purpose: it runs identically on Railway cron, a
Vercel Cron function, a GitHub Actions schedule, or by hand — nothing about it
is host-specific, which is what keeps the hosting decision reversible.

---

## 3. CI

`.github/workflows/ci.yml` runs on every PR and on pushes to `master` and
`staging`: install → typecheck → lint → build → build extension.

`npm run format:check` is **not** a gate. The repo has never been fully
Prettier-clean (44 files differ as of this writing), so adding it would make
CI red on arrival. To adopt it: run `npm run format` once, commit that alone,
then add the step.

There is **no automated test suite**. `docs/guides/testing-guide.md` is the
manual pass — 66 numbered cases. Treat it as the release checklist until real
tests exist.

---

## 4. Releasing the extension

`.github/workflows/extension-release.yml` fires on an `ext-v*` tag: it checks
the tag matches `manifest.template.json`'s version (the Web Store rejects a
re-used version), builds, zips, then uploads and publishes via the Web Store
API.

Secrets it needs: `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`,
`CWS_REFRESH_TOKEN`. Repository variable: `PRODUCTION_APP_URL`, which is
compiled into the extension as its backend origin.

Two things that shape how you release:

- **The first submission must be manual** — one-time $5 developer
  registration and an initial review. The workflow only handles updates.
- **Every update is reviewed**, taking hours to days. So the web app and the
  extension cannot be assumed to ship together, which means **the backend must
  stay compatible with the published extension**, not merely the one in this
  repo. Adding fields is safe; removing or repurposing them is not, until the
  new extension has actually rolled out.

---

## 5. After launch

In rough priority order:

1. **Error monitoring** (Sentry or similar). Right now a 500 in production is
   invisible unless a user reports it.
2. **Uptime check** on `/` and one authenticated route.
3. **Atlas backups on, and a restore actually rehearsed.** An untested backup
   is a guess. Do the restore once, into staging, before you need it.
4. **Watch the AI spend.** Per-user caps bound it, but nothing bounds the
   number of users. Set a DeepSeek billing alert.
5. **Analytics** — deliberately absent for v1; add when there's a question
   worth answering.

---

## Related

- `docs/guides/getting-started.md` — local setup
- `docs/guides/testing-guide.md` — the 66-case manual pass
- `docs/guides/payments-setup.md` — Stripe specifics
- `.env.example` — every variable, grouped by the flag that requires it
