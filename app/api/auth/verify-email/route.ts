import { NextResponse, type NextRequest } from "next/server";

import { isAnyAuthEnabled } from "@/config/features";
import { DEFAULT_AUTHED_PATH, LOGIN_PATH } from "@/lib/auth/constants";
import { appUrl } from "@/lib/auth/urls";
import { consumeVerificationToken } from "@/lib/auth/verification";

/**
 * Clicked from the verification email. Marks the account verified (idempotent),
 * starts the free trial when eligible, and redirects into the app.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAnyAuthEnabled) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(appUrl(`${LOGIN_PATH}?error=verify`));
  }
  const user = await consumeVerificationToken(token);
  if (!user) {
    return NextResponse.redirect(appUrl(`${LOGIN_PATH}?error=verify`));
  }
  return NextResponse.redirect(appUrl(`${DEFAULT_AUTHED_PATH}?verified=1`));
}
