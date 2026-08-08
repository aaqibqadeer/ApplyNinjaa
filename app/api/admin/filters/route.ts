import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { logAdminAction } from "@/lib/admin/audit";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { db, JOB_FILTER_TYPES } from "@/lib/db";

const createSchema = z.object({
  label: z.string().min(1).max(120),
  description: z.string().max(500).nullish(),
});
const updateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullish(),
  isActive: z.boolean().optional(),
});
const deleteSchema = z.object({ id: z.string().min(1) });

/** The admin master list of Valid Job filters (super-admin CRUD). */
export async function GET(): Promise<NextResponse> {
  if (!features.admin) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    await authorize({ superAdmin: true });
    const filters = await db.listAdminJobFilters();
    return NextResponse.json({ ok: true, filters });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!features.admin) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorize({ superAdmin: true });
    const parsed = createSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const filter = await db.createJobFilter({
      label: parsed.data.label,
      description: parsed.data.description ?? null,
      type: JOB_FILTER_TYPES.admin,
      ownerId: null,
      isActive: true,
    });
    await logAdminAction(session, {
      action: "filter_create",
      targetId: filter.id,
      metadata: { label: filter.label },
    });
    return NextResponse.json({ ok: true, filter });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!features.admin) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorize({ superAdmin: true });
    const parsed = updateSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { id, ...patch } = parsed.data;
    const existing = await db.getJobFilterById(id);
    if (!existing || existing.type !== JOB_FILTER_TYPES.admin) {
      return NextResponse.json({ error: "Filter not found" }, { status: 404 });
    }
    const filter = await db.updateJobFilter(id, patch);
    await logAdminAction(session, {
      action: "filter_update",
      targetId: id,
      metadata: { label: filter.label, patch },
    });
    return NextResponse.json({ ok: true, filter });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!features.admin) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    const session = await authorize({ superAdmin: true });
    const parsed = deleteSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const existing = await db.getJobFilterById(parsed.data.id);
    if (!existing || existing.type !== JOB_FILTER_TYPES.admin) {
      return NextResponse.json({ error: "Filter not found" }, { status: 404 });
    }
    await db.deleteJobFilter(parsed.data.id);
    await logAdminAction(session, {
      action: "filter_delete",
      targetId: parsed.data.id,
      metadata: { label: existing.label },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
