"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface AdminFilter {
  id: string;
  label: string;
  description: string | null;
  isActive: boolean;
}

/** Super-admin CRUD over the Valid Job filter master list. */
export function AdminFilterManager() {
  const [filters, setFilters] = useState<AdminFilter[] | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/filters");
      if (res.ok) {
        const data = (await res.json()) as { filters: AdminFilter[] };
        setFilters(data.filters);
      }
    })();
  }, []);

  async function add() {
    const res = await fetch("/api/admin/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: newLabel.trim(),
        description: newDescription.trim() || null,
      }),
    });
    const data = (await res.json()) as { filter?: AdminFilter; error?: string };
    if (!res.ok || !data.filter) {
      toast.error(data.error ?? "Could not add the filter");
      return;
    }
    setFilters((rows) => [...(rows ?? []), data.filter!]);
    setNewLabel("");
    setNewDescription("");
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch("/api/admin/filters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Could not update the filter");
      return false;
    }
    return true;
  }

  async function remove(id: string) {
    const res = await fetch("/api/admin/filters", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not delete the filter");
    }
    setFilters((rows) => rows?.filter((f) => f.id !== id) ?? null);
  }

  if (!filters) {
    return <p className="text-muted-foreground text-sm">Loading filters…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {filters.map((filter) => (
          <li
            key={filter.id}
            className="border-border flex flex-col gap-2 rounded-lg border p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <Input
                className="h-8 max-w-sm"
                defaultValue={filter.label}
                onBlur={(e) => {
                  if (e.target.value !== filter.label) {
                    void patch(filter.id, { label: e.target.value });
                  }
                }}
              />
              <div className="flex shrink-0 items-center gap-2">
                <ConfirmDialog
                  destructive
                  title={`Delete "${filter.label}"?`}
                  description="Users lose this default filter (their toggle settings for it are removed too)."
                  confirmLabel="Delete"
                  onConfirm={() => remove(filter.id)}
                  trigger={
                    <Button variant="ghost" size="sm">
                      Delete
                    </Button>
                  }
                />
                <Switch
                  checked={filter.isActive}
                  aria-label={`Toggle ${filter.label}`}
                  onCheckedChange={(isActive) => {
                    setFilters(
                      (rows) =>
                        rows?.map((f) =>
                          f.id === filter.id ? { ...f, isActive } : f,
                        ) ?? null,
                    );
                    void patch(filter.id, { isActive });
                  }}
                />
              </div>
            </div>
            <Input
              className="h-8"
              placeholder="AI guidance (optional) — what should the classifier look for?"
              defaultValue={filter.description ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (filter.description ?? "")) {
                  void patch(filter.id, {
                    description: e.target.value || null,
                  });
                }
              }}
            />
          </li>
        ))}
      </ul>

      <div className="border-border flex flex-col gap-2 rounded-lg border border-dashed p-3">
        <Input
          placeholder="New default filter label"
          value={newLabel}
          maxLength={120}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        <Input
          placeholder="AI guidance (optional)"
          value={newDescription}
          maxLength={500}
          onChange={(e) => setNewDescription(e.target.value)}
        />
        <Button
          className="self-start"
          size="sm"
          disabled={!newLabel.trim()}
          onClick={() => void add()}
        >
          Add default filter
        </Button>
      </div>
    </div>
  );
}
