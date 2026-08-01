import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  campaignPatchSchema,
  deleteCampaign,
  getCampaign,
  updateCampaign,
} from "@/lib/leads/service";

type Params = { params: Promise<{ id: string }> };

/** A single campaign by id (org-scoped). */
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
    const campaign = await getCampaign(session, id);
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Edit a campaign. */
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
    const parsed = campaignPatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const campaign = await updateCampaign(session, id, parsed.data);
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Delete a campaign. */
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
    await deleteCampaign(session, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
