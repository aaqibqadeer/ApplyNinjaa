import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  captureSessionCreateSchema,
  createCaptureSession,
  listCaptureSessions,
} from "@/lib/leads/capture-sessions";

/** Capture-session history for the caller's org. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const sessions = await listCaptureSessions(session);
    return NextResponse.json({ ok: true, sessions });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Start a capture session (Bearer, extension) — created on popup Start. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = captureSessionCreateSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const captureSession = await createCaptureSession(session, parsed.data);
    return NextResponse.json({ ok: true, session: captureSession });
  } catch (error) {
    return authErrorResponse(error);
  }
}
