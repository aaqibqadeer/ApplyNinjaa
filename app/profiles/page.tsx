import type { Metadata } from "next";
import Link from "next/link";

import { ProfileList } from "@/components/profiles/ProfileList";
import { AppHeader } from "@/components/shared/AppHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/server";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Profiles" };

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const session = await requireAuth();
  const profiles = await db.listProfilesForUser(session.user.id);

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold">Profiles</h1>
            <p className="text-muted-foreground text-sm">
              Separate profiles for separate tracks (e.g. “Frontend” vs
              “Backend/AI”) — pick one in the extension before autofilling.
            </p>
          </div>
          <Button asChild>
            <Link href="/profiles/new">New profile</Link>
          </Button>
        </div>

        {profiles.length === 0 ? (
          <EmptyState
            title="No profiles yet"
            description="Upload your resume to create your first profile."
            action={
              <Button asChild size="sm">
                <Link href="/onboarding">Start setup</Link>
              </Button>
            }
          />
        ) : (
          <ProfileList
            profiles={profiles.map((p) => ({
              id: p.id,
              name: p.name,
              isDefault: p.isDefault,
              updatedAt: p.updatedAt.toISOString(),
            }))}
          />
        )}
      </main>
    </>
  );
}
