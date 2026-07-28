import { NextResponse } from "next/server";

import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  createProfile,
  listProfiles,
  profileInputSchema,
} from "@/lib/profiles/service";

/** List the caller's profiles (web dashboard + extension picker). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authorizeApi(request);
    const profiles = await listProfiles(session);
    return NextResponse.json({ ok: true, profiles });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Create a profile (onboarding review step / dashboard "new profile"). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authorizeApi(request);
    const parsed = profileInputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const profile = await createProfile(session, parsed.data);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return authErrorResponse(error);
  }
}
