"use client";

import { useRef, useState, type ChangeEvent } from "react";

import { features } from "@/config/features";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/shared/Spinner";

export interface FileUploadResult {
  /** The stored object key — persist this to reference the file later. */
  key: string;
}

export interface FileUploadProps {
  /** Called after a successful upload with the stored object key. */
  onUploaded?: (result: FileUploadResult) => void;
  /** `accept` attribute for the file picker (e.g. "image/*"). */
  accept?: string;
  label?: string;
  /** Client-side size guard, in megabytes. */
  maxSizeMb?: number;
}

/**
 * Reusable presigned-URL file uploader (Phase 6). Requests a presigned PUT URL
 * from `/api/storage/upload-url`, uploads the bytes straight to storage, then
 * calls `onUploaded` with the object key. Renders nothing when `storage` is off,
 * so it degrades gracefully wherever it's dropped in.
 */
export function FileUpload({
  onUploaded,
  accept,
  label = "Upload a file",
  maxSizeMb = 25,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!features.storage) return null;

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setStatus(null);

    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`File exceeds the ${maxSizeMb} MB limit`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const contentType = file.type || "application/octet-stream";
    setBusy(true);
    try {
      const res = await fetch("/api/storage/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType }),
      });
      const data = (await res.json()) as {
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

      setStatus(`Uploaded ${file.name}`);
      onUploaded?.({ key: data.key });
    } catch {
      setError("Something went wrong");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="file-upload">{label}</Label>
      <input
        ref={inputRef}
        id="file-upload"
        type="file"
        accept={accept}
        disabled={busy}
        onChange={handleChange}
        className="border-input file:bg-secondary file:text-secondary-foreground text-muted-foreground rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1 file:text-sm"
      />
      {busy && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner size="sm" label="Uploading" />
          Uploading…
        </p>
      )}
      {status && !busy && (
        <p role="status" className="text-muted-foreground text-sm">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
