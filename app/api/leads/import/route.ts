import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { importLeadsCsv, leadImportSchema } from "@/lib/leads/service";

/**
 * Import mapped CSV rows. Body: `{ mapping: Record<csvHeader, columnKey>,
 * rows: Record<csvHeader, string>[] }`. Returns created/skipped counts.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = leadImportSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const result = await importLeadsCsv(session, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
