import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { cancelJob } from "@/lib/jobs/runner";

type Params = { params: Promise<{ id: string }> };

/** Cancel a queued/running job. The runner re-reads status each chunk and stops. */
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
    const job = await cancelJob(session, id);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return authErrorResponse(error);
  }
}
