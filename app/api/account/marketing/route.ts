import { NextResponse } from "next/server";
import { z } from "zod";

import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { db } from "@/lib/db";

const schema = z.object({ enabled: z.boolean() });

/** Toggle marketing emails from account settings (transactional unaffected). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await authorize();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    await db.updateUser(session.user.id, {
      marketingEmailsEnabled: parsed.data.enabled,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
