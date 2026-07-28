import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authorize } from "@/lib/auth/roles";
import { getGmailAuthUrl } from "@/lib/gmail/oauth";

/** Start the separate read-only Gmail consent flow (redirects to Google). */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.gmail) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    await authorize();
    const url = await getGmailAuthUrl();
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
