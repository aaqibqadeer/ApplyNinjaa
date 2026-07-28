import { NextResponse, type NextRequest } from "next/server";

import { isAnyAuthEnabled } from "@/config/features";
import { DEFAULT_AUTHED_PATH, LOGIN_PATH } from "@/lib/auth/constants";
import { consumeVerificationToken } from "@/lib/auth/verification";

/**
 * Clicked from the verification email. Marks the account verified (idempotent),
 * starts the Pro trial when eligible, and redirects into the app.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAnyAuthEnabled) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(
      new URL(`${LOGIN_PATH}?error=verify`, request.url),
    );
  }
  const user = await consumeVerificationToken(token);
  if (!user) {
    return NextResponse.redirect(
      new URL(`${LOGIN_PATH}?error=verify`, request.url),
    );
  }
  return NextResponse.redirect(
    new URL(`${DEFAULT_AUTHED_PATH}?verified=1`, request.url),
  );
}
