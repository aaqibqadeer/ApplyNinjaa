import { NextResponse } from "next/server";
import { z } from "zod";

import { features, isAnyAiEnabled } from "@/config/features";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { runScan } from "@/lib/gmail/scan";
import { PLAN_FEATURES, requireFeature } from "@/lib/payments/access";
import { enforceAiQuota, enforceAiRateLimits } from "@/lib/usage/enforce";

// Scans do live Gmail fetches + batched classification; allow up to 2 min.
export const maxDuration = 120;

const schema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((v) => v.from <= v.to, { message: "Range start must be before end" });

/**
 * Manual "Scan Now" (product spec §7 — no background scanning in v1). One
 * scan = one AI action against the monthly cap, regardless of email count
 * (scans are capped at 50 messages).
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.gmail || !isAnyAiEnabled) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorize();
    await requireFeature(session, PLAN_FEATURES.gmailScan);
    await enforceAiRateLimits(request, session);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    await enforceAiQuota(session);
    const scan = await runScan(session, parsed.data);
    return NextResponse.json({ ok: true, scan });
  } catch (error) {
    return authErrorResponse(error);
  }
}
