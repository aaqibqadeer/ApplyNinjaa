import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { getGmailConnection } from "@/lib/gmail/store";
import { db } from "@/lib/db";

/** Connection state + past scans for the Gmail settings page. */
export async function GET(): Promise<NextResponse> {
  if (!features.gmail) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorize();
    const [connection, scans] = await Promise.all([
      getGmailConnection(session.user.id),
      db.listGmailScansForUser(session.user.id),
    ]);
    return NextResponse.json({ ok: true, connection, scans });
  } catch (error) {
    return authErrorResponse(error);
  }
}
