import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { getActiveSourcePacks } from "@/lib/scrape/source-packs";

/**
 * The active selector packs (Bearer). The extension fetches these at each
 * capture start and caches them by version, falling back to its bundled
 * selectors when this fails.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await authorizeApi(request);
    const packs = await getActiveSourcePacks();
    return NextResponse.json({ ok: true, packs });
  } catch (error) {
    return authErrorResponse(error);
  }
}
