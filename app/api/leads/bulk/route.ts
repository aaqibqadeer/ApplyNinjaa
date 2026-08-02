import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { bulkAction, bulkActionSchema } from "@/lib/leads/service";

/** Bulk lead actions: set-status / delete / add|remove-campaign / mark-junk. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = bulkActionSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const affected = await bulkAction(session, parsed.data);
    return NextResponse.json({ ok: true, affected });
  } catch (error) {
    return authErrorResponse(error);
  }
}
