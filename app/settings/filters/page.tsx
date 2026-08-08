import type { Metadata } from "next";

import { ExclusionLists } from "@/components/filters/ExclusionLists";
import { FilterToggles } from "@/components/filters/FilterToggles";
import { AppShell } from "@/components/shared/AppShell";
import { requireAuth } from "@/lib/auth/server";
import {
  hasAccess,
  lowestPlanWith,
  PLAN_FEATURES,
} from "@/lib/payments/access";

export const metadata: Metadata = { title: "Job filters & exclusions" };

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

        <div className="border-border mt-10 border-t pt-8">
          <div className="mb-6">
            <h2 className="font-heading text-xl font-semibold">Exclusions</h2>
            <p className="text-muted-foreground text-sm">
              Hard rules, not questions for the AI. Anything on these lists gets
              a warning in the extension the moment you open the page — before
              you spend an AI action on it.
            </p>
          </div>
          <ExclusionLists canEdit={canAddCustom} requiredPlan={requiredPlan} />
        </div>
      </div>
    </AppShell>
  );
}
