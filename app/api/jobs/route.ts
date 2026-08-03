import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  createJob,
  estimateJob,
  jobCreateSchema,
  listJobs,
} from "@/lib/jobs/runner";

/** List the caller org's batch jobs (newest first), each with a `stale` flag. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const jobs = await listJobs(session);
    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/**
 * Create a batch job. With `{ estimateOnly: true }` returns `{ estimate }`
 * (AI-call count + remaining quota) without creating anything; otherwise creates
 * the row, schedules processing via `after()`, and returns `{ job }`
 * immediately. AI-backed types at their cap are rejected with 402.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const { estimateOnly, ...rest } = body;
    const parsed = jobCreateSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    if (estimateOnly === true) {
      const estimate = await estimateJob(session, parsed.data);
      return NextResponse.json({ ok: true, estimate });
    }
    const job = await createJob(session, parsed.data);
    return NextResponse.json({ ok: true, job });
  } catch (error) {
    return authErrorResponse(error);
  }
}
