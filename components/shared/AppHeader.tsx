import Link from "next/link";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { AppNav, type AppNavLink } from "@/components/shared/AppNav";
import { BrandMark } from "@/components/shared/BrandMark";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import {
  WorkspaceSwitcher,
  type WorkspaceOption,
} from "@/components/shared/WorkspaceSwitcher";
import { APP_NAME } from "@/config/brand";
import { features } from "@/config/features";
import type { Session } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { ORG_ROLES } from "@/lib/db/schema";

interface AppHeaderProps {
  session: Session;
}

/**
 * Global navigation bar for signed-in pages (dashboard, org settings, admin).
 * Server component: it derives the nav links from the active flags + the
 * viewer's role, and — only when `multiTenant` is on — resolves the user's
 * workspaces for the switcher (so no DB call happens in a single-tenant fork).
 */
export async function AppHeader({ session }: AppHeaderProps) {
  const isOrgAdmin = session.role === ORG_ROLES.admin;
  const isSuperAdmin = session.user.isSuperAdmin;

  const links: AppNavLink[] = [
    ...(features.jobApplications
      ? [
          { href: "/dashboard", label: "Dashboard" },
          { href: "/profiles", label: "Profiles" },
          { href: "/settings/filters", label: "Filters" },
        ]
      : []),
    // Gmail is a job-application surface, so it needs both flags on.
    ...(features.gmail && features.jobApplications
      ? [{ href: "/settings/gmail", label: "Gmail" }]
      : []),
    ...(features.scraper.enabled
      ? [
          { href: "/leads", label: "Leads" },
          { href: "/leads/campaigns", label: "Campaigns" },
        ]
      : []),
    ...(features.payments.enabled
      ? [{ href: "/settings/billing", label: "Billing" }]
      : []),
    { href: "/settings/account", label: "Account" },
    { href: "/help", label: "Help" },
    ...(features.multiTenant && isOrgAdmin
      ? [{ href: "/settings/organization", label: "Organization" }]
      : []),
    // Platform staff only — org-admin no longer opens the (platform) admin
    // panel in this fork; see app/admin/layout.tsx.
    ...(features.admin && (isSuperAdmin || session.user.isSupportAdmin)
      ? [{ href: "/admin", label: "Admin" }]
      : []),
  ];

  let workspaces: WorkspaceOption[] = [];
  if (features.multiTenant) {
    const memberships = await db.listMembershipsForUser(session.user.id);
    const orgs = await Promise.all(
      memberships.map((m) => db.getOrganizationById(m.organizationId)),
    );
    workspaces = orgs
      .filter((org): org is NonNullable<typeof org> => org !== null)
      .map((org) => ({ id: org.id, name: org.name }));
  }

  return (
    <header className="border-border bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-6">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2 font-semibold"
        >
          <BrandMark />
          <span className="hidden sm:inline">{APP_NAME}</span>
        </Link>

        <AppNav links={links} className="hidden md:flex" />

        <div className="ml-auto flex items-center gap-3">
          {features.multiTenant && workspaces.length > 0 && (
            <WorkspaceSwitcher
              organizations={workspaces}
              activeOrgId={session.organizationId}
            />
          )}
          <span className="text-muted-foreground hidden text-sm lg:inline">
            {session.user.email}
          </span>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>

      {/* Links move below the bar on narrow screens so they never collide with
          the workspace switcher / sign-out controls. */}
      {links.length > 1 && (
        <div className="border-border border-t px-4 py-2 md:hidden">
          <AppNav links={links} />
        </div>
      )}
    </header>
  );
}
