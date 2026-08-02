import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  captureSessionPatchSchema,
  getCaptureSession,
  updateCaptureSession,
} from "@/lib/leads/capture-sessions";

type Params = { params: Promise<{ id: string }> };

/** A single capture session by id (org-scoped). */
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
    const captureSession = await getCaptureSession(session, id);
    return NextResponse.json({ ok: true, session: captureSession });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Update live counters + terminal status as the run progresses/ends. */
export async function PATCH(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    const parsed = captureSessionPatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const captureSession = await updateCaptureSession(session, id, parsed.data);
    return NextResponse.json({ ok: true, session: captureSession });
  } catch (error) {
    return authErrorResponse(error);
  }
}
