<!--
  ============================================================================
  COMPONENT CATALOG — living document (CLAUDE.md §9).

  Every new shared component MUST be added here in the SAME COMMIT it's
  introduced. Check this file BEFORE building a new component — reuse or extend
  an existing one before duplicating.

  Scope: everything in /components/ui (shadcn primitives) and /components/shared
  (our own reusable components). Feature-scoped components (/components/<feature>)
  are listed only once they're promoted to /shared per §9.4.
  ============================================================================
-->

# Component Catalog

Living catalog of every reusable component in the template.

## `/components/ui` — shadcn primitives

Unmodified shadcn/ui primitives (style: new-york). Tracked from day one so the
catalog reflects _all_ reusable UI, not just custom components.

| Component                                                                                                                         | Location                          | Purpose                                                                                        | Key Props                                                                                                                    | Used In                              |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `Button`                                                                                                                          | `components/ui/button.tsx`        | Clickable action / link-styled action.                                                         | `variant` (default \| destructive \| outline \| secondary \| ghost \| link), `size` (default \| sm \| lg \| icon), `asChild` | `SiteHeader`, `Hero`, marketing/auth |
| `Card` (+ `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`)                                | `components/ui/card.tsx`          | Surface container for grouped content.                                                         | standard `div` props via `className` composition                                                                             | `app/dashboard`, auth/admin cards    |
| `Input`                                                                                                                           | `components/ui/input.tsx`         | Single-line text/email/etc. form field.                                                        | native `input` props (`type`, `placeholder`, `disabled`, …)                                                                  | auth forms                           |
| `Label`                                                                                                                           | `components/ui/label.tsx`         | Accessible label for a form control.                                                           | native `label` props, `htmlFor`                                                                                              | auth forms                           |
| `DropdownMenu` (+ `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`) | `components/ui/dropdown-menu.tsx` | Radix dropdown menu (new-york).                                                                | Radix `DropdownMenu.*` props; `Item` `onSelect`, `inset`                                                                     | `WorkspaceSwitcher`                  |
| `Dialog` (+ `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`)  | `components/ui/dialog.tsx`        | Radix modal dialog (new-york). Built-in close button uses inline SVG (no icon-lib dependency). | `open`, `onOpenChange`; Radix `Dialog.*` props                                                                               | `WorkspaceSwitcher`                  |
| `Badge`                                                                                                                           | `components/ui/badge.tsx`         | Small status/label pill.                                                                       | `variant` (default \| secondary \| destructive \| outline)                                                                   | admin overview / tables (Phase 7)    |
| `Table` (+ `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`)                                                      | `components/ui/table.tsx`         | Plain semantic table wrappers (scrolls on overflow).                                           | native table-element props                                                                                                   | `DataTable`                          |
| `Switch`                                                                                                                          | `components/ui/switch.tsx`        | Dependency-free on/off toggle (`role="switch"`).                                               | `checked`, `onCheckedChange`, `disabled`                                                                                     | `PlanManager`                        |
| `Toaster` (sonner)                                                                                                                | `components/ui/sonner.tsx`        | App toast host; mounted once in the root layout. Fire toasts with `toast` from `sonner`.       | `sonner` `ToasterProps`                                                                                                      | `app/layout.tsx`                     |

## `/components/shared` — custom reusable components

| Component           | Location                                  | Purpose                                                                                                                                                                                            | Key Props                                                                    | Used In                                                          |
| ------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `WorkspaceSwitcher` | `components/shared/WorkspaceSwitcher.tsx` | Active-org dropdown + "Create organization" dialog. Render only when `features.multiTenant`.                                                                                                       | `organizations: {id,name}[]`, `activeOrgId`                                  | `app/dashboard/page.tsx`                                         |
| `FileUpload`        | `components/shared/FileUpload.tsx`        | Presigned-URL file uploader (POST `/api/storage/upload-url` → PUT to storage). Renders null when `features.storage` is off.                                                                        | `onUploaded?(: {key})`, `accept?`, `label?`, `maxSizeMb?`                    | _(Phase 6 — drop into any form)_                                 |
| `PhoneVerify`       | `components/shared/PhoneVerify.tsx`       | Two-step SMS verification (start → check). Placement-agnostic via `onVerified`. Renders null when `features.phoneVerification` is off.                                                             | `defaultPhone?`, `onVerified?(phone)`                                        | _(Phase 6 — signup / settings / modal)_                          |
| `ConfirmDialog`     | `components/shared/ConfirmDialog.tsx`     | Confirm-before-action dialog for destructive/financial actions. Built on `Dialog`; runs `onConfirm`, shows errors inline, closes on success.                                                       | `trigger`, `title`, `description?`, `onConfirm`, `destructive?`, `children?` | `PlanManager`, `SubscriptionsTable`                              |
| `DataTable`         | `components/shared/DataTable.tsx`         | Generic table over the `Table` primitive — declare `columns` (`header` + `cell`) and `rows`; falls back to `EmptyState`.                                                                           | `columns`, `rows`, `getRowKey`, `empty?`                                     | `PlanManager`, `SubscriptionsTable`, admin org list              |
| `EmptyState`        | `components/shared/EmptyState.tsx`        | Consistent empty-list placeholder.                                                                                                                                                                 | `title`, `description?`, `action?`                                           | `DataTable`, admin tables                                        |
| `CookieBanner`      | `components/shared/CookieBanner.tsx`      | Flag-gated cookie-consent banner (accept/reject → first-party cookie). Client component; renders null when `features.cookieBanner` off or a choice was already made. Exposes `getCookieConsent()`. | `policyHref?`                                                                | `app/layout.tsx`                                                 |
| `BrandMark`         | `components/shared/BrandMark.tsx`         | Token-only logomark (shuriken glyph on a `primary` tile). Pair with the wordmark; recolors with the theme.                                                                                         | `className?`                                                                 | `SiteHeader`, `SiteFooter`, `AppHeader`                          |
| `ThemeToggle`       | `components/shared/ThemeToggle.tsx`       | Light/dark toggle — swaps the `dark` class on `<html>` and persists to localStorage; initial theme applied pre-hydration by the inline script in `app/layout.tsx`. Icons swap via CSS `dark:` variant (hydration-safe). | _(none)_                                                                     | `SiteHeader`, `AppHeader`                                        |
| `SiteHeader`        | `components/shared/SiteHeader.tsx`        | Public marketing header (sticky, translucent). Shows Log in / Get started, or a Dashboard link when `signedIn`.                                                                                    | `signedIn?`                                                                  | `app/page.tsx`                                                   |
| `SiteFooter`        | `components/shared/SiteFooter.tsx`        | Minimal public footer for marketing/legal pages (brand + Log in / Get started links + year).                                                                                                       | _(none)_                                                                     | `app/page.tsx`                                                   |
| `AppHeader`         | `components/shared/AppHeader.tsx`         | Global signed-in nav bar. Server component: derives links from flags + role, mounts `WorkspaceSwitcher` (multi-tenant) + `LogoutButton`.                                                           | `session`                                                                    | `app/dashboard`, `app/settings/organization`, `app/admin/layout` |
| `AppNav`            | `components/shared/AppNav.tsx`            | Client nav link row with active-route highlighting (`usePathname`). Links computed server-side and passed in.                                                                                      | `links: {href,label}[]`, `className?`                                        | `AppHeader`                                                      |

Other candidates (per §9.2) — avatars, loading skeletons, pagination — are built
here the first time they're needed, with an entry added in the same commit.

## `/components/marketing` — landing-page components

Feature-scoped (§9.4): reusable within the public marketing surface. Presentational
server components; content lives in local data arrays a fork edits in place.

| Component         | Location                                   | Purpose                                                                           | Key Props | Used In        |
| ----------------- | ------------------------------------------ | --------------------------------------------------------------------------------- | --------- | -------------- |
| `Hero`            | `components/marketing/Hero.tsx`            | Landing hero — badge, headline, sub-headline, Log in / Explore CTAs, stack strip. | _(none)_  | `app/page.tsx` |
| `FeatureShowcase` | `components/marketing/FeatureShowcase.tsx` | Grid of headline capabilities (`#features` anchor); inline SVG icons.             | _(none)_  | `app/page.tsx` |
| `CtaSection`      | `components/marketing/CtaSection.tsx`      | Closing "built on" stack strip (`#stack` anchor) + final Log in CTA band.         | _(none)_  | `app/page.tsx` |

## `/components/admin` — admin panel components (Phase 7)

Feature-scoped (§9.4): reusable within the admin panel, gated behind
`features.admin`. Super-admin surfaces additionally require `requireSuperAdmin()`.

| Component            | Location                                  | Purpose                                                              | Key Props                                                      | Used In                            |
| -------------------- | ----------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| `AdminNav`           | `components/admin/AdminNav.tsx`           | Admin tab nav; tabs show per the viewer's tier + flags.              | `isOrgAdmin`, `isSuperAdmin`, `multiTenant`, `paymentsEnabled` | `app/admin/layout.tsx`             |
| `TrialDaysForm`      | `components/admin/TrialDaysForm.tsx`      | Edit the platform-wide trial length (super-admin).                   | `initialTrialDays`                                             | `app/admin/settings/page.tsx`      |
| `PlanManager`        | `components/admin/PlanManager.tsx`        | Plan table with active toggle, edit, delete (super-admin).           | `plans`, `annualBilling`, `paymentsEnabled`                    | `app/admin/plans/page.tsx`         |
| `PlanFormDialog`     | `components/admin/PlanFormDialog.tsx`     | Create/edit-plan dialog form; price change mints a new Stripe Price. | `trigger`, `plan?`, `annualBilling`                            | `PlanManager`                      |
| `SubscriptionsTable` | `components/admin/SubscriptionsTable.tsx` | Cross-org subscriptions with cancel + refund (confirm dialogs).      | `rows`                                                         | `app/admin/subscriptions/page.tsx` |

## `/components/auth` — auth feature components (Phase 3)

Feature-scoped (§9.4): reusable within auth. Each reads `config/features.ts` and
renders only enabled methods, so they degrade gracefully when a flag is off.

| Component           | Location                                | Purpose                                                              | Key Props | Used In                       |
| ------------------- | --------------------------------------- | -------------------------------------------------------------------- | --------- | ----------------------------- |
| `LoginForm`         | `components/auth/LoginForm.tsx`         | Sign-in card: password + magic-link + OAuth, per enabled flags.      | `next?`   | `app/login/page.tsx`          |
| `SignupForm`        | `components/auth/SignupForm.tsx`        | Registration card: email/password + OAuth.                           | _(none)_  | `app/signup/page.tsx`         |
| `ResetPasswordForm` | `components/auth/ResetPasswordForm.tsx` | Dual-mode: request a reset link, or set a new password with a token. | `token?`  | `app/reset-password/page.tsx` |
| `MagicLinkForm`     | `components/auth/MagicLinkForm.tsx`     | Passwordless email link request.                                     | _(none)_  | `LoginForm`                   |
| `OAuthButtons`      | `components/auth/OAuthButtons.tsx`      | One button per enabled OAuth provider.                               | `next?`   | `LoginForm`, `SignupForm`     |
| `LogoutButton`      | `components/auth/LogoutButton.tsx`      | Clears the session and redirects to login.                           | _(none)_  | `app/dashboard/page.tsx`      |
| `AuthDivider`       | `components/auth/AuthDivider.tsx`       | Labelled "or" separator between method groups.                       | `label?`  | `LoginForm`, `SignupForm`     |

## `/components/org` — multi-tenant feature components (Phase 4)

Feature-scoped (§9.4): reusable within the org/multi-tenant surface, gated behind
`features.multiTenant`. Promote to `/components/shared` if a second, unrelated
feature needs the same pattern.

| Component            | Location                                | Purpose                                                    | Key Props                  | Used In                              |
| -------------------- | --------------------------------------- | ---------------------------------------------------------- | -------------------------- | ------------------------------------ |
| `CreateOrgForm`      | `components/org/CreateOrgForm.tsx`      | Create an org (POST `/api/org`) and switch to it.          | `onSuccess?`               | `WorkspaceSwitcher`                  |
| `InviteMemberForm`   | `components/org/InviteMemberForm.tsx`   | Invite a member by email + role to the active org (admin). | _(none)_                   | `app/settings/organization/page.tsx` |
| `MemberList`         | `components/org/MemberList.tsx`         | Roster with role change + remove (admin); self-row locked. | `members`, `currentUserId` | `app/settings/organization/page.tsx` |
| `PendingInvites`     | `components/org/PendingInvites.tsx`     | Pending invitations with a revoke action (admin).          | `invites`                  | `app/settings/organization/page.tsx` |
| `AcceptInviteButton` | `components/org/AcceptInviteButton.tsx` | Accept an invitation (POST `/api/org/invitations/accept`). | `token`                    | `app/invite/[token]/page.tsx`        |
