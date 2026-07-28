import { NextResponse } from "next/server";

import { isAnyAiEnabled } from "@/config/features";
import { parseResume } from "@/lib/ai/tasks";
import { authErrorResponse, authorizeApi } from "@/lib/auth/roles";
import {
  extractResumeText,
  MAX_RESUME_BYTES,
} from "@/lib/profiles/resume-text";
import { recordAiCall } from "@/lib/usage/ai-usage";
import { enforceAiQuota, enforceAiRateLimits } from "@/lib/usage/enforce";

/**
 * Resume upload → structured profile data (one AI call against the cap).
 * Multipart body with a `file` field (PDF/DOCX, ≤5 MB). The file is processed
 * entirely in memory and discarded — only the parsed JSON is returned; the
 * client stores it via the profiles API after the user reviews it.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isAnyAiEnabled) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorizeApi(request);
    await enforceAiRateLimits(request, session);

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Upload a resume file in the 'file' field" },
        { status: 400 },
      );
    }
    if (file.size > MAX_RESUME_BYTES) {
      return NextResponse.json(
        { error: "Resume is too large — 5 MB max" },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractResumeText(buffer, file.type, file.name);

    await enforceAiQuota(session);
    const { data, result } = await parseResume(text);
    await recordAiCall({
      userId: session.user.id,
      organizationId: session.organizationId,
      kind: "resume_parse",
      model: result.model,
    });

    return NextResponse.json({ ok: true, parsed: data });
  } catch (error) {
    return authErrorResponse(error);
  }
}
