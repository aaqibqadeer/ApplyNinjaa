import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/shared/AppHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { features } from "@/config/features";
import { requireAuth } from "@/lib/auth/server";
import {
  hasAccess,
  lowestPlanWith,
  PLAN_FEATURES,
} from "@/lib/payments/access";

export const metadata: Metadata = { title: "Lead Directory" };

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const session = await requireAuth();

  if (!features.scraper.enabled) {
    return (
      <>
        <AppHeader session={session} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
          <EmptyState
            title="Lead Directory is not enabled"
            description="The lead-scraping product is turned off for this workspace."
          />
        </main>
      </>
    );
  }

  const canExport = await hasAccess(session, PLAN_FEATURES.dataExport);
  const exportPlan = canExport
    ? null
    : ((await lowestPlanWith(PLAN_FEATURES.dataExport))?.name ?? null);

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold">
              Lead Directory
            </h1>
            <p className="text-muted-foreground text-sm">
              Every captured business — filter, sort, edit inline, and export.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/leads/campaigns"
              className="text-muted-foreground hover:text-foreground"
            >
              Campaigns
            </Link>
            <Link
              href="/leads/settings"
              className="text-muted-foreground hover:text-foreground"
            >
              Custom fields
            </Link>
          </div>
        </div>

        <LeadsTable canExport={canExport} exportPlan={exportPlan} />
      </main>
    </>
  );
}
