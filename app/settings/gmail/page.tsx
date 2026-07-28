import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GmailScanPanel } from "@/components/gmail/GmailScanPanel";
import { AppHeader } from "@/components/shared/AppHeader";
import { features } from "@/config/features";
import { requireAuth } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Gmail scan" };

export const dynamic = "force-dynamic";

export default async function GmailSettingsPage() {
  if (!features.gmail) notFound();
  const session = await requireAuth();

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-semibold">Gmail scan</h1>
          <p className="text-muted-foreground text-sm">
            Scan your inbox for interview invites, rejections, offers, and
            assessments — then approve which tracked applications to update.
          </p>
        </div>
        <GmailScanPanel />
      </main>
    </>
  );
}
