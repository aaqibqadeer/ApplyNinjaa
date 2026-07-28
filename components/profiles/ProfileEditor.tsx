"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  ProfileForm,
  type ProfileFormValues,
} from "@/components/profiles/ProfileForm";

interface ProfileEditorProps {
  /** Omitted = create mode (POST); present = edit mode (PATCH). */
  profileId?: string;
  initial: ProfileFormValues;
}

/** Client wrapper that persists ProfileForm submissions and navigates back. */
export function ProfileEditor({ profileId, initial }: ProfileEditorProps) {
  const router = useRouter();

  async function onSubmit(values: ProfileFormValues) {
    const res = await fetch(
      profileId ? `/api/profiles/${profileId}` : "/api/profiles",
      {
        method: profileId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Could not save the profile");
    toast.success(profileId ? "Profile saved" : "Profile created");
    router.push("/profiles");
    router.refresh();
  }

  return (
    <ProfileForm
      initial={initial}
      submitLabel={profileId ? "Save changes" : "Create profile"}
      onSubmit={onSubmit}
    />
  );
}
