import { NextResponse } from "next/server";

import { features } from "@/config/features";
import {
  applicationInputSchema,
  listApplications,
  trackApplication,
} from "@/lib/applications/service";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";

/** The caller's tracked applications, newest first. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.jobApplications) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const applications = await listApplications(session);
    return NextResponse.json({ ok: true, applications });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Track a job (extension Track button / dashboard add). */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.jobApplications) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = applicationInputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const application = await trackApplication(session, parsed.data);
    return NextResponse.json({ ok: true, application });
  } catch (error) {
    return authErrorResponse(error);
  }
}
