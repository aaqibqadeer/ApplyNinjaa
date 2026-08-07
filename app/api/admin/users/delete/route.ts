import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { logAdminAction } from "@/lib/admin/audit";
import { softDeleteUser } from "@/lib/admin/users";
import { authErrorResponse, authorize } from "@/lib/auth/roles";

const schema = z.object({
  userId: z.string().min(1),
  reason: z.string().min(3, "A reason is required"),
});

/**
 * Trigger full account deletion (super-admin only — explicitly NOT available
 * to support admins). Starts the 30-day recoverable soft-delete window; the
 * hard-delete script permanently removes PII afterwards.
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
    const { userId, reason } = parsed.data;
    if (userId === session.user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account from here" },
        { status: 400 },
      );
    }
    const user = await softDeleteUser(userId);
    await logAdminAction(session, {
      action: "delete_user",
      targetUserId: userId,
      reason,
      metadata: { email: user.email, softDeletedAt: user.deletedAt },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
