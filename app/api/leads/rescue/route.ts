import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { rescueLeads, rescueRequestSchema } from "@/lib/leads/ingest";
import { enforceAiRateLimits } from "@/lib/usage/enforce";

/**
 * Batch parse-rescue: repair the given lead ids, or (with no ids) drain the
 * needs-review queue up to `limit`. Each repaired record consumes one AI call
 * (quota enforced per record inside the service).
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    await enforceAiRateLimits(request, session);
    const parsed = rescueRequestSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const result = await rescueLeads(session, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
