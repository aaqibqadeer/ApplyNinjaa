import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import {
  PricingSection,
  type PublicPlan,
} from "@/components/marketing/PricingSection";
import { Testimonials } from "@/components/marketing/Testimonials";
import { SiteFooter } from "@/components/shared/SiteFooter";
import { SiteHeader } from "@/components/shared/SiteHeader";
import { features } from "@/config/features";
import { db } from "@/lib/db";
import { getAiCallCap } from "@/lib/usage/enforce";

export const dynamic = "force-dynamic";

/**
 * Public landing page (product spec §11): hero → how it works → pricing
 * (from the plans table — never hardcoded) → testimonials → footer with
 * legal links. Pricing degrades to hidden if the DB isn't reachable, so the
 * page never hard-fails.
 */
export default async function Home() {
  let plans: PublicPlan[] = [];
  try {
    const active = await db.listActivePlans();
    plans = active.map((plan) => ({
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      description: plan.description ?? null,
      priceMonthly: plan.priceMonthly,
      priceAnnual: plan.priceAnnual ?? null,
      aiCallsPerMonth: getAiCallCap(plan),
    }));
  } catch {
    // No DB configured (fresh fork) — render the page without pricing.
  }

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <PricingSection
          plans={plans}
          annualBilling={features.payments.annualBilling}
        />
        <Testimonials />
      </main>
      <SiteFooter />
    </div>
  );
}
