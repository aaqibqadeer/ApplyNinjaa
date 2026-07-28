"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Plan } from "@/lib/db/schema";

export interface PlanFormDialogProps {
  trigger: ReactNode;
  /** Present = edit mode; absent = create mode. */
  plan?: Plan;
  annualBilling: boolean;
}

function centsToDollars(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}
function dollarsToCents(value: string): number {
  return Math.round((parseFloat(value) || 0) * 100);
}

/** Create/edit a pricing plan (super-admin). A price change mints a new Stripe
 * Price server-side (§15). Prices are entered in dollars, stored as cents. */
export function PlanFormDialog({
  trigger,
  plan,
  annualBilling,
}: PlanFormDialogProps) {
  const editing = Boolean(plan);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slug, setSlug] = useState(plan?.slug ?? "");
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [priceMonthly, setPriceMonthly] = useState(
    centsToDollars(plan?.priceMonthly ?? 0),
  );
  const [priceAnnual, setPriceAnnual] = useState(
    centsToDollars(plan?.priceAnnual),
  );
  const [annualDiscount, setAnnualDiscount] = useState(
    plan?.annualDiscountPercent != null
      ? String(plan.annualDiscountPercent)
      : "",
  );
  const [sortOrder, setSortOrder] = useState(String(plan?.sortOrder ?? 0));
  const [limits, setLimits] = useState(
    JSON.stringify(plan?.limits ?? {}, null, 2),
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    let parsedLimits: Record<string, unknown>;
    try {
      parsedLimits = JSON.parse(limits || "{}") as Record<string, unknown>;
    } catch {
      setError("Limits must be valid JSON");
      return;
    }

    const body: Record<string, unknown> = {
      name,
      description: description.trim() || null,
      priceMonthly: dollarsToCents(priceMonthly),
      priceAnnual:
        annualBilling && priceAnnual ? dollarsToCents(priceAnnual) : null,
      annualDiscountPercent:
        annualBilling && annualDiscount ? Number(annualDiscount) : null,
      limits: parsedLimits,
      sortOrder: Number(sortOrder) || 0,
    };
    // Slug is create-only (the stable lookup key) — never sent on edit.
    if (editing && plan) body.id = plan.id;
    else body.slug = slug.trim().toLowerCase();

    setLoading(true);
    try {
      const res = await fetch("/api/admin/plans", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save the plan");
        return;
      }
      toast.success(editing ? "Plan updated" : "Plan created");
      setOpen(false);
      window.location.reload();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit plan" : "New plan"}</DialogTitle>
          <DialogDescription>
            Prices are in dollars.{" "}
            {annualBilling ? "" : "Annual billing is off."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {!editing && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-slug">Slug</Label>
              <Input
                id="plan-slug"
                required
                placeholder="e.g. pro"
                pattern="[a-z0-9-]+"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-name">Name</Label>
            <Input
              id="plan-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-desc">Description</Label>
            <Input
              id="plan-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="plan-monthly">Monthly ($)</Label>
              <Input
                id="plan-monthly"
                type="number"
                min={0}
                step="0.01"
                required
                value={priceMonthly}
                onChange={(e) => setPriceMonthly(e.target.value)}
              />
            </div>
            {annualBilling && (
              <>
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor="plan-annual">Annual ($)</Label>
                  <Input
                    id="plan-annual"
                    type="number"
                    min={0}
                    step="0.01"
                    value={priceAnnual}
                    onChange={(e) => setPriceAnnual(e.target.value)}
                  />
                </div>
                <div className="flex w-24 flex-col gap-2">
                  <Label htmlFor="plan-discount">Disc %</Label>
                  <Input
                    id="plan-discount"
                    type="number"
                    min={0}
                    max={100}
                    value={annualDiscount}
                    onChange={(e) => setAnnualDiscount(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-sort">Sort order</Label>
            <Input
              id="plan-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-limits">Limits (JSON)</Label>
            <textarea
              id="plan-limits"
              rows={4}
              value={limits}
              onChange={(e) => setLimits(e.target.value)}
              className="border-input bg-background rounded-md border px-3 py-2 font-mono text-xs"
            />
          </div>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : editing ? "Save changes" : "Create plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
