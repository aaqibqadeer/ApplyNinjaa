import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { retrackApplication, retrackSchema } from "@/lib/applications/service";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";

type Params = { params: Promise<{ id: string }> };

/**
 * Attach the current page to an application the user already tracks — the
 * same job seen on another site, or the post-submit confirmation page.
 * Costs no AI action. Re-adding a known URL is a no-op, not an error.
 */
export async function POST(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  if (!features.jobApplications) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    const parsed = retrackSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const application = await retrackApplication(session, id, parsed.data.url);
    return NextResponse.json({ ok: true, application });
  } catch (error) {
    return authErrorResponse(error);
  }
}
