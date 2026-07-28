/**
 * lib/applications/service.ts — tracked-application business logic (Node).
 * Ownership-scoped CRUD; the extension's Track button and the dashboard table
 * both go through here.
 */

import { z } from "zod";

import type { Session } from "@/lib/auth/types";
import {
  applicationFilterResultSchema,
  applicationStatusSchema,
  db,
  type Application,
} from "@/lib/db";

class ApplicationError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApplicationError";
    this.status = status;
  }
}

/** Track/create input. Status always starts at "Applied" from the extension;
 * the dashboard may create "Saved" rows explicitly. */
export const applicationInputSchema = z.object({
  company: z.string().min(1).max(200),
  roleTitle: z.string().min(1).max(200),
  url: z.string().max(2000).nullable().optional(),
  domain: z.string().max(200).nullable().optional(),
  status: applicationStatusSchema.optional(),
  profileId: z.string().nullable().optional(),
  fitScore: z.number().min(0).max(100).nullable().optional(),
  fitReasoning: z.string().max(1000).nullable().optional(),
  filterResults: z.array(applicationFilterResultSchema).max(50).optional(),
  appliedAt: z.coerce.date().optional(),
  notes: z.string().max(5000).optional(),
});
export type ApplicationInput = z.infer<typeof applicationInputSchema>;

export const applicationPatchSchema = applicationInputSchema.partial();
export type ApplicationPatch = z.infer<typeof applicationPatchSchema>;

export async function listApplications(
  session: Session,
): Promise<Application[]> {
  return db.listApplicationsForUser(session.user.id);
}

export async function trackApplication(
  session: Session,
  input: ApplicationInput,
): Promise<Application> {
  if (!session.organizationId) {
    throw new ApplicationError("No active organization", 400);
  }
  return db.createApplication({
    organizationId: session.organizationId,
    userId: session.user.id,
    company: input.company,
    roleTitle: input.roleTitle,
    url: input.url ?? null,
    domain: input.domain ?? null,
    status: input.status ?? "Applied",
    profileId: input.profileId ?? null,
    fitScore: input.fitScore ?? null,
    fitReasoning: input.fitReasoning ?? null,
    filterResults: input.filterResults ?? [],
    appliedAt: input.appliedAt ?? new Date(),
    notes: input.notes ?? "",
  });
}

async function requireOwned(
  session: Session,
  id: string,
): Promise<Application> {
  const application = await db.getApplicationById(id);
  if (!application || application.userId !== session.user.id) {
    throw new ApplicationError("Application not found", 404);
  }
  return application;
}

export async function updateApplication(
  session: Session,
  id: string,
  patch: ApplicationPatch,
): Promise<Application> {
  await requireOwned(session, id);
  return db.updateApplication(id, patch);
}

export async function deleteApplication(
  session: Session,
  id: string,
): Promise<void> {
  await requireOwned(session, id);
  await db.deleteApplication(id);
}

export const bulkActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string()).min(1).max(200),
  }),
  z.object({
    action: z.literal("set-status"),
    ids: z.array(z.string()).min(1).max(200),
    status: applicationStatusSchema,
  }),
]);
export type BulkAction = z.infer<typeof bulkActionSchema>;

/** Bulk delete / bulk status change — adapter queries are user-scoped, so ids
 * belonging to someone else are simply ignored. Returns the affected count. */
export async function applyBulkAction(
  session: Session,
  input: BulkAction,
): Promise<number> {
  if (input.action === "delete") {
    return db.deleteApplicationsForUser(session.user.id, input.ids);
  }
  return db.updateApplicationsStatusForUser(
    session.user.id,
    input.ids,
    input.status,
  );
}
