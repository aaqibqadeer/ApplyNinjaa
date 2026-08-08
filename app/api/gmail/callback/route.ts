import { NextResponse, type NextRequest } from "next/server";

import { features } from "@/config/features";
import { authorize } from "@/lib/auth/roles";
import { appUrl } from "@/lib/auth/urls";
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
    return NextResponse.redirect(appUrl("/settings/gmail?connected=1"));
  } catch (err) {
    console.error("[gmail callback] failed:", err);
    return NextResponse.redirect(appUrl("/settings/gmail?error=connect"));
  }
}
