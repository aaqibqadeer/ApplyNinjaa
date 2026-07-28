/**
 * lib/admin/audit.ts — append an admin_actions audit row (who/what/when/why).
 * Every admin mutation route calls this AFTER the action succeeds; refunds,
 * suspensions, bans, and deletions must pass a non-empty reason (enforced at
 * the route's input schema).
 */

import type { Session } from "@/lib/auth/types";
import { db, type AdminAction, type AdminActionType } from "@/lib/db";

export interface AuditInput {
  action: AdminActionType;
  targetUserId?: string | null;
  targetId?: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function logAdminAction(
  session: Session,
  input: AuditInput,
): Promise<AdminAction> {
  return db.createAdminAction({
    actorUserId: session.user.id,
    actorRole: session.user.isSuperAdmin ? "super_admin" : "support_admin",
    action: input.action,
    targetUserId: input.targetUserId ?? null,
    targetId: input.targetId ?? null,
    reason: input.reason ?? "",
    metadata: input.metadata ?? {},
  });
}
