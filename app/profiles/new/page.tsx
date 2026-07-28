import type { Metadata } from "next";

import { ProfileEditor } from "@/components/profiles/ProfileEditor";
import { AppHeader } from "@/components/shared/AppHeader";
import { requireAuth } from "@/lib/auth/server";
import { emptyProfileValues } from "@/lib/profiles/form-values";

export const metadata: Metadata = { title: "New profile" };

export const dynamic = "force-dynamic";

export default async function NewProfilePage() {
  const session = await requireAuth();
  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="font-heading mb-6 text-2xl font-semibold">
          New profile
        </h1>
        <ProfileEditor initial={{ ...emptyProfileValues, name: "" }} />
      </main>
    </>
  );
}
