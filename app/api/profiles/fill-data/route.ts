import { NextResponse } from "next/server";

import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  getProfileFillData,
  listProfileSummaries,
} from "@/lib/profiles/service";

/**
 * Every profile's fill data in one call.
 *
 * The extension's manual-fill context menu needs all profiles AND all their
 * fields up front — Chrome builds context menus ahead of time, not on hover —
 * so a per-profile round trip from the service worker would mean N requests
 * every time the menu is rebuilt.
 *
 * Same whitelist (and the same deliberate EEO exposure) as
 * `/api/profiles/[id]/fill-data`; no AI call, so it survives the monthly cap.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authorizeApi(request);
    const summaries = await listProfileSummaries(session);
    const profiles = await Promise.all(
      summaries.map((summary) => getProfileFillData(session, summary.id)),
    );
    return NextResponse.json({ ok: true, profiles });
  } catch (error) {
    return authErrorResponse(error);
  }
}
