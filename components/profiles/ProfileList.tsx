"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ProfileListItem {
  id: string;
  name: string;
  isDefault: boolean;
  updatedAt: string;
}

interface ProfileListProps {
  profiles: ProfileListItem[];
}

/** The user's profiles with edit / set-default / delete actions. */
export function ProfileList({ profiles }: ProfileListProps) {
  const router = useRouter();

  async function setDefault(id: string) {
    const res = await fetch(`/api/profiles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (res.ok) router.refresh();
    else toast.error("Could not set the default profile");
  }

  async function remove(id: string) {
    const res = await fetch(`/api/profiles/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not delete the profile");
    }
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-2">
      {profiles.map((profile) => (
        <li
          key={profile.id}
          className="border-border flex items-center justify-between gap-3 rounded-lg border p-4"
        >
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium">{profile.name}</p>
            {profile.isDefault && <Badge variant="secondary">Default</Badge>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!profile.isDefault && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void setDefault(profile.id)}
              >
                Make default
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`/profiles/${profile.id}`}>Edit</Link>
            </Button>
            <ConfirmDialog
              title={`Delete "${profile.name}"?`}
              description="Its parsed resume data (including any EEO answers) is permanently removed."
              confirmLabel="Delete"
              destructive
              onConfirm={() => remove(profile.id)}
              trigger={
                <Button variant="ghost" size="sm">
                  Delete
                </Button>
              }
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
