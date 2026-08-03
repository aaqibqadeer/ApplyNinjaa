import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { previewOfferPrompt, promptPreviewSchema } from "@/lib/leads/prompts";

/** Render a prompt (by id or ad-hoc text) against one lead — no AI, pure preview. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = promptPreviewSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const result = await previewOfferPrompt(session, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
