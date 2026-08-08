/**
 * lib/payments/admin-plan.ts — super-admin plan assignment (§14, §15).
 *
 * A super admin can put ANY organization (including their own) on ANY plan.
 * This is a **local grant**: it writes the subscription row the entitlement
 * resolver reads (`getEffectivePlan`) and deliberately never calls Stripe.
 *
 * Why local-only: the paths this exists for are comping an account, fixing a
 * support case, and testing a tier on your own login — none of which should
 * move real money from an admin click, and all of which must work when the org
 * has no Stripe customer at all. The caller is told whether a live Stripe
 * subscription exists (`hadStripeSubscription`) so the UI can warn that
 * billing is unaffected; cancelling that subscription stays a separate,
 * explicit action (`/api/admin/subscriptions/cancel`).
 */

import {
  db,
  SUBSCRIPTION_STATUSES,
  type Plan,
  type Subscription,
  type SubscriptionStatus,
} from "@/lib/db";

export class PlanAssignmentError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PlanAssignmentError";
    this.status = status;
  }
}

export interface AssignPlanInput {
  organizationId: string;
  planId: string;
  /** Defaults to `active` — the state a granted plan should be in. */
  status?: SubscriptionStatus;
  /** For `trialing` grants; ignored otherwise. */
  currentPeriodEnd?: Date | null;
}

export interface AssignPlanResult {
  subscription: Subscription;
  plan: Plan;
  previousPlan: Plan | null;
  /** True when the org still has a Stripe subscription this did NOT touch. */
  hadStripeSubscription: boolean;
}

export async function assignPlan(
  input: AssignPlanInput,
): Promise<AssignPlanResult> {
  const [organization, plan] = await Promise.all([
    db.getOrganizationById(input.organizationId),
    db.getPlanById(input.planId),
  ]);
  if (!organization)
    throw new PlanAssignmentError("Organization not found", 404);
  if (!plan) throw new PlanAssignmentError("Plan not found", 404);
  if (!plan.isActive) {
    throw new PlanAssignmentError(
      `"${plan.name}" is deactivated — reactivate it before assigning it`,
    );
  }

  const status = input.status ?? SUBSCRIPTION_STATUSES.active;
  const existing = await db.getSubscriptionByOrg(input.organizationId);
  const previousPlan = existing ? await db.getPlanById(existing.planId) : null;

  const subscription = existing
    ? await db.updateSubscription(existing.id, {
        planId: plan.id,
        status,
        currentPeriodEnd: input.currentPeriodEnd ?? existing.currentPeriodEnd,
        // A granted plan is not "ending" — clear a pending cancellation so the
        // grant doesn't silently expire at the old period end.
        cancelAtPeriodEnd: false,
      })
    : await db.createSubscription({
        organizationId: input.organizationId,
        planId: plan.id,
        status,
        stripeCustomerId: organization.stripeCustomerId ?? null,
        stripeSubscriptionId: null,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: false,
      });

  return {
    subscription,
    plan,
    previousPlan,
    hadStripeSubscription: Boolean(existing?.stripeSubscriptionId),
  };
}
