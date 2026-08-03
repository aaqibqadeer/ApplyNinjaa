import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  deleteOfferPrompt,
  serializeOfferPrompt,
  updateOfferPrompt,
} from "@/lib/leads/prompts";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    text: z.string().min(1).max(5000).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

/** Edit an offer prompt (name / text / default). */
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
    const parsed = patchSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { text, ...rest } = parsed.data;
    const prompt = await updateOfferPrompt(session, id, {
      ...rest,
      ...(text !== undefined ? { promptText: text } : {}),
    });
    return NextResponse.json({
      ok: true,
      prompt: serializeOfferPrompt(prompt),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Delete an offer prompt. */
export async function DELETE(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    await deleteOfferPrompt(session, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
