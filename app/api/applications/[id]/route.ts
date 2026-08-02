import { NextResponse } from "next/server";

import { features } from "@/config/features";
import {
  applicationPatchSchema,
  deleteApplication,
  updateApplication,
} from "@/lib/applications/service";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";

type Params = { params: Promise<{ id: string }> };

/** Inline edit — any field, including the AI-generated fit score. */
export async function PATCH(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  if (!features.jobApplications) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    const parsed = applicationPatchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const application = await updateApplication(session, id, parsed.data);
    return NextResponse.json({ ok: true, application });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  if (!features.jobApplications) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    await deleteApplication(session, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
