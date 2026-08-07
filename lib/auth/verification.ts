/**
 * lib/auth/verification.ts — email-verification flow helpers (Node).
 *
 * Verification tokens are stateless signed JWTs (purpose `email_verify`), the
 * same pattern as password-reset/magic-link. Verifying marks
 * `users.email_verified_at` and starts the one-per-verified-email free trial
 * (lib/payments/trials.ts). OAuth/magic-link sign-ins verify implicitly (the
 * provider proved the email), so only the email+password flow sends this.
 */

import { APP_NAME } from "@/config/brand";
import { env } from "@/config/env.schema";
import { db, type User } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { startTrialIfEligible } from "@/lib/payments/trials";

import { EMAIL_VERIFY_TTL_SECONDS, TOKEN_PURPOSE } from "./constants";
import { signToken, verifyToken } from "./jwt";
import { resolveDefaultOrganizationId } from "./org";

export async function sendVerificationEmail(user: {
  id: string;
  email: string;
}): Promise<void> {
  const token = await signToken(
    { sub: user.id, purpose: TOKEN_PURPOSE.emailVerify },
    EMAIL_VERIFY_TTL_SECONDS,
  );
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    subject: `Verify your ${APP_NAME} email`,
    text: `Confirm your email to activate your account: ${url}`,
    html:
      `<p>Welcome to ${APP_NAME}! Confirm your email by clicking ` +
      `<a href="${url}">this link</a>. It expires in 24 hours.</p>` +
      `<p>Verifying activates your account and starts your free trial.</p>`,
  });
}

/**
 * Consume a verification token: mark the user verified (idempotent) and start
 * the free trial if eligible. Returns the user, or null for a bad/expired token.
 */
export async function consumeVerificationToken(
  token: string,
): Promise<User | null> {
  const claims = await verifyToken(token, TOKEN_PURPOSE.emailVerify);
  if (!claims) return null;
  const user = await db.getUserById(claims.sub);
  if (!user) return null;
  if (user.emailVerifiedAt) return user;

  const verified = await db.updateUser(user.id, {
    emailVerifiedAt: new Date(),
  });
  const organizationId = await resolveDefaultOrganizationId(user.id);
  if (organizationId) {
    await startTrialIfEligible(user.id, organizationId);
  }
  return verified;
}
