import type { Metadata } from "next";

import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { AppShell } from "@/components/shared/AppShell";
import { requireAuth } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Get started" };

// Per-user page (reads the session cookie) — never statically prerendered.
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await requireAuth();
  return (
    <AppShell session={session}>
      <OnboardingWizard />
    </AppShell>
  );
}
