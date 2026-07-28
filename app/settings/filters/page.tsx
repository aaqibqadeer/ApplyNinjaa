import type { Metadata } from "next";

import { FilterToggles } from "@/components/filters/FilterToggles";
import { AppHeader } from "@/components/shared/AppHeader";
import { requireAuth } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Job filters" };

export const dynamic = "force-dynamic";

export default async function FilterSettingsPage() {
  const session = await requireAuth();
  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
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
        <FilterToggles />
      </main>
    </>
  );
}
