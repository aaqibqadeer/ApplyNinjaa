/**
 * lib/leads/prompts.ts — offer-prompt CRUD service (Phase 3).
 *
 * Routes stay thin: validate + call. This layer owns tenant scoping, the
 * scraper + offerLines feature gates, placeholder validation
 * (`render-prompt.ts` — unknown `{{placeholder}}` rejected at save, never a
 * silent blank), and the single-default invariant (at most one `isDefault`
 * prompt per org, enforced here since Mongo can't express it as an index).
 */

import { z } from "zod";

import { features } from "@/config/features";
import type { Session } from "@/lib/auth/types";
import { db, type OfferPrompt } from "@/lib/db";

import { renderPrompt, validatePromptText } from "./render-prompt";
import { assertScraperEnabled, requireOrg, ScraperError } from "./service";

/** 404 when offer-line generation is off (the offerLines sub-flag). */
export function assertOfferLinesEnabled(): void {
  if (!features.scraper.offerLines) {
    throw new ScraperError("Not found", 404);
  }
}

/** The client-facing shape of an offer prompt (`text`, not DB `promptText`). */
export interface SerializedOfferPrompt {
  id: string;
  name: string;
  text: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Serialize an OfferPrompt for the API/UI. The UI consumes `text` (not the
 * DB-internal `promptText`), so map it here at the boundary.
 */
export function serializeOfferPrompt(p: OfferPrompt): SerializedOfferPrompt {
  return {
    id: p.id,
    name: p.name,
    text: p.promptText,
    isDefault: p.isDefault,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export const offerPromptInputSchema = z.object({
  name: z.string().min(1).max(200),
  promptText: z.string().min(1).max(5000),
  isDefault: z.boolean().optional(),
  provider: z.string().max(50).nullable().optional(),
  model: z.string().max(100).nullable().optional(),
});
export type OfferPromptInput = z.infer<typeof offerPromptInputSchema>;
export const offerPromptPatchSchema = offerPromptInputSchema.partial();
export type OfferPromptPatch = z.infer<typeof offerPromptPatchSchema>;

export async function listOfferPrompts(
  session: Session,
): Promise<OfferPrompt[]> {
  assertScraperEnabled();
  assertOfferLinesEnabled();
  const orgId = requireOrg(session);
  return db.listOfferPrompts(orgId);
}

export async function createOfferPrompt(
  session: Session,
  input: OfferPromptInput,
): Promise<OfferPrompt> {
  assertScraperEnabled();
  assertOfferLinesEnabled();
  const orgId = requireOrg(session);
  // Placeholder validation at save time (execution plan §7).
  validatePromptText(input.promptText);

  const prompt = await db.createOfferPrompt({
    organizationId: orgId,
    name: input.name,
    promptText: input.promptText,
    isDefault: input.isDefault ?? false,
    provider: input.provider ?? null,
    model: input.model ?? null,
    createdByUserId: session.user.id,
  });
  if (prompt.isDefault) {
    await db.clearDefaultOfferPrompts(orgId, prompt.id);
  }
  return prompt;
}

export async function updateOfferPrompt(
  session: Session,
  id: string,
  patch: OfferPromptPatch,
): Promise<OfferPrompt> {
  assertScraperEnabled();
  assertOfferLinesEnabled();
  const orgId = requireOrg(session);
  const existing = await db.getOfferPrompt(orgId, id);
  if (!existing) throw new ScraperError("Prompt not found", 404);
  if (patch.promptText !== undefined) validatePromptText(patch.promptText);

  const updated = await db.updateOfferPrompt(orgId, id, patch);
  if (patch.isDefault === true) {
    await db.clearDefaultOfferPrompts(orgId, id);
  }
  return updated;
}

export async function deleteOfferPrompt(
  session: Session,
  id: string,
): Promise<void> {
  assertScraperEnabled();
  assertOfferLinesEnabled();
  const orgId = requireOrg(session);
  const existing = await db.getOfferPrompt(orgId, id);
  if (!existing) throw new ScraperError("Prompt not found", 404);
  await db.deleteOfferPrompt(orgId, id);
}

export const promptPreviewSchema = z
  .object({
    promptId: z.string().min(1).optional(),
    promptText: z.string().min(1).max(5000).optional(),
    leadId: z.string().min(1),
  })
  .refine((v) => Boolean(v.promptId) !== Boolean(v.promptText), {
    message: "Provide exactly one of promptId or promptText",
  });
export type PromptPreviewInput = z.infer<typeof promptPreviewSchema>;

export interface PromptPreviewResult {
  rendered: string;
  sample: Record<string, unknown>;
}

/**
 * Render a prompt (by saved id or ad-hoc `promptText`) against a real lead so the
 * UI can preview the resulting offer line before running the pass. No AI — a pure
 * placeholder substitution over the lead's current fields.
 */
export async function previewOfferPrompt(
  session: Session,
  input: PromptPreviewInput,
): Promise<PromptPreviewResult> {
  assertScraperEnabled();
  assertOfferLinesEnabled();
  const orgId = requireOrg(session);

  const lead = await db.getLeadById(orgId, input.leadId);
  if (!lead) throw new ScraperError("Lead not found", 404);

  let text = input.promptText ?? "";
  if (input.promptId) {
    const prompt = await db.getOfferPrompt(orgId, input.promptId);
    if (!prompt) throw new ScraperError("Prompt not found", 404);
    text = prompt.promptText;
  }

  const rendered = renderPrompt(text, lead);
  return {
    rendered,
    sample: {
      id: lead.id,
      businessName: lead.businessName,
      category: lead.category,
      website: lead.website,
    },
  };
}
