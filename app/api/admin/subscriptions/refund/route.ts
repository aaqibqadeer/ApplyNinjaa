import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { logAdminAction } from "@/lib/admin/audit";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { payments } from "@/lib/payments";

const schema = z.object({
  chargeId: z.string().min(1),
  // Optional partial refund amount in integer minor units (cents). Omitted =
  // full refund. The adapter re-validates amount <= charge total (§15).
  amount: z.number().int().positive().optional(),
  reason: z.string().min(3, "A reason is required"),
});

/**
 * Refund a charge, full or partial. Platform staff — support admins CAN issue
 * refunds (product spec §9). Reason is mandatory and audited.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.admin || !features.payments.enabled) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorize({ platformStaff: true });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { refundId } = await payments.refundSubscription(
      parsed.data.chargeId,
      parsed.data.amount,
    );
    await logAdminAction(session, {
      action: parsed.data.amount ? "refund_partial" : "refund_full",
      targetId: parsed.data.chargeId,
      reason: parsed.data.reason,
      metadata: { refundId, amount: parsed.data.amount ?? "full" },
    });
    return NextResponse.json({ ok: true, refundId });
  } catch (error) {
    return authErrorResponse(error);
  }
}
