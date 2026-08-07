"use client";

import Link from "next/link";
import { useState } from "react";

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

export interface PublicPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceAnnual: number | null;
  aiCallsPerMonth: number;
}

interface PricingSectionProps {
  plans: PublicPlan[];
  annualBilling: boolean;
}

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Public pricing cards — data comes from the plans table, never hardcoded. */
export function PricingSection({ plans, annualBilling }: PricingSectionProps) {
  const [annual, setAnnual] = useState(false);

  if (plans.length === 0) return null;

  return (
    <section id="pricing" className="bg-muted/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <h2 className="font-heading text-center text-3xl font-bold tracking-tight">
          Simple pricing
        </h2>
        <p className="text-muted-foreground mt-2 text-center text-sm">
          Every new account starts with a free trial — no card required.
        </p>

        {annualBilling && (
          <div className="mt-6 flex items-center justify-center gap-2 text-sm">
            <span className={annual ? "text-muted-foreground" : "font-medium"}>
              Monthly
            </span>
            <Switch
              checked={annual}
              onCheckedChange={setAnnual}
              aria-label="Annual pricing"
            />
            <span className={annual ? "font-medium" : "text-muted-foreground"}>
              Annual <span className="text-muted-foreground">(~20% off)</span>
            </span>
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const isFree = plan.priceMonthly === 0;
            const highlight = plan.slug === "pro";
            return (
              <Card
                key={plan.id}
                className={highlight ? "border-primary shadow-md" : ""}
              >
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {plan.name}
                    {highlight && <Badge>Popular</Badge>}
                  </CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-3xl font-semibold">
                    {isFree
                      ? "$0"
                      : annual && plan.priceAnnual !== null
                        ? dollars(plan.priceAnnual)
                        : dollars(plan.priceMonthly)}
                    <span className="text-muted-foreground text-sm font-normal">
                      {isFree ? "" : annual && plan.priceAnnual ? "/yr" : "/mo"}
                    </span>
                  </p>
                  <ul className="text-muted-foreground flex flex-col gap-1 text-sm">
                    <li>{plan.aiCallsPerMonth} AI actions / month</li>
                    <li>Unlimited tracked applications</li>
                    <li>All Valid Job filters</li>
                  </ul>
                  <Button
                    asChild
                    variant={highlight ? "default" : "outline"}
                    size="sm"
                  >
                    <Link href="/signup">
                      {isFree ? "Start free" : "Start with a free trial"}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
