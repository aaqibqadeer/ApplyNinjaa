/**
 * lib/gmail/oauth.ts — the SEPARATE Gmail consent flow (product spec §7).
 *
 * Deliberately independent of login OAuth: read-only Gmail access is an
 * opt-in scope requested on its own consent screen (Google Limited Use), with
 * its own callback and state cookie. Reuses the same Google OAuth client
 * (GOOGLE_CLIENT_ID/SECRET) — add the gmail.readonly scope in the Google
 * Cloud console.
 */

import { cookies } from "next/headers";

import { env } from "@/config/env.schema";
import { sessionCookieOptions } from "@/lib/auth/constants";

import { saveGmailToken } from "./store";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_STATE_COOKIE = "ninjakit_gmail_state";

function requireClient(): { clientId: string; clientSecret: string } {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth client is not configured");
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  };
}

function callbackUrl(): string {
  return `${env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`;
}

export async function getGmailAuthUrl(): Promise<string> {
  const { clientId } = requireClient();
  const state = crypto.randomUUID();
  const store = await cookies();
  store.set(GMAIL_STATE_COOKIE, state, {
    ...sessionCookieOptions,
    maxAge: 600,
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: GMAIL_SCOPE,
    // Offline + forced consent so Google returns a refresh token every time.
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Exchange the code, verify state, and persist the encrypted refresh token. */
export async function completeGmailOAuth(
  userId: string,
  code: string,
  state: string | null,
): Promise<void> {
  const store = await cookies();
  const expected = store.get(GMAIL_STATE_COOKIE)?.value;
  if (!expected || !state || expected !== state) {
    throw new Error("Gmail OAuth state mismatch");
  }
  store.delete(GMAIL_STATE_COOKIE);

  const { clientId, clientSecret } = requireClient();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Gmail token exchange failed (${tokenRes.status})`);
  }
  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
  };
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token — try again");
  }

  // Identify the connected mailbox for the settings UI.
  let emailAddress: string | null = null;
  if (tokens.access_token) {
    const profileRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as { emailAddress?: string };
      emailAddress = profile.emailAddress ?? null;
    }
  }

  await saveGmailToken(
    userId,
    tokens.refresh_token,
    emailAddress,
    tokens.scope ?? GMAIL_SCOPE,
  );
}
