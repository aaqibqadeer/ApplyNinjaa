import { NextResponse } from "next/server";

import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  createExclusion,
  exclusionInputSchema,
  listExclusions,
} from "@/lib/exclusions/service";

/**
 * The caller's exclusion rules. Bearer-capable: the extension popup reads
 * these once per open and matches them offline, so a warning costs no AI
 * action.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authorizeApi(request);
    const exclusions = await listExclusions(session);
    return NextResponse.json({ ok: true, exclusions });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Add a company or keyword exclusion. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authorizeApi(request);
    const parsed = exclusionInputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const exclusion = await createExclusion(session, parsed.data);
    return NextResponse.json({ ok: true, exclusion });
  } catch (error) {
    return authErrorResponse(error);
  }
}
