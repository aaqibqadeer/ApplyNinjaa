import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  createUserFilter,
  listFiltersForUser,
  userFilterInputSchema,
} from "@/lib/filters/service";

/** The caller's visible filters (active admin defaults + own), with toggles. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.jobApplications) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const filters = await listFiltersForUser(session);
    return NextResponse.json({ ok: true, filters });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Add a custom (per-user) filter. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.jobApplications) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = userFilterInputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const filter = await createUserFilter(session, parsed.data);
    return NextResponse.json({ ok: true, filter });
  } catch (error) {
    return authErrorResponse(error);
  }
}
