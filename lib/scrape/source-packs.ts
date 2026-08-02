/**
 * lib/scrape/source-packs.ts — server-pushed selector packs (locked decision #7).
 *
 * Selectors live in the DB (the PLATFORM-level `source_packs` collection) so a
 * Google DOM change is fixed by editing a pack, not shipping a new extension
 * build. The extension fetches the active packs at each capture start; a super
 * admin CRUDs them.
 *
 * Routes stay thin: they own the `features.scraper.enabled` 404 and the
 * `authorizeApi({ superAdmin: true })` guard (CLAUDE.md §14 — never
 * `requireRole('admin')`); this module owns validation + data access.
 */

import { z } from "zod";

import { db, automationTierSchema, type SourcePack } from "@/lib/db";

import { ScraperError } from "@/lib/leads/service";

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

export const sourcePackCreateSchema = z.object({
  sourceId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "sourceId must be lowercase letters/digits/hyphens"),
  version: z.number().int().nonnegative().optional(),
  automationTier: automationTierSchema,
  selectors: z.record(z.string(), z.string()),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type SourcePackCreateInput = z.infer<typeof sourcePackCreateSchema>;

/** `sourceId` is the stable lookup — create-only, so it's absent from updates. */
export const sourcePackUpdateSchema = z.object({
  version: z.number().int().nonnegative().optional(),
  automationTier: automationTierSchema.optional(),
  selectors: z.record(z.string(), z.string()).optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type SourcePackUpdateInput = z.infer<typeof sourcePackUpdateSchema>;

/* -------------------------------------------------------------------------- */
/* Read (extension) + admin CRUD                                              */
/* -------------------------------------------------------------------------- */

/** The active packs the extension fetches at capture start. */
export async function getActiveSourcePacks(): Promise<SourcePack[]> {
  return db.listActiveSourcePacks();
}

/** All packs (admin view). */
export async function listSourcePacks(): Promise<SourcePack[]> {
  return db.listSourcePacks();
}

export async function createSourcePack(
  input: SourcePackCreateInput,
): Promise<SourcePack> {
  const existing = await db.getSourcePackBySourceId(input.sourceId);
  if (existing) {
    throw new ScraperError(
      `A source pack for "${input.sourceId}" already exists`,
      409,
    );
  }
  return db.createSourcePack({
    sourceId: input.sourceId,
    version: input.version ?? 1,
    automationTier: input.automationTier,
    selectors: input.selectors,
    notes: input.notes ?? null,
    isActive: input.isActive ?? true,
  });
}

export async function updateSourcePack(
  id: string,
  patch: SourcePackUpdateInput,
): Promise<SourcePack> {
  const existing = await db.getSourcePackById(id);
  if (!existing) throw new ScraperError("Source pack not found", 404);
  return db.updateSourcePack(id, patch);
}

export async function deleteSourcePack(id: string): Promise<void> {
  const existing = await db.getSourcePackById(id);
  if (!existing) throw new ScraperError("Source pack not found", 404);
  await db.deleteSourcePack(id);
}
