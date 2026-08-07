import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { logAdminAction } from "@/lib/admin/audit";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { SUBSCRIPTION_STATUSES } from "@/lib/db/schema";
import { payments } from "@/lib/payments";

const schema = z.object({
  subscriptionId: z.string().min(1),
  stripeSubscriptionId: z.string().nullish(),
  reason: z.string().min(3, "A reason is required"),
});

/**
 * Cancel any subscription (super-admin only — distinct from ban/suspend; the
 * account keeps working and drops to Free). Reason is mandatory and audited.
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
    if (parsed.data.stripeSubscriptionId) {
      await payments.cancelSubscription(parsed.data.stripeSubscriptionId);
    }
    await db.updateSubscription(parsed.data.subscriptionId, {
      status: SUBSCRIPTION_STATUSES.canceled,
      cancelAtPeriodEnd: true,
    });
    await logAdminAction(session, {
      action: "cancel_subscription",
      targetId: parsed.data.subscriptionId,
      reason: parsed.data.reason,
      metadata: {
        stripeSubscriptionId: parsed.data.stripeSubscriptionId ?? null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
