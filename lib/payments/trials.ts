/**
 * lib/payments/trials.ts — trial logic.
 *
 * ApplyNinjaa's trial is a LOCAL, no-credit-card trial on the Starter plan:
 * it starts when a
 * user verifies their email (one trial per verified email, `users.trial_used_at`)
 * as a `trialing` subscription row with no Stripe ids, and lazily downgrades to
 * Free when it expires (`applyLazyTrialExpiry`, called from the plan resolver —
 * no cron). The trial length is `app_settings.trialDays` (admin-editable, §8 —
 * never hardcoded); 0 disables trials.
 *
 * The legacy card-based Stripe trial (`trial_end` at checkout) is deliberately
 * disabled — `lib/payments/checkout.ts` always passes `trialEnd: null`.
 */

import { features } from "@/config/features";
import {
  db,
  PLAN_SLUGS,
  SUBSCRIPTION_STATUSES,
  type Subscription,
} from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which plan the free trial grants. Starter, not Pro: the trial exists to
 * prove the product works, and handing out the high-volume tier for a week
 * both costs more in AI calls and makes Starter look pointless afterwards.
 */
const TRIAL_PLAN_SLUG = PLAN_SLUGS.starter;

/**
 * Legacy helper (still called at org creation to stamp `org.trialEndsAt`).
 * Harmless metadata now — checkout no longer forwards it to Stripe.
 */
export async function resolveTrialEndsAt(): Promise<Date | null> {
  if (!features.payments.enabled) return null;
  const settings = await db.getAppSettings();
  if (!settings.trialDays || settings.trialDays <= 0) return null;
  return new Date(Date.now() + settings.trialDays * DAY_MS);
}

/**
 * Start the no-card trial for a freshly verified user, if eligible: never
 * trialed before, no existing subscription on their org, payments on, a
 * positive trial length configured, and the trial plan active.
 * Returns the created subscription or null when not eligible.
 */
export async function startTrialIfEligible(
  userId: string,
  organizationId: string,
): Promise<Subscription | null> {
  if (!features.payments.enabled) return null;

  const user = await db.getUserById(userId);
  if (!user || user.trialUsedAt) return null;

  const existing = await db.getSubscriptionByOrg(organizationId);
  if (existing) return null;

  const settings = await db.getAppSettings();
  if (!settings.trialDays || settings.trialDays <= 0) return null;

  const trialPlan = await db.getPlanBySlug(TRIAL_PLAN_SLUG);
  if (!trialPlan || !trialPlan.isActive) return null;

  const subscription = await db.createSubscription({
    organizationId,
    planId: trialPlan.id,
    status: SUBSCRIPTION_STATUSES.trialing,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    // The trial-end lives in currentPeriodEnd — no extra schema field needed.
    currentPeriodEnd: new Date(Date.now() + settings.trialDays * DAY_MS),
    cancelAtPeriodEnd: false,
  });
  await db.updateUser(userId, { trialUsedAt: new Date() });
  return subscription;
}

/**
 * Lazily expire a local (no-Stripe) trial: if it's `trialing` with no
 * `stripeSubscriptionId` and past its end, mark it canceled so the caller
 * falls through to the Free plan. Returns the up-to-date subscription.
 * Stripe-managed trials are left alone — the webhook owns their state.
 */
export async function applyLazyTrialExpiry(
  subscription: Subscription,
): Promise<Subscription> {
  const isLocalTrial =
    subscription.status === SUBSCRIPTION_STATUSES.trialing &&
    !subscription.stripeSubscriptionId;
  if (
    isLocalTrial &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd.getTime() < Date.now()
  ) {
    return db.updateSubscription(subscription.id, {
      status: SUBSCRIPTION_STATUSES.canceled,
    });
  }
  return subscription;
}
