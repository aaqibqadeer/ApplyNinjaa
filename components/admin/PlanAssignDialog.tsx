"use client";

import { useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SUBSCRIPTION_STATUSES } from "@/lib/db/schema";

export interface AssignablePlan {
  id: string;
  name: string;
  slug: string;
}

export interface PlanAssignDialogProps {
  trigger: ReactNode;
  /** Active plans, read from the plans table — never a hardcoded list (§15). */
  plans: AssignablePlan[];
  organizationId: string;
  /** Label for the account being changed, e.g. an email or org name. */
  subjectLabel: string;
  /** Currently effective plan name, shown so the change is obvious. */
  currentPlanName?: string | null;
  /** Warn that a live Stripe subscription is deliberately left alone. */
  hasStripeSubscription?: boolean;
  /** Extra copy when the admin is changing their own account. */
  isSelf?: boolean;
  onAssigned: () => void;
}

const ASSIGNABLE_STATUSES = [
  SUBSCRIPTION_STATUSES.active,
  SUBSCRIPTION_STATUSES.trialing,
] as const;

/**
 * Super-admin plan grant. Posts to `/api/admin/subscriptions/plan`, which is
 * the authority — this only collects the plan, the status, and the audited
 * reason. Used from both the users table and the subscriptions table.
 */
export function PlanAssignDialog({
  trigger,
  plans,
  organizationId,
  subjectLabel,
  currentPlanName,
  hasStripeSubscription = false,
  isSelf = false,
  onAssigned,
}: PlanAssignDialogProps) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [status, setStatus] =
    useState<(typeof ASSIGNABLE_STATUSES)[number]>("active");
  const [reason, setReason] = useState("");

  async function assign() {
    const res = await fetch("/api/admin/subscriptions/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, planId, status, reason }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Could not change the plan");
    onAssigned();
  }

  return (
    <ConfirmDialog
      trigger={trigger}
      title={`Change plan for ${subjectLabel}`}
      description={
        currentPlanName
          ? `Currently on ${currentPlanName}. This grants the plan directly — it does not charge anyone.`
          : "This grants the plan directly — it does not charge anyone."
      }
      confirmLabel="Change plan"
      onConfirm={assign}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`plan-${organizationId}`}>Plan</Label>
          <Select
            id={`plan-${organizationId}`}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`status-${organizationId}`}>Status</Label>
          <Select
            id={`status-${organizationId}`}
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as (typeof ASSIGNABLE_STATUSES)[number])
            }
          >
            {ASSIGNABLE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={`plan-reason-${organizationId}`}>
            Reason (required, audited)
          </Label>
          <Input
            id={`plan-reason-${organizationId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Comped for a support case"
          />
        </div>

        {hasStripeSubscription && (
          <p className="border-destructive/40 bg-destructive/10 rounded-md border p-3 text-xs">
            This account has a live Stripe subscription. Changing the plan here
            does <strong>not</strong> change what Stripe bills them — cancel the
            subscription separately if they shouldn&apos;t be charged.
          </p>
        )}
        {isSelf && (
          <p className="text-muted-foreground text-xs">
            You&apos;re changing your own account. It will be recorded in the
            audit log like any other change.
          </p>
        )}
      </div>
    </ConfirmDialog>
  );
}
