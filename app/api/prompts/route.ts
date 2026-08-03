import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  createOfferPrompt,
  listOfferPrompts,
  serializeOfferPrompt,
} from "@/lib/leads/prompts";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  text: z.string().min(1).max(5000),
  isDefault: z.boolean().optional(),
});

/** List the caller org's offer prompts. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const prompts = await listOfferPrompts(session);
    return NextResponse.json({
      ok: true,
      prompts: prompts.map(serializeOfferPrompt),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Create an offer prompt (unknown `{{placeholders}}` rejected at save). */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = createSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const prompt = await createOfferPrompt(session, {
      name: parsed.data.name,
      promptText: parsed.data.text,
      isDefault: parsed.data.isDefault,
    });
    return NextResponse.json({
      ok: true,
      prompt: serializeOfferPrompt(prompt),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
