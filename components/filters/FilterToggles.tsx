"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface FilterRow {
  id: string;
  label: string;
  type: "admin" | "user";
  description: string | null;
  enabled: boolean;
}

export interface FilterTogglesProps {
  /**
   * Whether the viewer's plan includes custom filters. The add-row is hidden
   * when false; `lib/filters/service.ts` is what actually enforces it.
   */
  canAddCustom?: boolean;
  /** Plan name that unlocks custom filters, for the upsell line. */
  requiredPlan?: string | null;
}

/**
 * The user's Valid Job filter list: admin defaults + own custom filters as
 * toggles, plus add/remove of custom ones. Used by onboarding step 4 and the
 * filter settings page.
 */
export function FilterToggles({
  canAddCustom = true,
  requiredPlan,
}: FilterTogglesProps = {}) {
  const [filters, setFilters] = useState<FilterRow[] | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/filters");
      if (res.ok) {
        const data = (await res.json()) as { filters: FilterRow[] };
        setFilters(data.filters);
      }
    })();
  }, []);

  async function toggle(id: string, enabled: boolean) {
    setFilters(
      (rows) => rows?.map((r) => (r.id === id ? { ...r, enabled } : r)) ?? null,
    );
    const res = await fetch(`/api/filters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      toast.error("Could not update the filter");
      setFilters(
        (rows) =>
          rows?.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)) ??
          null,
      );
    }
  }

  async function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    try {
      const res = await fetch("/api/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = (await res.json()) as { filter?: FilterRow; error?: string };
      if (!res.ok || !data.filter) {
        toast.error(data.error ?? "Could not add the filter");
        return;
      }
      setFilters((rows) => [
        ...(rows ?? []),
        { ...data.filter!, enabled: true },
      ]);
      setNewLabel("");
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/filters/${id}`, { method: "DELETE" });
    if (res.ok) {
      setFilters((rows) => rows?.filter((r) => r.id !== id) ?? null);
    } else {
      toast.error("Could not remove the filter");
    }
  }

  if (!filters) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner size="sm" label="Loading filters" />
        Loading filters…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {filters.map((filter) => (
          <li
            key={filter.id}
            className="border-border flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{filter.label}</p>
              {filter.description && (
                <p className="text-muted-foreground truncate text-xs">
                  {filter.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {filter.type === "user" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(filter.id)}
                >
                  Remove
                </Button>
              )}
              <Switch
                checked={filter.enabled}
                onCheckedChange={(enabled) => void toggle(filter.id, enabled)}
                aria-label={`Toggle ${filter.label}`}
              />
            </div>
          </li>
        ))}
      </ul>

      {!canAddCustom ? (
        <p className="text-muted-foreground text-sm">
          Want to screen for your own deal-breakers?{" "}
          <Link href="/settings/billing" className="text-primary underline">
            Upgrade
          </Link>{" "}
          to add custom filters
          {requiredPlan ? ` (${requiredPlan} and above)` : ""}.
        </p>
      ) : (
        <div className="flex gap-2">
          <Input
            placeholder="Add your own filter, e.g. “401k match mentioned”"
            value={newLabel}
            maxLength={120}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addCustom();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={adding || !newLabel.trim()}
            onClick={() => void addCustom()}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
