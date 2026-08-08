"use client";

import { useRef, useState, type ChangeEvent } from "react";

import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { features } from "@/config/features";
import type { DocumentValue } from "@/lib/profiles/form-values";

const MAX_MB = 10;

const ACCEPT =
  ".pdf,.docx,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const KINDS = [
  {
    kind: "resume" as const,
    label: "CV / résumé",
    hint: "Attached when an application asks for a resume or CV.",
  },
  {
    kind: "cover_letter" as const,
    label: "Cover letter",
    hint: "Attached when an application has a cover-letter upload.",
  },
];

export interface ProfileDocumentsProps {
  documents: DocumentValue[];
  onChange: (documents: DocumentValue[]) => void;
}

/**
 * The CV and cover letter kept ON the profile, as opposed to the résumé that
 * is parsed once and discarded. The extension uploads these into a form's file
 * inputs, which is the whole reason the bytes are stored at all.
 *
 * Renders nothing when `storage` is off — same graceful degradation as
 * `FileUpload`, which this reuses the upload flow of (presigned/app-route PUT
 * via `/api/storage/upload-url`).
 */
export function ProfileDocuments({
  documents,
  onChange,
}: ProfileDocumentsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  if (!features.storage) return null;

  async function upload(kind: DocumentValue["kind"], file: File) {
    setError(null);
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`That file is over the ${MAX_MB} MB limit`);
      return;
    }
    setBusy(kind);
    try {
      const contentType = file.type || "application/octet-stream";
      const res = await fetch("/api/storage/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        key?: string;
        error?: string;
      };
      if (!res.ok || !data.url || !data.key) {
        setError(data.error ?? "Could not start the upload");
        return;
      }
      const put = await fetch(data.url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!put.ok) {
        setError("Upload failed");
        return;
      }
      // One document per kind — a second upload replaces the first.
      onChange([
        ...documents.filter((d) => d.kind !== kind),
        {
          kind,
          key: data.key,
          filename: file.name,
          contentType,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        },
      ]);
    } catch {
      setError("Something went wrong");
    } finally {
      setBusy(null);
      const input = inputs.current[kind];
      if (input) input.value = "";
    }
  }

  function onPick(
    kind: DocumentValue["kind"],
    e: ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (file) void upload(kind, file);
  }

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold">Documents</h2>
      <p className="text-muted-foreground mb-3 text-xs">
        PDF or DOCX, {MAX_MB}&nbsp;MB max. Unlike the résumé you parse to fill
        this profile, these files are stored — the extension attaches them when
        an application asks for an upload.
      </p>

      <div className="flex flex-col gap-3">
        {KINDS.map((entry) => {
          const current = documents.find((d) => d.kind === entry.kind);
          return (
            <div
              key={entry.kind}
              className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{entry.label}</p>
                {current ? (
                  <p className="text-muted-foreground truncate text-xs">
                    {current.filename} · {(current.size / 1024).toFixed(0)}
                    &nbsp;KB
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">{entry.hint}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {busy === entry.kind && <Spinner size="sm" label="Uploading" />}
                <input
                  ref={(el) => {
                    inputs.current[entry.kind] = el;
                  }}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => onPick(entry.kind, e)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => inputs.current[entry.kind]?.click()}
                >
                  {current ? "Replace" : "Upload"}
                </Button>
                {current && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      onChange(documents.filter((d) => d.kind !== entry.kind))
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-destructive mt-2 text-sm" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
