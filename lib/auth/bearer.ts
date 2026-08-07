/**
 * lib/auth/bearer.ts — Bearer-token session resolution for the Chrome
 * extension (Node).
 *
 * The extension can't use the httpOnly session cookie beyond the one-time
 * exchange at `/api/auth/extension-token`, so it holds a long-lived JWT with
 * purpose `extension` (chrome.storage.local) and sends it as
 * `Authorization: Bearer <token>`. Routes that accept extension traffic call
 * `authorizeApi(request, ...)` (lib/auth/roles.ts), which tries this first
 * and falls back to the cookie session.
 */

import { db, USER_STATUSES } from "@/lib/db";

import { TOKEN_PURPOSE } from "./constants";
import { verifyToken } from "./jwt";
import { resolveActiveOrgContext } from "./org";
import type { Session } from "./types";

export async function getBearerSession(
  request: Request,
): Promise<Session | null> {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice("bearer ".length).trim();

  const claims = await verifyToken(token, TOKEN_PURPOSE.extension);
  if (!claims) return null;

  const user = await db.getUserById(claims.sub);
  // Suspended/banned accounts lose extension access immediately too.
  if (!user || user.status !== USER_STATUSES.active) return null;

  const { organizationId, role } = await resolveActiveOrgContext(user.id);
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      isSuperAdmin: user.isSuperAdmin,
      isSupportAdmin: user.isSupportAdmin,
      emailVerified: Boolean(user.emailVerifiedAt),
    },
    organizationId,
    role,
  };
}
