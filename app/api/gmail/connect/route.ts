import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authorize } from "@/lib/auth/roles";
import { getGmailAuthUrl } from "@/lib/gmail/oauth";
import { hasAccess, PLAN_FEATURES } from "@/lib/payments/access";

/** Start the separate read-only Gmail consent flow (redirects to Google). */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.gmail) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  let session;
  try {
    session = await authorize();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // Checked before Google consent, not after: sending a locked user through
  // an OAuth grant they can't use would leave them holding a Gmail token for
  // a feature their plan blocks. This is a browser redirect, so it upsells
  // rather than throwing EntitlementError's 402 JSON.
  if (!(await hasAccess(session, PLAN_FEATURES.gmailScan))) {
    return NextResponse.redirect(
      new URL("/settings/billing?locked=gmailScan", request.url),
    );
  }
  try {
    const url = await getGmailAuthUrl();
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(new URL("/settings/gmail?error=1", request.url));
  }
}
