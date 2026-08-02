# AGENTS.md

Project rules live in `CLAUDE.md` and `.cursorrules` (auto-loaded). Read
`docs/knowledge-base/current-state.md` first. This file only adds environment
notes for automated agents.

## Cursor Cloud specific instructions

This is **ApplyNinjaa** (the `ninjakit` SaaS template forked): a Next.js 15 web
app + platform admin (`/app`) plus a Chrome MV3 extension (`/extension`, its own
`package.json`). Package manager is **npm** (see `package-lock.json`); Node 22.

Dependencies are installed by the startup update script (`npm install` +
`npm --prefix extension install`). The items below are the non-obvious runtime
setup that the update script deliberately does **not** do.

### MongoDB is the one required service — start it manually
The app needs MongoDB on `localhost:27017` (`DB_PROVIDER=mongodb`). The repo
ships `docker-compose.yml` (`mongo:7`), but this VM has no Docker; MongoDB 7 is
installed natively instead. It is **not** auto-started. Start it (idempotent —
skip if already running) before running the app/seed/tests:

```
mongod --dbpath /data/db --bind_ip 127.0.0.1 --port 27017   # run in a tmux/background session
mongosh --quiet --eval 'db.runCommand({ ping: 1 })'         # -> { ok: 1 } when up
```

### `.env.local` is required and git-ignored (won't be in the repo)
`config/env.schema.ts` validates env **by feature flag** at boot: because the
standard flag set enables Google, LinkedIn, Stripe, DeepSeek, and Gmail, their
secrets are **boot-required** — the app throws on start if any is missing. If
`.env.local` is absent, recreate it (placeholders are fine to boot; the
email+password flow needs no real third-party keys):

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_FEATURE_AUTH_EMAIL_PASSWORD=1
NEXT_PUBLIC_FEATURE_AUTH_OAUTH_GOOGLE=1
NEXT_PUBLIC_FEATURE_AUTH_OAUTH_LINKEDIN=1
NEXT_PUBLIC_FEATURE_PAYMENTS=1
NEXT_PUBLIC_FEATURE_PAYMENTS_ANNUAL_BILLING=1
NEXT_PUBLIC_FEATURE_ADMIN=1
NEXT_PUBLIC_FEATURE_AI_PROVIDERS=deepseek
NEXT_PUBLIC_FEATURE_GMAIL=1
NEXT_PUBLIC_FEATURE_COOKIE_BANNER=1
AUTH_SECRET=<openssl rand -base64 32>
EEO_ENCRYPTION_KEY=<openssl rand -base64 32>   # must be base64 32 bytes (real, used by AES-256-GCM)
SUPER_ADMIN_EMAIL=admin@example.com
GOOGLE_CLIENT_ID=placeholder-google-client-id
GOOGLE_CLIENT_SECRET=placeholder-google-client-secret
LINKEDIN_CLIENT_ID=placeholder-linkedin-client-id
LINKEDIN_CLIENT_SECRET=placeholder-linkedin-client-secret
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
DEEPSEEK_API_KEY=placeholder-deepseek-api-key
DB_PROVIDER=mongodb
MONGODB_URI=mongodb://localhost:27017/applyninjaa
```

Replace placeholders with real keys to exercise AI (DeepSeek), OAuth, or Stripe
flows. Alternatively, remove a `NEXT_PUBLIC_FEATURE_*` flag line to drop its
boot requirement. `SKIP_ENV_VALIDATION=1` bypasses the whole guard (build/CI
only — never at runtime).

### Standard commands (from `package.json`)
- `npm run dev` → Next.js on `http://localhost:3000`.
- `npm run seed` → seeds users, 4 plans, 6 filters, super admin. Re-run after
  schema/limit changes; seeded logins: `admin@example.com` / `user@example.com`,
  password `Password123!`.
- `npm run lint`, `npm run typecheck` → the two gates (both must pass).
- `npm run build` → needs `SKIP_ENV_VALIDATION=1` and `NEXT_PUBLIC_APP_URL` when
  real secrets are absent (see `.github/workflows/ci.yml`).
- `npm run build:extension` → builds `extension/dist` (load unpacked in Chrome).

### Email verification has no provider locally
With no `RESEND_API_KEY`, auth emails (verification / reset links) are printed to
the **server console** instead of sent (`lib/email/send.ts`). To verify a new
signup, grep the dev-server output for the `http://localhost:3000/api/auth/verify-email?token=...`
link and open it.

### Testing
No automated test suite (`scripts/seed-test.ts` is a stub). QA is manual —
`docs/guides/testing-guide.md` has 66 numbered cases.
