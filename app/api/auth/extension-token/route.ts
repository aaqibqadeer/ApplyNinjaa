import { NextResponse } from "next/server";

import { isAnyAuthEnabled } from "@/config/features";
import {
  EXTENSION_TOKEN_TTL_SECONDS,
  TOKEN_PURPOSE,
} from "@/lib/auth/constants";
import { signToken } from "@/lib/auth/jwt";
import { authErrorResponse, authorize } from "@/lib/auth/roles";

/**
 * One-time token exchange for the Chrome extension: cookie-authed (the
 * extension fetches with credentials + host_permissions, so the session cookie
 * rides along), returns a long-lived Bearer token with purpose `extension`
 * that the extension stores in chrome.storage.local.
 */
export async function POST(): Promise<NextResponse> {
  if (!isAnyAuthEnabled) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorize();
    const token = await signToken(
      { sub: session.user.id, purpose: TOKEN_PURPOSE.extension },
      EXTENSION_TOKEN_TTL_SECONDS,
    );
    const expiresAt = new Date(
      Date.now() + EXTENSION_TOKEN_TTL_SECONDS * 1000,
    ).toISOString();
    return NextResponse.json({ ok: true, token, expiresAt });
  } catch (error) {
    return authErrorResponse(error);
  }
}
