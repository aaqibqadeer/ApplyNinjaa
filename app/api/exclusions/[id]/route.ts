import { NextResponse } from "next/server";

import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { deleteExclusion } from "@/lib/exclusions/service";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    await deleteExclusion(session, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
