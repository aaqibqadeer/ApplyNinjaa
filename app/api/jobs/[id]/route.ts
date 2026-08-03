import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { getJob } from "@/lib/jobs/runner";

type Params = { params: Promise<{ id: string }> };

/** A single batch job by id (org-scoped), with its derived `stale` flag. */
export async function GET(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    const job = await getJob(session, id);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return authErrorResponse(error);
  }
}
