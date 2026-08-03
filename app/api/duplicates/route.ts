import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { listDuplicatesForReview } from "@/lib/leads/merge";

/**
 * List duplicate candidates for review (default `status=pending`), each with both
 * leads hydrated so the UI can render a side-by-side field diff.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const status =
      new URL(request.url).searchParams.get("status") ?? "pending";
    const candidates = await listDuplicatesForReview(session, status);
    return NextResponse.json({ ok: true, candidates });
  } catch (error) {
    return authErrorResponse(error);
  }
}
