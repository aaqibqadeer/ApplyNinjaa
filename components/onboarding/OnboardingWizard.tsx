"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { FilterToggles } from "@/components/filters/FilterToggles";
import {
  emptyProfileValues,
  ProfileForm,
  type ProfileFormValues,
} from "@/components/profiles/ProfileForm";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { APP_NAME } from "@/config/brand";

const STEPS = [
  "Welcome",
  "Upload resume",
  "Review profile",
  "Job filters",
  "Done",
] as const;

/**
 * 5-step onboarding (product spec §1): welcome/install → resume upload +
 * DeepSeek parse → review & edit (EEO behind explicit consent) → Valid Job
 * filters → success. The uploaded file itself is never stored — only the
 * parsed data the user approves in step 3.
 */
export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [initialValues, setInitialValues] =
    useState<ProfileFormValues>(emptyProfileValues);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onFileChosen(file: File) {
    setParseError(null);
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ai/parse-resume", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        parsed?: Omit<ProfileFormValues, "name" | "eeo" | "workAuthorization" | "workArrangement" | "employmentTypes" | "salaryExpectation"> & Record<string, unknown>;
        error?: string;
      };
      if (!res.ok || !data.parsed) {
        setParseError(data.error ?? "Could not read that resume");
        return;
      }
      setInitialValues({
        ...emptyProfileValues,
        ...data.parsed,
        name: "Primary",
      });
      setStep(2);
    } catch {
      setParseError("Something went wrong — try again");
    } finally {
      setParsing(false);
    }
  }

  async function saveProfile(values: ProfileFormValues) {
    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(data.error ?? "Could not save your profile");
    }
    setStep(3);
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8">
        <div className="text-muted-foreground mb-2 flex justify-between text-xs">
          <span>
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </span>
          <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
        </div>
        <Progress
          value={((step + 1) / STEPS.length) * 100}
          aria-label="Onboarding progress"
        />
      </div>

      {step === 0 && (
        <div className="flex flex-col items-start gap-4">
          <h1 className="font-heading text-2xl font-semibold">
            Welcome to {APP_NAME}
          </h1>
          <p className="text-muted-foreground text-sm">
            Two minutes of setup and you&apos;ll never re-type your work
            history into a job application again. First: install the Chrome
            extension — it&apos;s where the magic happens (job screening, fit
            scores, and one-click autofill on any job site).
          </p>
          <div className="border-border bg-card w-full rounded-lg border p-4 text-sm">
            <p className="font-medium">Install the extension</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Open <span className="font-mono">chrome://extensions</span>,
              enable Developer mode, and load the ApplyNinjaa extension. You
              can also do this later — everything else works from this
              dashboard.
            </p>
          </div>
          <Button onClick={() => setStep(1)}>Continue</Button>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col items-start gap-4">
          <h1 className="font-heading text-2xl font-semibold">
            Upload your resume
          </h1>
          <p className="text-muted-foreground text-sm">
            PDF or DOCX, 5&nbsp;MB max. We read it once to build your profile,
            then discard the file — only the structured data you approve in
            the next step is stored.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFileChosen(file);
            }}
          />
          {parsing ? (
            <div
              className="border-border w-full rounded-lg border border-dashed p-10 text-center"
              role="status"
            >
              <p className="text-sm font-medium">Reading your resume…</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Extracting your experience, skills, and education.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="border-border hover:bg-accent/40 w-full cursor-pointer rounded-lg border border-dashed p-10 text-center transition-colors"
            >
              <p className="text-sm font-medium">
                Click to choose your resume
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                PDF or DOCX
              </p>
            </button>
          )}
          {parseError && (
            <p className="text-destructive text-sm" role="alert">
              {parseError}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button variant="outline" onClick={() => setStep(2)}>
              Skip — start from a blank profile
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold">
              Review your profile
            </h1>
            <p className="text-muted-foreground text-sm">
              Everything below is editable — fix anything the parser got
              wrong. This becomes the profile the extension fills
              applications from.
            </p>
          </div>
          <ProfileForm
            initial={initialValues}
            submitLabel="Save & continue"
            onSubmit={saveProfile}
          />
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="font-heading text-2xl font-semibold">
              Set your Valid Job filters
            </h1>
            <p className="text-muted-foreground text-sm">
              When you open a job posting, the extension checks it against
              every enabled filter and shows a Yes / No / Neutral badge for
              each — so you spot deal-breakers (like no visa sponsorship)
              before wasting an application.
            </p>
          </div>
          <FilterToggles />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => setStep(4)}>Continue</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-start gap-4">
          <h1 className="font-heading text-2xl font-semibold">
            You&apos;re all set 🎉
          </h1>
          <p className="text-muted-foreground text-sm">
            Open any job posting, click the ApplyNinjaa icon, and watch it
            screen the job, score your fit, and fill the application. Your
            tracked applications will show up on the dashboard.
          </p>
          <Button onClick={() => router.push("/dashboard")}>
            Go to my dashboard
          </Button>
        </div>
      )}
    </div>
  );
}
