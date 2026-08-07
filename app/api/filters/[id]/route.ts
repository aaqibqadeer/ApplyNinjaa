import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  deleteUserFilter,
  setFilterEnabled,
  updateUserFilter,
  userFilterInputSchema,
} from "@/lib/filters/service";

type Params = { params: Promise<{ id: string }> };

// Either an own-filter edit (label/description) or an enabled toggle (works
// on admin defaults too — the toggle is per-user state, not a filter edit).
const patchSchema = userFilterInputSchema
  .partial()
  .extend({ enabled: z.boolean().optional() });

export async function PATCH(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { enabled, ...edit } = parsed.data;
    if (enabled !== undefined) {
      await setFilterEnabled(session, id, enabled);
    }
    if (edit.label !== undefined || edit.description !== undefined) {
      await updateUserFilter(session, id, edit);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    await deleteUserFilter(session, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
