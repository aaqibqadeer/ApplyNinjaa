"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Spinner } from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ExclusionRow {
  id: string;
  kind: "company" | "keyword";
  value: string;
}

export interface ExclusionListsProps {
  /** Same entitlement as custom filters; the service is what enforces it. */
  canEdit?: boolean;
  /** Plan name that unlocks exclusions, for the upsell line. */
  requiredPlan?: string | null;
}

const LISTS = [
  {
    kind: "company" as const,
    title: "Excluded companies",
    hint: "Matched against the company on the posting and the site it's hosted on, so “Acme” also catches “Acme, Inc.” and acme.com.",
    placeholder: "Acme",
  },
  {
    kind: "keyword" as const,
    title: "Excluded keywords",
    hint: "Matched as whole words in the job title and description — “unpaid”, “commission only”, “clearance”.",
    placeholder: "unpaid",
  },
];

/**
 * The two hard blocklists behind the Valid Job filters. Unlike a filter, an
 * exclusion never asks the AI anything: matching happens in code, so the
 * extension can warn before the user spends an AI action on a page.
 */
export function ExclusionLists({
  canEdit = true,
  requiredPlan,
}: ExclusionListsProps = {}) {
  const [rows, setRows] = useState<ExclusionRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/exclusions");
      if (res.ok) {
        const data = (await res.json()) as { exclusions: ExclusionRow[] };
        setRows(data.exclusions);
      } else {
        setRows([]);
      }
    })();
  }, []);

  async function add(kind: ExclusionRow["kind"]) {
    const value = (drafts[kind] ?? "").trim();
    if (!value) return;
    setBusy(kind);
    try {
      const res = await fetch("/api/exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        exclusion?: ExclusionRow;
        error?: string;
      };
      if (!res.ok || !data.exclusion) {
        toast.error(data.error ?? "Could not add that exclusion");
        return;
      }
      const added = data.exclusion;
      setRows((current) => {
        const list = current ?? [];
        // The API is idempotent by (kind, value) — don't double-render a re-add.
        return list.some((row) => row.id === added.id)
          ? list
          : [...list, added];
      });
      setDrafts((d) => ({ ...d, [kind]: "" }));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/exclusions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((current) => current?.filter((row) => row.id !== id) ?? null);
    } else {
      toast.error("Could not remove that exclusion");
    }
  }

  if (!rows) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner size="sm" label="Loading exclusions" />
        Loading exclusions…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {LISTS.map((list) => {
        const items = rows.filter((row) => row.kind === list.kind);
        return (
          <section key={list.kind} className="flex flex-col gap-2">
            <div>
              <h3 className="text-sm font-medium">{list.title}</h3>
              <p className="text-muted-foreground text-xs">{list.hint}</p>
            </div>

            {items.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="border-border bg-muted/40 flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-3 text-sm"
                  >
                    <span className="max-w-56 truncate">{item.value}</span>
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`Remove ${item.value}`}
                        className="text-muted-foreground hover:bg-background hover:text-foreground rounded-full px-1.5 leading-none"
                        onClick={() => void remove(item.id)}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <div className="flex gap-2">
                <Input
                  placeholder={list.placeholder}
                  maxLength={120}
                  value={drafts[list.kind] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [list.kind]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void add(list.kind);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    busy === list.kind || !(drafts[list.kind] ?? "").trim()
                  }
                  onClick={() => void add(list.kind)}
                >
                  Add
                </Button>
              </div>
            )}
          </section>
        );
      })}

      {!canEdit && (
        <p className="text-muted-foreground text-sm">
          <Link href="/settings/billing" className="text-primary underline">
            Upgrade
          </Link>{" "}
          to keep your own exclusion lists
          {requiredPlan ? ` (${requiredPlan} and above)` : ""}.
        </p>
      )}
    </div>
  );
}
