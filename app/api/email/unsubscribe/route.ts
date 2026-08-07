import { NextResponse, type NextRequest } from "next/server";

import { APP_NAME } from "@/config/brand";
import { db } from "@/lib/db";

/**
 * One-click marketing unsubscribe (CAN-SPAM). Token-authenticated — it must
 * work from an email link without a session. Transactional email is not
 * affected. Re-enable anytime from account settings.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const user = await db.getUserByUnsubscribeToken(token);
  if (!user) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }
  if (user.marketingEmailsEnabled) {
    await db.updateUser(user.id, { marketingEmailsEnabled: false });
  }
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Unsubscribed</title>
<body style="font-family:ui-sans-serif,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center"><h1 style="font-size:20px">You're unsubscribed</h1>
<p style="color:#6b7280;font-size:14px">${APP_NAME} will no longer send you marketing emails.<br>
Transactional emails (receipts, security notices) still apply.<br>
You can re-enable marketing emails in account settings.</p></div></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
