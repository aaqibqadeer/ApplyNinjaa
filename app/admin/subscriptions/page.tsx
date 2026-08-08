import { notFound } from "next/navigation";

import {
  SubscriptionsTable,
  type SubscriptionRow,
} from "@/components/admin/SubscriptionsTable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { features } from "@/config/features";
import { requirePlatformStaff } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { payments } from "@/lib/payments";

export const dynamic = "force-dynamic";

/**
 * Cross-user subscription list — refunds for platform staff, cancel for super
 * admins only (§15, product spec §9).
 * 404s when payments is off (subscriptions only exist with payments).
 */
export default async function AdminSubscriptionsPage() {
  const session = await requirePlatformStaff();
  if (!features.payments.enabled) notFound();

  const [subscriptions, allPlans] = await Promise.all([
    db.listSubscriptions(),
    db.listPlans(),
  ]);
  // Plan names/prices are admin-editable — the picker reads the table (§15).
  const plans = session.user.isSuperAdmin
    ? allPlans
        .filter((plan) => plan.isActive)
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.priceMonthly - b.priceMonthly,
        )
        .map((plan) => ({ id: plan.id, name: plan.name, slug: plan.slug }))
    : [];

  const rows: SubscriptionRow[] = await Promise.all(
    subscriptions.map(async (sub) => {
      const [org, plan] = await Promise.all([
        db.getOrganizationById(sub.organizationId),
        db.getPlanById(sub.planId),
      ]);
      const charge = sub.stripeCustomerId
        ? await payments.getLatestCharge(sub.stripeCustomerId)
        : null;
      return {
        id: sub.id,
        organizationId: sub.organizationId,
        orgName: org?.name ?? "(unknown)",
        planName: plan?.name ?? "(unknown)",
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd
          ? sub.currentPeriodEnd.toISOString()
          : null,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        stripeSubscriptionId: sub.stripeSubscriptionId ?? null,
        chargeId: charge?.chargeId ?? null,
        chargeAmount: charge?.amount ?? null,
        currency: charge?.currency ?? null,
      };
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscriptions</CardTitle>
        <CardDescription>
          Every organization&apos;s subscription. Cancel or refund below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SubscriptionsTable
          rows={rows}
          isSuperAdmin={session.user.isSuperAdmin}
          plans={plans}
        />
      </CardContent>
    </Card>
  );
}
