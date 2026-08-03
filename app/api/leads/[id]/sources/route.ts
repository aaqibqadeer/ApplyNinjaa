import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { listLeadSources } from "@/lib/leads/service";

type Params = { params: Promise<{ id: string }> };

/** Provenance (`lead_sources`) rows for one lead — org-scoped. */
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
    const sources = await listLeadSources(session, id);
    return NextResponse.json({ ok: true, sources });
  } catch (error) {
    return authErrorResponse(error);
  }
}
