import { NextResponse } from "next/server";

import { isAnyAuthEnabled } from "@/config/features";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { sendVerificationEmail } from "@/lib/auth/verification";

/** Re-send the verification email to the signed-in (unverified) user. */
export async function POST(): Promise<NextResponse> {
  if (!isAnyAuthEnabled) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorize();
    if (session.user.emailVerified) {
      return NextResponse.json(
        { error: "Email is already verified" },
        { status: 400 },
      );
    }
    await sendVerificationEmail(session.user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
