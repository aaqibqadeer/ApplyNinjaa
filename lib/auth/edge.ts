/**
 * lib/auth/edge.ts — Edge-safe session check for `middleware.ts`.
 *
 * Must NOT import the Node adapter (mongoose) or `@/lib/auth`. It only needs
 * to know whether a request is authenticated: verify the session JWT cookie
 * with `jose` (no DB round-trip). This is the Edge counterpart of the Node
 * accessor in ./index.ts.
 */

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, TOKEN_PURPOSE } from "./constants";
import { verifyToken } from "./jwt";

export interface EdgeSessionResult {
  isAuthenticated: boolean;
  /** Response to continue with. */
  response: NextResponse;
}

export async function getEdgeSession(
  request: NextRequest,
): Promise<EdgeSessionResult> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifyToken(token, TOKEN_PURPOSE.session) : null;
  return { isAuthenticated: claims !== null, response: NextResponse.next() };
}
