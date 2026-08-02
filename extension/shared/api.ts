/**
 * Backend API client for the extension.
 *
 * Auth model: a long-lived Bearer token (purpose "extension") stored in
 * chrome.storage.local. When missing/expired, we exchange the dashboard's
 * session cookie for a fresh one via POST /api/auth/extension-token — the
 * fetch runs from extension pages with host_permissions, so the httpOnly
 * cookie rides along and no CORS applies. If that 401s, the user must sign
 * in to the dashboard first.
 */

import type { ApiError } from "./types";

declare const __API_ORIGIN__: string;

export const API_ORIGIN = __API_ORIGIN__;

const TOKEN_KEY = "extensionToken";
const TOKEN_EXPIRES_KEY = "extensionTokenExpiresAt";

export class SignInRequiredError extends Error {
  constructor() {
    super("Sign in to the dashboard to continue");
    this.name = "SignInRequiredError";
  }
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: ApiError;
  constructor(status: number, body: ApiError) {
    super(body.error || `Request failed (${status})`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

async function storedToken(): Promise<string | null> {
  const data = await chrome.storage.local.get([TOKEN_KEY, TOKEN_EXPIRES_KEY]);
  const token = data[TOKEN_KEY] as string | undefined;
  const expiresAt = data[TOKEN_EXPIRES_KEY] as string | undefined;
  if (!token) return null;
  if (expiresAt && Date.parse(expiresAt) < Date.now() + 60_000) return null;
  return token;
}

async function exchangeToken(): Promise<string> {
  const res = await fetch(`${API_ORIGIN}/api/auth/extension-token`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new SignInRequiredError();
  const data = (await res.json()) as { token: string; expiresAt: string };
  await chrome.storage.local.set({
    [TOKEN_KEY]: data.token,
    [TOKEN_EXPIRES_KEY]: data.expiresAt,
  });
  return data.token;
}

export async function getToken(): Promise<string> {
  return (await storedToken()) ?? exchangeToken();
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove([TOKEN_KEY, TOKEN_EXPIRES_KEY]);
}

/** Authenticated JSON request; retries once with a fresh token on 401. */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  async function attempt(token: string): Promise<Response> {
    return fetch(`${API_ORIGIN}${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  }

  let res = await attempt(await getToken());
  if (res.status === 401) {
    await clearToken();
    res = await attempt(await exchangeToken());
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiError;
    throw new ApiRequestError(res.status, body);
  }
  return (await res.json()) as T;
}
