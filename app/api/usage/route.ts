import { NextResponse } from "next/server";

import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { getEffectivePlan } from "@/lib/payments/access";
import { currentPeriod, getMonthlyAiUsage } from "@/lib/usage/ai-usage";
import { getAiCallCap } from "@/lib/usage/enforce";

/**
 * Current AI quota, WITHOUT spending one.
 *
 * The extension popup needs to show "used/cap" and pre-disable the AI
 * actions the moment it opens. Before this route the only way to learn the
 * usage numbers was to read them off an AI response — i.e. you had to spend
 * a call to find out you had none left.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const session = await authorizeApi(request);
    const effective = await getEffectivePlan(session);
    const used = await getMonthlyAiUsage(session.user.id, currentPeriod());
    return NextResponse.json({
      ok: true,
      used,
      cap: getAiCallCap(effective.plan),
      planSlug: effective.plan.slug,
      planName: effective.plan.name,
      source: effective.source,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
