/**
 * lib/payments/access.ts — plan resolution + feature gating (§15).
 *
 * `getEffectivePlan(session)` is the single quota/entitlement resolver: the
 * org's live subscription (with lazy local-trial expiry applied), else the
 * Free plan. Every cap/entitlement read goes through it so "no subscription
 * row" always means Free — never "locked out".
 *
 * `hasAccess(session, feature)` answers the boolean "is this feature
 * available?" from the effective plan's `limits` JSON. It ALWAYS returns true
 * when payments is off, so feature-gating call sites never need their own
 * payments-on/off branch — this is the one place that knows about the flag.
 */

import { features } from "@/config/features";
import {
  db,
  PLAN_SLUGS,
  SUBSCRIPTION_STATUSES,
  type Plan,
  type Subscription,
} from "@/lib/db";
import type { Session } from "@/lib/auth/types";

import { applyLazyTrialExpiry } from "./trials";

export type PlanSource = "paid" | "trial" | "free";

export interface EffectivePlan {
  plan: Plan;
  /** The live subscription row, or null when resolved to the Free fallback. */
  subscription: Subscription | null;
  source: PlanSource;
}

export async function getEffectivePlan(session: Session): Promise<EffectivePlan> {
  const organizationId = session.organizationId;

  if (features.payments.enabled && organizationId) {
    let subscription = await db.getSubscriptionByOrg(organizationId);
    if (subscription) {
      subscription = await applyLazyTrialExpiry(subscription);
      const isLive =
        subscription.status === SUBSCRIPTION_STATUSES.active ||
        subscription.status === SUBSCRIPTION_STATUSES.trialing;
      if (isLive) {
        const plan = await db.getPlanById(subscription.planId);
        if (plan?.isActive) {
          return {
            plan,
            subscription,
            source:
              subscription.status === SUBSCRIPTION_STATUSES.trialing
                ? "trial"
                : "paid",
          };
        }
      }
    }
  }

  const freePlan = await db.getPlanBySlug(PLAN_SLUGS.free);
  if (!freePlan) {
    throw new Error(
      'The "free" plan is missing — run the seed script (npm run seed)',
    );
  }
  return { plan: freePlan, subscription: null, source: "free" };
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string")
    return value.length > 0 && value !== "false" && value !== "0";
  // A non-empty object/array counts as "present" (e.g. an enabled feature blob).
  if (value && typeof value === "object") return true;
  return false;
}

export async function hasAccess(
  session: Session,
  feature: string,
): Promise<boolean> {
  if (!features.payments.enabled) return true;
  const { plan } = await getEffectivePlan(session);
  return toBoolean(plan.limits?.[feature]);
}
