import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  campaignInputSchema,
  createCampaign,
  listCampaigns,
} from "@/lib/leads/service";

/** The org's campaigns, newest first. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const campaigns = await listCampaigns(session);
    return NextResponse.json({ ok: true, campaigns });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Create a campaign. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = campaignInputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const campaign = await createCampaign(session, parsed.data);
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    return authErrorResponse(error);
  }
}
