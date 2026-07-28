/**
 * scripts/sync-plans.ts — mint/refresh Stripe Products & Prices for every plan
 * (`npm run sync:plans`).
 *
 * Separate from `seed.ts` on purpose: seeding is DB-only and needs no Stripe
 * keys; this script needs `STRIPE_SECRET_KEY` (+ payments flag on) and is run
 * once per environment (and re-run after price edits made outside the admin
 * UI — the admin UI already syncs on save). Honors Price immutability via
 * `syncStripePrices` (new Price, archive old, relink). Requires the
 * annual-billing flag for annual prices to be minted.
 */

import "./load-env";
import { features } from "@/config/features";
import { db } from "@/lib/db";
import { syncStripePrices } from "@/lib/payments/plans";

async function main(): Promise<void> {
  if (!features.payments.enabled) {
    throw new Error(
      "payments is off — set NEXT_PUBLIC_FEATURE_PAYMENTS=1 and Stripe keys first",
    );
  }

  const plans = await db.listPlans();
  if (plans.length === 0) {
    throw new Error("No plans found — run `npm run seed` first");
  }

  for (const plan of plans) {
    if (plan.priceMonthly <= 0) {
      console.log(`- ${plan.name} (${plan.slug}): free plan, no Stripe ids`);
      continue;
    }
    const ids = await syncStripePrices(plan, {
      name: plan.name,
      priceMonthly: plan.priceMonthly,
      priceAnnual: plan.priceAnnual ?? null,
    });
    await db.updatePlan(plan.id, ids);
    console.log(
      `- ${plan.name} (${plan.slug}): product=${ids.stripeProductId} monthly=${ids.stripePriceIdMonthly} annual=${ids.stripePriceIdAnnual ?? "—"}`,
    );
  }

  await db.disconnect?.();
  console.log("Stripe plan sync complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Sync failed:", error);
    process.exit(1);
  });
