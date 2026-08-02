import { NextResponse } from "next/server";

import { features } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  createCustomField,
  customFieldInputSchema,
  listCustomFields,
} from "@/lib/leads/service";

/** The org's lead custom-field definitions. */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const fields = await listCustomFields(session);
    return NextResponse.json({ ok: true, fields });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Define a new custom field. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.scraper.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    const parsed = customFieldInputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const field = await createCustomField(session, parsed.data);
    return NextResponse.json({ ok: true, field });
  } catch (error) {
    return authErrorResponse(error);
  }
}
