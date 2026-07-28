import type { Metadata } from "next";

import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { AppHeader } from "@/components/shared/AppHeader";
import { requireAuth } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Get started" };

// Per-user page (reads the session cookie) — never statically prerendered.
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await requireAuth();
  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <OnboardingWizard />
      </main>
    </>
  );
}
