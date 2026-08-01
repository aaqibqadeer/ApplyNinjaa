import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { decideProposal } from "@/lib/gmail/scan";

const schema = z.object({
  messageId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});

/**
 * The user's explicit approve/reject on one proposal — the only path that
 * writes a scan result into the applications tracker (no silent updates).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!features.jobApplications || !features.gmail) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorize();
    const { id } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const scan = await decideProposal(
      session,
      id,
      parsed.data.messageId,
      parsed.data.decision,
    );
    return NextResponse.json({ ok: true, scan });
  } catch (error) {
    return authErrorResponse(error);
  }
}
