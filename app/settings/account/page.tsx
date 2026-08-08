import type { Metadata } from "next";

import { AccountSettings } from "@/components/account/AccountSettings";
import { AppShell } from "@/components/shared/AppShell";
import { requireAuth } from "@/lib/auth/server";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Account" };

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const session = await requireAuth();
  const user = await db.getUserById(session.user.id);

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-semibold">Account</h1>
          <p className="text-muted-foreground text-sm">
            Email preferences and account deletion.
          </p>
        </div>
        <AccountSettings
          email={session.user.email}
          marketingEmailsEnabled={user?.marketingEmailsEnabled ?? true}
        />
      </div>
    </AppShell>
  );
}
