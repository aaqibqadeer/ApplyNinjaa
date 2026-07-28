/**
 * lib/filters/service.ts — "Valid Job" filter business logic (Node).
 *
 * Users see the active admin master list plus their own custom filters, each
 * with a per-user enabled toggle (default ON — admin defaults are meant to be
 * useful out of the box; users switch off what they don't care about). Admin
 * CRUD of the master list lives behind /api/admin/filters, not here.
 */

import { z } from "zod";

import type { Session } from "@/lib/auth/types";
import {
  db,
  JOB_FILTER_TYPES,
  type JobFilter,
} from "@/lib/db";

class FilterError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FilterError";
    this.status = status;
  }
}

export const userFilterInputSchema = z.object({
  label: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
});
export type UserFilterInput = z.infer<typeof userFilterInputSchema>;

export interface FilterWithSetting extends JobFilter {
  enabled: boolean;
}

/** Filters visible to the user (active admin + own), with enabled state. */
export async function listFiltersForUser(
  session: Session,
): Promise<FilterWithSetting[]> {
  const [filters, settings] = await Promise.all([
    db.listJobFiltersForUser(session.user.id),
    db.listUserFilterSettings(session.user.id),
  ]);
  const byFilter = new Map(settings.map((s) => [s.filterId, s.enabled]));
  return filters.map((filter) => ({
    ...filter,
    enabled: byFilter.get(filter.id) ?? true,
  }));
}

/** The enabled subset, ready to hand to the AI classifier. */
export async function enabledFiltersForUser(
  session: Session,
): Promise<FilterWithSetting[]> {
  const filters = await listFiltersForUser(session);
  return filters.filter((f) => f.enabled && f.isActive);
}

export async function createUserFilter(
  session: Session,
  input: UserFilterInput,
): Promise<FilterWithSetting> {
  const filter = await db.createJobFilter({
    label: input.label,
    description: input.description ?? null,
    type: JOB_FILTER_TYPES.user,
    ownerId: session.user.id,
    isActive: true,
  });
  return { ...filter, enabled: true };
}

async function requireOwnUserFilter(
  session: Session,
  id: string,
): Promise<JobFilter> {
  const filter = await db.getJobFilterById(id);
  if (
    !filter ||
    filter.type !== JOB_FILTER_TYPES.user ||
    filter.ownerId !== session.user.id
  ) {
    throw new FilterError("Filter not found", 404);
  }
  return filter;
}

export async function updateUserFilter(
  session: Session,
  id: string,
  input: Partial<UserFilterInput>,
): Promise<JobFilter> {
  await requireOwnUserFilter(session, id);
  return db.updateJobFilter(id, {
    label: input.label,
    description: input.description,
  });
}

export async function deleteUserFilter(
  session: Session,
  id: string,
): Promise<void> {
  await requireOwnUserFilter(session, id);
  await db.deleteJobFilter(id);
}

/** Toggle a visible filter on/off for this user. */
export async function setFilterEnabled(
  session: Session,
  filterId: string,
  enabled: boolean,
): Promise<void> {
  if (!session.organizationId) {
    throw new FilterError("No active organization", 400);
  }
  const filter = await db.getJobFilterById(filterId);
  const visible =
    filter &&
    (filter.type === JOB_FILTER_TYPES.admin ||
      filter.ownerId === session.user.id);
  if (!visible) throw new FilterError("Filter not found", 404);
  await db.setUserFilterEnabled(
    session.organizationId,
    session.user.id,
    filterId,
    enabled,
  );
}
