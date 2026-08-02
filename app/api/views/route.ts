import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  createSavedView,
  listSavedViews,
  savedViewInputSchema,
} from "@/lib/leads/service";

/** The caller's saved views for the leads table. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const views = await listSavedViews(session);
    return NextResponse.json({ ok: true, views });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Save a new view. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = savedViewInputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const view = await createSavedView(session, parsed.data);
    return NextResponse.json({ ok: true, view });
  } catch (error) {
    return authErrorResponse(error);
  }
}
