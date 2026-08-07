# ApplyNinjaa

Autofill job applications, screen postings against your deal-breakers (visa
sponsorship, citizenship, clearance…), score your fit against your resume, and
track every application — a web dashboard, platform admin, and Chrome (MV3)
extension. Built for visa-constrained job seekers (F-1 OPT/STEM OPT, H1-B, TN,
H4-EAD); useful for everyone.

**Stack:** Next.js 15 (App Router) · TypeScript · TailwindCSS v4 · shadcn/ui ·
MongoDB (Mongoose) · Stripe · DeepSeek · Resend · Vite + React (extension).

Built on the `ninjakit` boilerplate — its conventions still apply
(see `CLAUDE.md` and `docs/`). This fork resolved the database choice to
**MongoDB** and removed the Supabase adapters.

## Testing

**[docs/guides/testing-guide.md](docs/guides/testing-guide.md)** — a
step-by-step setup and testing guide written for non-technical testers: how to
install the tools, how to obtain every API key (Google, LinkedIn, Stripe,
DeepSeek, Resend) click by click, and 66 numbered test cases covering every
feature with expected results.

## Quickstart

```bash
npm install
cp .env.example .env.local        # fill in what you have — see the file's comments
docker compose up -d              # local MongoDB 7
npm run seed                      # users, 4 plans, 6 default filters, super admin
npm run dev
```

Seeded logins: `admin@example.com` / `user@example.com` (password
`Password123!`; promote a super admin via `SUPER_ADMIN_EMAIL`).

Required secrets by feature (names in `.env.example`, validated at boot by
`config/env.schema.ts`): `MONGODB_URI`, `AUTH_SECRET`, `EEO_ENCRYPTION_KEY`
(`openssl rand -base64 32`), `DEEPSEEK_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`
(login + Gmail scope), `LINKEDIN_CLIENT_ID/SECRET`, `STRIPE_SECRET_KEY` +
`STRIPE_WEBHOOK_SECRET` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`RESEND_API_KEY`.

### Stripe

```bash
npm run sync:plans                # mint Products/Prices for the seeded plans
stripe listen --forward-to localhost:3000/api/payments/webhook
```

### Chrome extension

```bash
npm run build:extension           # output: extension/dist
# chrome://extensions → Developer mode → Load unpacked → extension/dist
```

See `extension/README.md` for the auth handshake and architecture.

### Maintenance scripts

- `npm run hard-delete` — purge PII for accounts past the 30-day soft-delete
  window (run daily).

## Where things live

- Product state & decisions: `docs/knowledge-base/current-state.md` (read
  first) and `decisions.md`
- Architecture: `docs/architecture/` (data layer, feature flags, components
  catalog, theming)
- Conventions/rulebook: `CLAUDE.md`
