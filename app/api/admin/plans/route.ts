import { NextResponse } from "next/server";
import { z } from "zod";

import { features } from "@/config/features";
import { authErrorResponse, authorize } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { syncStripePrices } from "@/lib/payments/plans";

const planInput = z.object({
  /** Stable machine identifier — set at creation, never edited afterwards. */
  slug: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters/digits/hyphens"),
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullish(),
  priceMonthly: z.number().int().min(0),
  priceAnnual: z.number().int().min(0).nullish(),
  annualDiscountPercent: z.number().min(0).max(100).nullish(),
  limits: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
// Slug is create-only — it's the stable lookup key (e.g. the trial finds
// "pro"), so updates never change it.
const updateInput = planInput
  .omit({ slug: true })
  .partial()
  .extend({ id: z.string().min(1) });
const deleteInput = z.object({ id: z.string().min(1) });

function bad(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Create a plan (super-admin). Mints Stripe Prices when payments is on. */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.admin) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    await authorize({ superAdmin: true });
    const parsed = planInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const data = parsed.data;
    const stripeIds = await syncStripePrices(null, {
      name: data.name,
      priceMonthly: data.priceMonthly,
      priceAnnual: data.priceAnnual ?? null,
    });
    if (await db.getPlanBySlug(data.slug)) {
      return bad(`A plan with slug "${data.slug}" already exists`);
    }
    const plan = await db.createPlan({
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      priceMonthly: data.priceMonthly,
      priceAnnual: data.priceAnnual ?? null,
      annualDiscountPercent: data.annualDiscountPercent ?? null,
      limits: data.limits ?? {},
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
      ...stripeIds,
    });
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Update a plan (super-admin). A price change creates a NEW Stripe Price (§15). */
export async function PATCH(request: Request): Promise<NextResponse> {
  if (!features.admin) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    await authorize({ superAdmin: true });
    const parsed = updateInput.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { id, ...patch } = parsed.data;
    const existing = await db.getPlanById(id);
    if (!existing) return bad("Plan not found");

    const name = patch.name ?? existing.name;
    const priceMonthly = patch.priceMonthly ?? existing.priceMonthly;
    const priceAnnual =
      patch.priceAnnual !== undefined
        ? (patch.priceAnnual ?? null)
        : (existing.priceAnnual ?? null);
    const stripeIds = await syncStripePrices(existing, {
      name,
      priceMonthly,
      priceAnnual,
    });

    const plan = await db.updatePlan(id, {
      ...patch,
      description:
        patch.description === undefined
          ? undefined
          : (patch.description ?? null),
      priceAnnual:
        patch.priceAnnual === undefined
          ? undefined
          : (patch.priceAnnual ?? null),
      annualDiscountPercent:
        patch.annualDiscountPercent === undefined
          ? undefined
          : (patch.annualDiscountPercent ?? null),
      ...stripeIds,
    });
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    return authErrorResponse(error);
  }
}

/** Delete a plan (super-admin). */
export async function DELETE(request: Request): Promise<NextResponse> {
  if (!features.admin) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  try {
    await authorize({ superAdmin: true });
    const parsed = deleteInput.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return bad(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    await db.deletePlan(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
