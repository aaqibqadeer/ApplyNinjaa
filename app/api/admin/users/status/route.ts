import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { logAdminAction } from "@/lib/admin/audit";
import { setUserStatus } from "@/lib/admin/users";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { USER_STATUSES } from "@/lib/db/schema";

const schema = z.object({
  userId: z.string().min(1),
  status: z.enum([
    USER_STATUSES.active,
    USER_STATUSES.suspended,
    USER_STATUSES.banned,
  ]),
  reason: z.string().min(3, "A reason is required"),
});

/**
 * Suspend / ban / reactivate an account (super-admin only — support admins
 * can view users but not lock them out). Blocks login immediately; all data
 * is retained. Logged to the audit trail with the required reason.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.admin) {
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
    const { userId, status, reason } = parsed.data;
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: "You cannot change your own account status" },
        { status: 400 },
      );
    }
    const user = await setUserStatus(userId, status);
    await logAdminAction(session, {
      action:
        status === USER_STATUSES.banned
          ? "ban_user"
          : status === USER_STATUSES.suspended
            ? "suspend_user"
            : "unsuspend_user",
      targetUserId: userId,
      reason,
      metadata: { email: user.email, newStatus: status },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
