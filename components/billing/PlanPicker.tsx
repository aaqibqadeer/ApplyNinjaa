"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export interface PlanCardData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceAnnual: number | null;
  aiCallsPerMonth: number;
}

interface PlanPickerProps {
  plans: PlanCardData[];
  currentPlanSlug: string;
  /** Whether annual pricing is enabled (feature flag + data present). */
  annualBilling: boolean;
}

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Plan cards with a monthly/annual toggle; paid picks go to Stripe Checkout. */
export function PlanPicker({
  plans,
  currentPlanSlug,
  annualBilling,
}: PlanPickerProps) {
  const [annual, setAnnual] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  async function choose(plan: PlanCardData) {
    setBusySlug(plan.slug);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          cadence: annual && plan.priceAnnual ? "annual" : "monthly",
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not start checkout");
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {annualBilling && (
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={annual}
            onCheckedChange={setAnnual}
            aria-label="Annual billing"
          />
          Annual billing{" "}
          <span className="text-muted-foreground text-xs">(save ~20%)</span>
        </label>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.slug === currentPlanSlug;
          const isFree = plan.priceMonthly === 0;
          const price =
            annual && plan.priceAnnual !== null
              ? `${dollars(plan.priceAnnual)}/yr`
              : `${dollars(plan.priceMonthly)}/mo`;
          return (
            <Card key={plan.id} className={isCurrent ? "border-primary" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {plan.name}
                  {isCurrent && <Badge variant="secondary">Current</Badge>}
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-2xl font-semibold">{isFree ? "$0" : price}</p>
                <p className="text-muted-foreground text-xs">
                  {plan.aiCallsPerMonth} AI actions / month
                </p>
                {!isFree && !isCurrent && (
                  <Button
                    size="sm"
                    disabled={busySlug !== null}
                    onClick={() => void choose(plan)}
                  >
                    {busySlug === plan.slug ? "Redirecting…" : "Upgrade"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
