/**
 * middleware.ts — route protection (CLAUDE.md Phase 3 step 4).
 *
 * Redirects unauthenticated users away from protected routes to /login (with a
 * `next` param to return them afterwards). Public routes (auth pages, the auth
 * API, and the marketing home) are always allowed. Provider-specific session
 * reading (and Supabase cookie refresh) is delegated to the Edge-safe
 * `getEdgeSession` so this file stays provider-agnostic.
 *
 * Org context: the session resolves the user's default organization server-side
 * (Session.organizationId). Subdomain/path-based org routing is part of the
 * multiTenant UI and is deferred to that phase.
 */

import { NextResponse, type NextRequest } from "next/server";

import { LOGIN_PATH } from "@/lib/auth/constants";
import { getEdgeSession } from "@/lib/auth/edge";

const PUBLIC_PATHS = [
  LOGIN_PATH,
  "/signup",
  "/reset-password",
  "/forgot-password",
  // Legal pages must be readable without an account (linked from the footer
  // and the cookie banner).
  "/privacy",
  "/terms",
  "/cookie-policy",
];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  // SEO files must be crawlable without a session (Phase 9).
  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") return true;
  if (pathname.startsWith("/api/auth")) return true;
  // Stripe webhooks are authenticated by signature, not a session cookie — they
  // must bypass the login redirect (Phase 5).
  if (pathname === "/api/payments/webhook") return true;
  // One-click unsubscribe links must work without a session (CAN-SPAM).
  if (pathname === "/api/email/unsubscribe") return true;
  // Extension traffic authenticates with a Bearer token, not the cookie — pass
  // it through so the handler's authorizeApi() returns 401 JSON instead of the
  // middleware 307-ing to /login (same precedent as the Stripe webhook).
  if (pathname.startsWith("/api/extension")) return true;
  if (pathname.startsWith("/api/ai")) return true;
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { isAuthenticated, response } = await getEdgeSession(request);
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) return response;

  // Bearer-authenticated API traffic (Chrome extension) skips the login
  // redirect — every handler still enforces auth itself via authorizeApi().
  if (
    pathname.startsWith("/api/") &&
    request.headers.get("authorization")?.toLowerCase().startsWith("bearer ")
  ) {
    return response;
  }

  if (!isAuthenticated) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
