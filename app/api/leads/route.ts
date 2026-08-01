import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  createLead,
  leadCreateSchema,
  listLeadsForOrg,
} from "@/lib/leads/service";

/** Paged, filtered lead listing for the caller's org. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const searchParams = new URL(request.url).searchParams;
    const result = await listLeadsForOrg(session, searchParams);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Manually add a lead to the directory. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = leadCreateSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const lead = await createLead(session, parsed.data);
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    return authErrorResponse(error);
  }
}
