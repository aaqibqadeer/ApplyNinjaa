"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ProfileForm } from "@/components/profiles/ProfileForm";
import { ResumeUpload } from "@/components/profiles/ResumeUpload";
import { Button } from "@/components/ui/button";
import type {
  ParsedResumeValues,
  ProfileFormValues,
} from "@/lib/profiles/form-values";

interface ProfileEditorProps {
  /** Omitted = create mode (POST); present = edit mode (PATCH). */
  profileId?: string;
  initial: ProfileFormValues;
}

/** Client wrapper that persists ProfileForm submissions and navigates back. */
export function ProfileEditor({ profileId, initial }: ProfileEditorProps) {
  const router = useRouter();
  const [values, setValues] = useState<ProfileFormValues>(initial);
  // Bumped on every parse so ProfileForm remounts with the merged values —
  // it owns its own draft state, which a prop change alone wouldn't replace.
  const [formKey, setFormKey] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);

  function onParsed(parsed: ParsedResumeValues) {
    setValues((current) => ({ ...current, ...parsed }));
    setFormKey((k) => k + 1);
    setUploadOpen(false);
    toast.success("Résumé read — review the fields below before saving");
  }

  async function onSubmit(next: ProfileFormValues) {
    const res = await fetch(
      profileId ? `/api/profiles/${profileId}` : "/api/profiles",
      {
        method: profileId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      },
    );
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Could not save the profile");
    toast.success(profileId ? "Profile saved" : "Profile created");
    router.push("/profiles");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="border-border rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Fill from a résumé</h2>
            <p className="text-muted-foreground text-xs">
              Reads a PDF or DOCX and fills the fields below (1 AI action). Your
              profile name, job preferences and EEO answers are left alone.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setUploadOpen((open) => !open)}
          >
            {uploadOpen ? "Cancel" : "Upload résumé"}
          </Button>
        </div>
        {uploadOpen && (
          <div className="mt-4">
            <ResumeUpload
              onParsed={onParsed}
              title="Click to choose a résumé"
              description="PDF or DOCX, 5 MB max"
            />
          </div>
        )}
      </section>

      <ProfileForm
        key={formKey}
        initial={values}
        submitLabel={profileId ? "Save changes" : "Create profile"}
        onSubmit={onSubmit}
      />
    </div>
  );
}
