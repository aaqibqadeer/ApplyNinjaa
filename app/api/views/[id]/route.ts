import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  deleteSavedView,
  savedViewPatchSchema,
  updateSavedView,
} from "@/lib/leads/service";

type Params = { params: Promise<{ id: string }> };

/** Edit a saved view. */
export async function PATCH(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    const parsed = savedViewPatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const view = await updateSavedView(session, id, parsed.data);
    return NextResponse.json({ ok: true, view });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Delete a saved view. */
export async function DELETE(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    await deleteSavedView(session, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
