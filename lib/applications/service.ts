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
  exclusionMatchSchema,
  type Application,
} from "@/lib/db";

import { detectPlatform, hostOf } from "./platform";

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
  exclusionMatches: z.array(exclusionMatchSchema).max(50).optional(),
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
  const domain = input.domain ?? hostOf(input.url);
  return db.createApplication({
    organizationId: session.organizationId,
    userId: session.user.id,
    company: input.company,
    roleTitle: input.roleTitle,
    url: input.url ?? null,
    domain,
    // Derived here rather than trusted from the client — the extension and
    // the dashboard both create rows and would otherwise disagree.
    platform: detectPlatform(input.url ?? domain),
    additionalLinks: [],
    status: input.status ?? "Applied",
    profileId: input.profileId ?? null,
    fitScore: input.fitScore ?? null,
    fitReasoning: input.fitReasoning ?? null,
    filterResults: input.filterResults ?? [],
    exclusionMatches: input.exclusionMatches ?? [],
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

export const retrackSchema = z.object({
  url: z.string().min(1).max(2000),
});

/**
 * Attach another page to an application the user already tracks — the same
 * job seen on a second site, or the post-submit confirmation page.
 *
 * The first-tracked link stays the primary `url`/`domain` so existing rows
 * and every dashboard read keep working unchanged; extras accumulate in
 * `additionalLinks`. Re-adding a URL that's already on the row (primary or
 * extra) is a no-op rather than an error, because the natural user action is
 * to hit Re-track again on a page they already attached.
 */
export async function retrackApplication(
  session: Session,
  id: string,
  url: string,
): Promise<Application> {
  const application = await requireOwned(session, id);
  const known = new Set(
    [application.url, ...application.additionalLinks.map((l) => l.url)].filter(
      (u): u is string => Boolean(u),
    ),
  );
  if (known.has(url)) return application;
  return db.updateApplication(id, {
    additionalLinks: [
      ...application.additionalLinks,
      {
        url,
        domain: hostOf(url),
        platform: detectPlatform(url),
        addedAt: new Date(),
      },
    ],
  });
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
