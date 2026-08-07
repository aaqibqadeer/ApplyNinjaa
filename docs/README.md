# Docs

Documentation index for the ninjakit boilerplate.

**New to this repo?** Read `knowledge-base/current-state.md` first, then the root
`CLAUDE.md` (the full rulebook).

## knowledge-base/ — shared agent memory

- `current-state.md` — living snapshot of what's built, which flags/providers are
  configured in this fork, and known rough edges. **Read first.**
- `decisions.md` — why non-obvious choices were made (newest first); older
  entries in `decisions-archive.md`.
- `glossary.md` — project-specific terms.

## architecture/ — living reference docs

- `overview.md` — philosophy in depth.
- `feature-flags.md` — every flag, its env var, and required secrets.
- `data-layer.md` — the database adapter pattern.
- `components.md` — reusable component catalog (keep current).
- `theming.md` — theme tokens (Tailwind v4, CSS-first).

## guides/ — setup & usage walkthroughs

- `getting-started.md` — clone → configure → seed → run. **Start here.**
- `production-roadmap.md` — **ApplyNinjaa's** path to launch: pre-launch
  blockers, Railway + Atlas setup, CI, extension releases.
- `testing-guide.md` — the 66-case manual QA pass (there is no automated suite).
- `deployment.md` — generic template deployment notes.
- `choosing-database.md` — Supabase vs MongoDB.
- `auth-setup.md` · `multi-tenancy.md` · `payments-setup.md` ·
  `storage-phone-email.md` · `ai-providers.md` — per-feature setup.

## prompts/ — standalone, copy-pasteable prompts

- `scaffold-new-saas.md` — start a new product from the template.
- `add-crud-feature.md` — add a tenant-scoped entity (Zod + adapter + seed + UI).
- `add-admin-panel-page.md` — add an `/admin` page with the right tier guard.
- `write-seed-data.md` — add idempotent seed rows.
- `debug-checklist.md` — structured first pass when something breaks.
- `generate-legal-docs.md` — fill the legal templates from a product description.

## legal-templates/ — boilerplate legal docs

`privacy-policy.md`, `terms-of-service.md`, `cookie-policy.md` — `[PLACEHOLDER]`
templates; fill via `prompts/generate-legal-docs.md`. Not legal advice.

## llm-context/ — source material for `CLAUDE.md` / `.cursorrules`

Notes distilled into the root rulebook and Cursor rules.
