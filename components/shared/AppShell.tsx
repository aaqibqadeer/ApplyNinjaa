import type { ReactNode } from "react";

import { AppSidebar } from "@/components/shared/AppSidebar";
import type { AppNavLink } from "@/components/shared/AppNav";
import {
  WorkspaceSwitcher,
  type WorkspaceOption,
} from "@/components/shared/WorkspaceSwitcher";
import { features } from "@/config/features";
import type { Session } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { ORG_ROLES } from "@/lib/db/schema";

interface AppShellProps {
  session: Session;
  children: ReactNode;
}

/**
 * Layout for every signed-in page: the left navigation rail plus a `<main>`
 * that takes all the remaining width (pages therefore no longer wrap their own
 * content in a max-width column).
 *
 * Server component: it derives the nav links from the active flags + the
 * viewer's role, and — only when `multiTenant` is on — resolves the user's
 * workspaces for the switcher, so no DB call happens in a single-tenant fork.
 */
export async function AppShell({ session, children }: AppShellProps) {
  const isOrgAdmin = session.role === ORG_ROLES.admin;
  const isSuperAdmin = session.user.isSuperAdmin;

  const links: AppNavLink[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/profiles", label: "Profiles" },
    { href: "/settings/filters", label: "Filters" },
    ...(features.gmail ? [{ href: "/settings/gmail", label: "Gmail" }] : []),
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
    <div className="flex flex-1 flex-col md:flex-row">
      <AppSidebar
        links={links}
        userEmail={session.user.email}
        workspaceSwitcher={
          features.multiTenant && workspaces.length > 0 ? (
            <WorkspaceSwitcher
              organizations={workspaces}
              activeOrgId={session.organizationId}
            />
          ) : null
        }
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10">
        {children}
      </main>
    </div>
  );
}
