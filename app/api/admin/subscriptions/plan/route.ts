import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { logAdminAction } from "@/lib/admin/audit";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { subscriptionStatusSchema } from "@/lib/db/schema";
import { assignPlan } from "@/lib/payments/admin-plan";

const schema = z.object({
  organizationId: z.string().min(1),
  planId: z.string().min(1),
  status: subscriptionStatusSchema.optional(),
  reason: z.string().min(3, "A reason is required"),
});

/**
 * Put an organization on a plan (super-admin only, §14). A local grant — it
 * never calls Stripe; see lib/payments/admin-plan.ts for why.
 *
 * A super admin may target their OWN organization: changing your own tier to
 * reproduce a bug or verify an entitlement is the whole point, and the audit
 * row records it exactly like any other target.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.admin || !features.payments.enabled) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorize({ superAdmin: true });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const result = await assignPlan({
      organizationId: parsed.data.organizationId,
      planId: parsed.data.planId,
      status: parsed.data.status,
    });

    await logAdminAction(session, {
      action: "plan_assign",
      targetId: parsed.data.organizationId,
      reason: parsed.data.reason,
      metadata: {
        planId: result.plan.id,
        planSlug: result.plan.slug,
        planName: result.plan.name,
        previousPlanName: result.previousPlan?.name ?? null,
        status: result.subscription.status,
        // Recorded because the grant deliberately left Stripe alone — this is
        // the flag a later billing question gets answered from.
        stripeSubscriptionUntouched: result.hadStripeSubscription,
        selfAssigned:
          result.subscription.organizationId === session.organizationId,
      },
    });

    return NextResponse.json({
      ok: true,
      subscription: result.subscription,
      hadStripeSubscription: result.hadStripeSubscription,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
