import { NextResponse } from "next/server";

import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { getProfileFillData } from "@/lib/profiles/service";

type Params = { params: Promise<{ id: string }> };

/**
 * The whitelisted payload the extension's Quick Fill matches against — no AI
 * call, so it keeps working after the monthly cap is reached.
 *
 * Includes decrypted EEO answers by explicit product decision; see the note
 * on `ProfileFillData` in lib/profiles/service.ts before reusing this shape.
 */
export async function GET(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    const profile = await getProfileFillData(session, id);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return authErrorResponse(error);
  }
}
