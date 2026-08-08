import type { Metadata } from "next";

import { FilterToggles } from "@/components/filters/FilterToggles";
import { AppShell } from "@/components/shared/AppShell";
import { requireAuth } from "@/lib/auth/server";
import {
  hasAccess,
  lowestPlanWith,
  PLAN_FEATURES,
} from "@/lib/payments/access";

export const metadata: Metadata = { title: "Job filters" };

export const dynamic = "force-dynamic";

export default async function FilterSettingsPage() {
  const session = await requireAuth();
  const canAddCustom = await hasAccess(session, PLAN_FEATURES.customFilters);
  const requiredPlan = canAddCustom
    ? null
    : ((await lowestPlanWith(PLAN_FEATURES.customFilters))?.name ?? null);
  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-semibold">
            Valid Job filters
          </h1>
          <p className="text-muted-foreground text-sm">
            Every enabled filter gets a Yes / No / Neutral badge when the
            extension analyzes a job posting. Toggle the defaults and add your
            own deal-breakers.
          </p>
        </div>
        <FilterToggles
          canAddCustom={canAddCustom}
          requiredPlan={requiredPlan}
        />
      </div>
    </AppShell>
  );
}
