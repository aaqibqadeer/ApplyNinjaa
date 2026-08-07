import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { listUsersWithBilling } from "@/lib/admin/users";
import { authErrorResponse, authorize } from "@/lib/auth/roles";

const querySchema = z.object({
  search: z.string().max(200).optional(),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Paged user search with plan tier + usage (platform staff). */
export async function GET(request: Request): Promise<NextResponse> {
  if (!features.admin) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    await authorize({ platformStaff: true });
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      search: url.searchParams.get("search") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query" }, { status: 400 });
    }
    const result = await listUsersWithBilling({
      search: parsed.data.search,
      offset: parsed.data.offset,
      limit: 25,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
