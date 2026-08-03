import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { fieldChoiceSchema, mergeDuplicate } from "@/lib/leads/merge";

type Params = { params: Promise<{ id: string }> };

const mergeSchema = z
  .object({
    primaryId: z.string().min(1),
    fieldChoices: fieldChoiceSchema.default({}),
  })
  .strict();

/**
 * Apply a human-approved merge of a candidate pair. `primaryId` is the surviving
 * lead; `fieldChoices` maps a field to `'a' | 'b'` (which side wins). Never
 * auto-invoked — merge is only ever human-initiated.
 */
export async function POST(
  request: Request,
  { params }: Params,
): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const { id } = await params;
    const parsed = mergeSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const result = await mergeDuplicate(
      session,
      id,
      parsed.data.primaryId,
      parsed.data.fieldChoices,
    );
    return NextResponse.json({
      ok: true,
      lead: result.primary,
      sourcesRepointed: result.sourcesRepointed,
      loserId: result.loserId,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
