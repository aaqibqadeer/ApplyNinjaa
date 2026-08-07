/**
 * lib/auth/roles.ts — authorization guards (CLAUDE.md §14). Node-only.
 *
 * Two independent tiers that must NEVER collapse into one check (§14):
 *   - org role      → `requireRole()` / `requirePermission()` (per-org)
 *   - super-admin    → `requireSuperAdmin()` (platform, org-independent)
 *
 * Page/Server-Component guards redirect-or-`notFound()` like `requireAuth()`.
 * API routes use `authorize()`, which throws a typed `AuthorizationError` the
 * handler turns into a 401/403 JSON response via `authErrorResponse()`.
 */

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

import { hasPermission, type Permission } from "@/config/permissions";

import { getBearerSession } from "./bearer";
import { getSession, requireAuth } from "./server";
import type { Session } from "./types";

export class AuthorizationError extends Error {
  readonly status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
  }
}

/* -- Page guards (redirect / 404) ----------------------------------------- */

/** Require the active-org role to be one of `allowed`; otherwise 404. */
export async function requireRole(...allowed: string[]): Promise<Session> {
  const session = await requireAuth();
  if (!session.role || !allowed.includes(session.role)) notFound();
  return session;
}

/** Require a role-derived permission; otherwise 404. */
export async function requirePermission(
  permission: Permission,
): Promise<Session> {
  const session = await requireAuth();
  if (!hasPermission(session.role, permission)) notFound();
  return session;
}

/**
 * Require platform super-admin; otherwise 404. Deliberately separate from
 * `requireRole('admin')` — an org admin is NOT a super-admin (§14).
 */
export async function requireSuperAdmin(): Promise<Session> {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) notFound();
  return session;
}

/**
 * Require platform staff (super-admin OR support-admin); otherwise 404. The
 * support tier can view users, issue refunds, and respond to tickets — but
 * destructive/pricing/admin-creation paths stay `requireSuperAdmin()`.
 */
export async function requirePlatformStaff(): Promise<Session> {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin && !session.user.isSupportAdmin) notFound();
  return session;
}

/* -- API guard (throws, for JSON route handlers) -------------------------- */

export interface AuthorizeOptions {
  /** Allowed org role(s) for the active org. */
  role?: string | string[];
  /** A role-derived permission (from config/permissions.ts). */
  permission?: Permission;
  /** Require platform super-admin. */
  superAdmin?: boolean;
  /** Require platform staff — super-admin OR support-admin (never merged with
   * `superAdmin`, which stays exclusive per §14). */
  platformStaff?: boolean;
}

/** Shared option assertions for `authorize()` / `authorizeApi()`. */
function assertAuthorized(session: Session, options: AuthorizeOptions): void {
  if (options.superAdmin && !session.user.isSuperAdmin) {
    throw new AuthorizationError("Super-admin access required", 403);
  }
  if (
    options.platformStaff &&
    !session.user.isSuperAdmin &&
    !session.user.isSupportAdmin
  ) {
    throw new AuthorizationError("Staff access required", 403);
  }
  if (options.role !== undefined) {
    const allowed = Array.isArray(options.role) ? options.role : [options.role];
    if (!session.role || !allowed.includes(session.role)) {
      throw new AuthorizationError("Insufficient role", 403);
    }
  }
  if (options.permission && !hasPermission(session.role, options.permission)) {
    throw new AuthorizationError("Insufficient permission", 403);
  }
}

/**
 * Assert the current cookie session satisfies `options`, returning it on
 * success. Throws `AuthorizationError` (401 unauthenticated / 403 forbidden)
 * otherwise. With no options it just requires an authenticated session.
 */
export async function authorize(
  options: AuthorizeOptions = {},
): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AuthorizationError("Authentication required", 401);
  assertAuthorized(session, options);
  return session;
}

/**
 * Like `authorize()`, but for routes the Chrome extension may call: an
 * `Authorization: Bearer` header (extension-purpose JWT) is tried first, then
 * the cookie session. Web-only routes should keep using `authorize()`.
 */
export async function authorizeApi(
  request: Request,
  options: AuthorizeOptions = {},
): Promise<Session> {
  if (request.headers.get("authorization")) {
    const session = await getBearerSession(request);
    if (!session) {
      throw new AuthorizationError("Invalid or expired token", 401);
    }
    assertAuthorized(session, options);
    return session;
  }
  return authorize(options);
}

/**
 * Map an error thrown in a route handler to a JSON response. Any error
 * carrying a numeric `status` (e.g. UsageLimitError 402, RateLimitError 429)
 * keeps it, and an optional `payload` object is merged into the JSON body.
 */
export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }
  const status =
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 400;
  const payload = (error as { payload?: Record<string, unknown> }).payload;
  return NextResponse.json(
    { error: (error as Error).message ?? "Request failed", ...(payload ?? {}) },
    { status },
  );
}
