import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  createSourcePack,
  deleteSourcePack,
  listSourcePacks,
  sourcePackCreateSchema,
  sourcePackUpdateSchema,
  updateSourcePack,
} from "@/lib/scrape/source-packs";

const updateInput = z
  .object({ id: z.string().min(1) })
  .and(sourcePackUpdateSchema);
const deleteInput = z.object({ id: z.string().min(1) });

/** List all selector packs (super-admin). */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await authorizeApi(request, { superAdmin: true });
    const packs = await listSourcePacks();
    return NextResponse.json({ ok: true, packs });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Create a selector pack (super-admin, §14). */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await authorizeApi(request, { superAdmin: true });
    const parsed = sourcePackCreateSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const pack = await createSourcePack(parsed.data);
    return NextResponse.json({ ok: true, pack });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Update a selector pack — the way a Google DOM change gets fixed (§7). */
export async function PATCH(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await authorizeApi(request, { superAdmin: true });
    const parsed = updateInput.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { id, ...patch } = parsed.data;
    const pack = await updateSourcePack(id, patch);
    return NextResponse.json({ ok: true, pack });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Delete a selector pack (super-admin). */
export async function DELETE(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await authorizeApi(request, { superAdmin: true });
    const parsed = deleteInput.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    await deleteSourcePack(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
