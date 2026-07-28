import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfileEditor } from "@/components/profiles/ProfileEditor";
import type { ProfileFormValues } from "@/components/profiles/ProfileForm";
import { AppHeader } from "@/components/shared/AppHeader";
import { requireAuth } from "@/lib/auth/server";
import { getProfile, type OwnedProfile } from "@/lib/profiles/service";

export const metadata: Metadata = { title: "Edit profile" };

export const dynamic = "force-dynamic";

function toFormValues(profile: OwnedProfile): ProfileFormValues {
  return {
    name: profile.name,
    contact: profile.contact,
    summary: profile.summary ?? null,
    skills: profile.skills,
    experience: profile.experience.map((e) => ({
      ...e,
      current: e.current ?? false,
    })),
    education: profile.education,
    links: profile.links,
    workAuthorization: profile.workAuthorization ?? null,
    workArrangement: profile.workArrangement ?? null,
    employmentTypes: profile.employmentTypes,
    salaryExpectation: profile.salaryExpectation ?? null,
    eeo: profile.eeo
      ? {
          consent: true,
          gender: profile.eeo.gender,
          raceEthnicity: profile.eeo.raceEthnicity,
          veteranStatus: profile.eeo.veteranStatus,
          disabilityStatus: profile.eeo.disabilityStatus,
        }
      : null,
  };
}

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();
  const { id } = await params;

  let profile: OwnedProfile;
  try {
    profile = await getProfile(session, id);
  } catch {
    notFound();
  }

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="font-heading mb-6 text-2xl font-semibold">
          Edit “{profile.name}”
        </h1>
        <ProfileEditor profileId={profile.id} initial={toFormValues(profile)} />
      </main>
    </>
  );
}
