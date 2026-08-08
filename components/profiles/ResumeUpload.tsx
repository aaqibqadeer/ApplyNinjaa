"use client";

import { useRef, useState } from "react";

import { Spinner } from "@/components/shared/Spinner";
import type { ParsedResumeValues } from "@/lib/profiles/form-values";

/** Mirrors MAX_RESUME_BYTES in lib/profiles/resume-text.ts. */
const MAX_MB = 5;

const ACCEPT =
  ".pdf,.docx,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface ResumeUploadProps {
  /** Called with the parsed fields once the AI has read the file. */
  onParsed: (parsed: ParsedResumeValues) => void;
  /** Shown inside the drop target when idle. */
  title?: string;
  description?: string;
}

/**
 * Résumé (PDF/DOCX) → parsed profile fields, via `/api/ai/parse-resume`
 * (one AI action). Shared by onboarding step 2 and the profile editor.
 *
 * Parsing a PDF server-side routinely takes ten seconds or more, so the busy
 * state is a real spinner with progress copy — the previous static line read
 * as a frozen page.
 */
export function ResumeUpload({
  onParsed,
  title = "Click to choose your résumé",
  description = "PDF or DOCX",
}: ResumeUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChosen(file: File) {
    setError(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`That file is over the ${MAX_MB} MB limit`);
      return;
    }
    setParsing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ai/parse-resume", {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        parsed?: ParsedResumeValues;
        error?: string;
      };
      if (!res.ok || !data.parsed) {
        setError(data.error ?? "Could not read that résumé");
        return;
      }
      onParsed(data.parsed);
    } catch {
      setError("Something went wrong — try again");
    } finally {
      setParsing(false);
      // Let the same file be re-picked after an error.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFileChosen(file);
        }}
      />

      {parsing ? (
        <div className="border-border flex w-full flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
          <Spinner size="lg" label="Reading your résumé" />
          <div>
            <p className="text-sm font-medium">Reading your résumé…</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Extracting your experience, skills, and education. This usually
              takes a few seconds.
            </p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="border-border hover:bg-accent/40 w-full cursor-pointer rounded-lg border border-dashed p-10 text-center transition-colors"
        >
          <p className="text-sm font-medium">{title}</p>
          <p className="text-muted-foreground mt-1 text-xs">{description}</p>
        </button>
      )}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
