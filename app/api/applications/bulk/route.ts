import { NextResponse } from "next/server";

import { features } from "@/config/features";
import {
  applyBulkAction,
  bulkActionSchema,
} from "@/lib/applications/service";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";

/** Bulk actions from the dashboard table: delete / set-status. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.jobApplications) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = bulkActionSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const affected = await applyBulkAction(session, parsed.data);
    return NextResponse.json({ ok: true, affected });
  } catch (error) {
    return authErrorResponse(error);
  }
}
