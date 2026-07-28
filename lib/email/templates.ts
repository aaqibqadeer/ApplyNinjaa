/**
 * lib/email/templates.ts — branded email helpers over the raw `sendEmail`.
 *
 * Two channels with different rules (product spec §10):
 * - TRANSACTIONAL (receipts, security, status changes, AI-limit warnings):
 *   always sent — never subject to marketing preferences.
 * - MARKETING: sent only while `user.marketingEmailsEnabled` is true, and
 *   every send carries a working one-click unsubscribe link (CAN-SPAM).
 *   Users are subscribed at signup and can opt out via the link or account
 *   settings.
 */

import { APP_NAME } from "@/config/brand";
import { env } from "@/config/env.schema";
import type { User } from "@/lib/db";

import { sendEmail } from "./send";

function layout(bodyHtml: string, footerHtml = ""): string {
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <div style="font-weight:700;font-size:18px;color:#1e3a5f;margin-bottom:16px">${APP_NAME}</div>
  <div style="font-size:14px;line-height:1.6;color:#1f2937">${bodyHtml}</div>
  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">
    ${footerHtml}
  </div>
</div>`;
}

export interface TransactionalEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Always delivered — receipts, security notices, AI-limit warnings, etc. */
export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<void> {
  await sendEmail({
    to: input.to,
    subject: input.subject,
    html: layout(input.html, `Sent by ${APP_NAME}.`),
    text: input.text,
  });
}

export interface MarketingRecipient {
  email: string;
  marketingEmailsEnabled: boolean;
  unsubscribeToken: string | null;
}

/**
 * Marketing send — no-ops for opted-out users; every delivered email gets a
 * working unsubscribe link. Returns whether it was actually sent.
 */
export async function sendMarketingEmail(
  user: MarketingRecipient,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!user.marketingEmailsEnabled || !user.unsubscribeToken) return false;
  const unsubscribeUrl = `${env.NEXT_PUBLIC_APP_URL}/api/email/unsubscribe?token=${encodeURIComponent(user.unsubscribeToken)}`;
  await sendEmail({
    to: user.email,
    subject,
    html: layout(
      html,
      `You're receiving this because you have an ${APP_NAME} account. ` +
        `<a href="${unsubscribeUrl}" style="color:#6b7280">Unsubscribe</a> from marketing emails.`,
    ),
  });
  return true;
}

/** Transactional AI-limit warning, fired when the last AI action is spent. */
export async function sendAiLimitReachedEmail(
  user: Pick<User, "email">,
  cap: number,
): Promise<void> {
  await sendTransactionalEmail({
    to: user.email,
    subject: `You've used all ${cap} AI actions this month`,
    html:
      `<p>You just used the last of your ${cap} monthly AI actions on ${APP_NAME}.</p>` +
      `<p>AI analysis, autofill, and Gmail scans are paused until your month resets — or upgrade for a higher limit:</p>` +
      `<p><a href="${env.NEXT_PUBLIC_APP_URL}/settings/billing">View plans</a></p>`,
    text: `You've used all ${cap} AI actions this month. Upgrade: ${env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  });
}
