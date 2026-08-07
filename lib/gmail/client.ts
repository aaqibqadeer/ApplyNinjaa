/**
 * lib/gmail/client.ts — minimal Gmail REST client (read-only). Raw fetch, no
 * SDK — same approach as the Resend/Twilio integrations.
 */

import { env } from "@/config/env.schema";

export interface GmailMessageMeta {
  id: string;
  from: string;
  subject: string;
  receivedAt: Date | null;
  snippet: string;
}

/** Mint a short-lived access token from the stored refresh token. */
export async function getAccessToken(refreshToken: string): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth client is not configured");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(
      "Gmail access expired — disconnect and reconnect your Gmail account",
    );
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Gmail returned no access token");
  return data.access_token;
}

function gmailDate(date: Date): string {
  return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

/** Message ids in the date range (inbox), capped by `max`. */
export async function listMessageIds(
  accessToken: string,
  range: { from: Date; to: Date },
  max: number,
): Promise<string[]> {
  const query = `in:inbox after:${gmailDate(range.from)} before:${gmailDate(
    new Date(range.to.getTime() + 24 * 60 * 60 * 1000),
  )}`;
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(max));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail list failed (${res.status})`);
  const data = (await res.json()) as { messages?: Array<{ id: string }> };
  return (data.messages ?? []).map((m) => m.id);
}

/** Metadata + snippet for one message (never the full body — Limited Use). */
export async function getMessageMeta(
  accessToken: string,
  id: string,
): Promise<GmailMessageMeta> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`,
  );
  url.searchParams.set("format", "metadata");
  for (const header of ["From", "Subject", "Date"]) {
    url.searchParams.append("metadataHeaders", header);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail message fetch failed (${res.status})`);
  const data = (await res.json()) as {
    snippet?: string;
    payload?: { headers?: Array<{ name: string; value: string }> };
  };
  const headers = new Map(
    (data.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]),
  );
  const dateHeader = headers.get("date");
  const parsedDate = dateHeader ? new Date(dateHeader) : null;
  return {
    id,
    from: headers.get("from") ?? "",
    subject: headers.get("subject") ?? "",
    receivedAt:
      parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
    snippet: data.snippet ?? "",
  };
}
