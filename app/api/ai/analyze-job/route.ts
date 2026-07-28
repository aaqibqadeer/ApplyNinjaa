import { NextResponse } from "next/server";
import { z } from "zod";

import { isAnyAiEnabled } from "@/config/features";
import { analyzeJob } from "@/lib/ai/tasks";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import { enabledFiltersForUser } from "@/lib/filters/service";
import { getProfile, profileForDomain } from "@/lib/profiles/service";
import { recordAiCall } from "@/lib/usage/ai-usage";
import { enforceAiQuota, enforceAiRateLimits } from "@/lib/usage/enforce";

const inputSchema = z.object({
  jobText: z.string().min(40, "Not enough job text on this page to analyze"),
  url: z.string().nullable().optional(),
  domain: z.string().nullable().optional(),
  /** Explicit profile pick; falls back to the domain's last-used / default. */
  profileId: z.string().optional(),
});

/**
 * The extension popup's analysis: every ENABLED filter → Yes/No/Neutral +
 * an overall 0-100 fit score with one-line reasoning. One AI call.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isAnyAiEnabled) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    await enforceAiRateLimits(request, session);
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { jobText, domain, profileId } = parsed.data;

    const profile = profileId
      ? await getProfile(session, profileId)
      : await profileForDomain(session, domain ?? null);
    if (!profile) {
      return NextResponse.json(
        { error: "Create a profile first — upload your resume in the dashboard" },
        { status: 400 },
      );
    }

    const filters = await enabledFiltersForUser(session);
    const quota = await enforceAiQuota(session);
    const { data, result } = await analyzeJob(jobText, filters, profile);
    await recordAiCall({
      userId: session.user.id,
      organizationId: session.organizationId,
      kind: "job_analysis",
      model: result.model,
    });

    // Every enabled filter gets a verdict — a filter the model skipped comes
    // back Neutral rather than silently disappearing.
    const verdictByFilter = new Map(
      data.results.map((r) => [r.filterId, r.verdict]),
    );
    const filterResults = filters.map((filter) => ({
      filterId: filter.id,
      label: filter.label,
      verdict: verdictByFilter.get(filter.id) ?? ("Neutral" as const),
    }));

    return NextResponse.json({
      ok: true,
      profileId: profile.id,
      profileName: profile.name,
      filterResults,
      fitScore: Math.round(data.fitScore),
      fitReasoning: data.fitReasoning,
      usage: { used: quota.used, cap: quota.cap },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
