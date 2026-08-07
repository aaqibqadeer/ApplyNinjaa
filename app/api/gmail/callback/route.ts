import { NextResponse, type NextRequest } from "next/server";

import { features } from "@/config/features";
import { authorize } from "@/lib/auth/roles";
import { completeGmailOAuth } from "@/lib/gmail/oauth";

/** Google redirects here after Gmail consent. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!features.gmail) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  try {
    const session = await authorize();
    if (!code) throw new Error("Missing code");
    await completeGmailOAuth(session.user.id, code, state);
    return NextResponse.redirect(new URL("/settings/gmail?connected=1", request.url));
  } catch {
    return NextResponse.redirect(new URL("/settings/gmail?error=connect", request.url));
  }
}
