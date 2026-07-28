import { NextResponse } from "next/server";
import { z } from "zod";

import { isAnyAiEnabled } from "@/config/features";
import { detectedFieldSchema, mapFormFields } from "@/lib/ai/tasks";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  getProfile,
  profileForDomain,
  rememberDomainProfile,
} from "@/lib/profiles/service";
import { recordAiCall } from "@/lib/usage/ai-usage";
import { enforceAiQuota, enforceAiRateLimits } from "@/lib/usage/enforce";

const inputSchema = z.object({
  fields: z.array(detectedFieldSchema).min(1).max(120),
  domain: z.string().nullable().optional(),
  profileId: z.string().optional(),
});

/**
 * Autofill support: map the chosen profile onto the detected form fields.
 * One AI call. Every submitted field id comes back in `mappings` — fields the
 * AI can't confidently fill return value:null/confidence:"low" so the popup
 * can highlight them for manual review (never silently skipped).
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
    const { fields, domain, profileId } = parsed.data;

    const profile = profileId
      ? await getProfile(session, profileId)
      : await profileForDomain(session, domain ?? null);
    if (!profile) {
      return NextResponse.json(
        { error: "Create a profile first — upload your resume in the dashboard" },
        { status: 400 },
      );
    }

    const quota = await enforceAiQuota(session);
    const { data, result } = await mapFormFields(profile, fields);
    await recordAiCall({
      userId: session.user.id,
      organizationId: session.organizationId,
      kind: "field_map",
      model: result.model,
    });

    if (domain) {
      // Using a profile to fill on this domain makes it the domain's default.
      await rememberDomainProfile(session, domain, profile.id);
    }

    const byField = new Map(data.mappings.map((m) => [m.fieldId, m]));
    const mappings = fields.map(
      (field) =>
        byField.get(field.id) ?? {
          fieldId: field.id,
          value: null,
          confidence: "low" as const,
        },
    );

    return NextResponse.json({
      ok: true,
      profileId: profile.id,
      profileName: profile.name,
      mappings,
      usage: { used: quota.used, cap: quota.cap },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
