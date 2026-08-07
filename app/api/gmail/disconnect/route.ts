import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { deleteGmailConnection } from "@/lib/gmail/store";

/** Remove the stored (encrypted) Gmail refresh token. */
export async function POST(): Promise<NextResponse> {
  if (!features.gmail) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorize();
    await deleteGmailConnection(session.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
