import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { db, USER_STATUSES } from "@/lib/db";

/**
 * Self-service account deletion (product spec §12): starts the 30-day
 * recoverable soft delete and signs the user out. The hard-delete script
 * permanently removes PII after the window; contact support within 30 days
 * to restore.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const session = await authorize();
    await db.updateUser(session.user.id, {
      status: USER_STATUSES.pending_deletion,
      deletedAt: new Date(),
    });
    await auth.signOut();
    return NextResponse.json({ ok: true, redirect: "/" });
  } catch (error) {
    return authErrorResponse(error);
  }
}
