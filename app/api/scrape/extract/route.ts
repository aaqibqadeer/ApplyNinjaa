import { NextResponse } from "next/server";
import { z } from "zod";

import { features, isAnyAiEnabled } from "@/config/features";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { extractFromBlocks } from "@/lib/scrape/extract";
import { recordAiCall } from "@/lib/usage/ai-usage";
import { enforceAiQuota, enforceAiRateLimits } from "@/lib/usage/enforce";

const inputSchema = z.object({
  /** Cleaned text of each repeated result block (see lib/scrape/blocks.ts). */
  blocks: z.array(z.string().min(1).max(20000)).min(1).max(60),
});

/**
 * The generic adapter's AI extraction (Bearer): cleaned text blocks in,
 * structured records out via DeepSeek. One billable AI call (quota enforced).
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (
    !features.scraper.enabled ||
    !features.scraper.genericExtractor ||
    !isAnyAiEnabled
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    await enforceAiRateLimits(request, session);
    const parsed = inputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const quota = await enforceAiQuota(session);
    const { data, result } = await extractFromBlocks(parsed.data.blocks);
    await recordAiCall({
      userId: session.user.id,
      organizationId: session.organizationId,
      kind: "scrape_extract",
      model: result.model,
    });
    return NextResponse.json({
      ok: true,
      records: data.records,
      usage: { used: quota.used, cap: quota.cap },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
