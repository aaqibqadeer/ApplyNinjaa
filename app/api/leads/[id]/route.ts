import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  deleteLead,
  getLead,
  leadPatchSchema,
  updateLead,
} from "@/lib/leads/service";

type Params = { params: Promise<{ id: string }> };

/** A single lead by id (org-scoped). */
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
    const lead = await getLead(session, id);
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Inline edit of an editable lead field. */
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
    const parsed = leadPatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const lead = await updateLead(session, id, parsed.data);
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Soft-delete a lead. */
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
    await deleteLead(session, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
