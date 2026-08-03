import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { ingestBatchSchema, ingestLeads } from "@/lib/leads/ingest";

/**
 * Capture ingest (Bearer, extension). Upserts by clientCaptureId, writes
 * provenance, bumps the campaign count, marks parse-flagged records
 * needs_review, and rescues up to 25 of them inline.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = ingestBatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const result = await ingestLeads(session, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
