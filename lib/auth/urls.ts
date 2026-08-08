/**
 * lib/auth/urls.ts — absolute app URLs for auth redirects.
 *
 * Use instead of `new URL(path, request.url)` in API routes. Behind Railway
 * (and similar proxies) `request.url` resolves to the internal host
 * (e.g. https://localhost:8080), which breaks post-OAuth redirects.
 */

import { env } from "@/config/env.schema";

/** Build an absolute URL from a path using the configured public app origin. */
export function appUrl(path: string): URL {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalized, base);
}
