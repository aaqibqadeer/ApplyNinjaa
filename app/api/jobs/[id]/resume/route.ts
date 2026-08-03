import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { resumeJob } from "@/lib/jobs/runner";

type Params = { params: Promise<{ id: string }> };

/**
 * Re-queue a stale/failed/canceled job and start it again. The passes are
 * idempotent enough to re-run safely. AI-backed types re-check quota (402).
 */
export async function POST(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    const job = await resumeJob(session, id);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return authErrorResponse(error);
  }
}
