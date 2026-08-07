/**
 * lib/auth/mongodb/adapter.ts — custom auth for the MongoDB provider.
 *
 * Passwords: bcrypt-hashed, stored in an `auth_credentials` collection keyed by
 * user id (users created via magic-link/OAuth simply have no credential row).
 * Sessions: an HS256 JWT (see ../jwt) in an httpOnly cookie. Password-reset and
 * magic-link tokens are stateless signed JWTs (no DB rows). OAuth is a manual
 * authorization-code flow for Google/GitHub/LinkedIn.
 *
 * Node-only (mongoose, bcrypt, next/headers). Never import from Edge middleware.
 */

import { cookies } from "next/headers";
import mongoose, { Schema, type Model } from "mongoose";
import bcrypt from "bcryptjs";

import { env } from "@/config/env.schema";
import { db, USER_STATUSES, type User } from "@/lib/db";
import { connectMongo } from "@/lib/db/mongodb/adapter";
import { startTrialIfEligible } from "@/lib/payments/trials";

import type { AuthAdapter } from "../adapter";
import {
  MAGIC_LINK_TTL_SECONDS,
  OAUTH_STATE_COOKIE,
  RESET_TOKEN_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  TOKEN_PURPOSE,
  sessionCookieOptions,
} from "../constants";
import { sendEmail } from "@/lib/email/send";
import { signToken, verifyToken } from "../jwt";
import { ensureDefaultOrganization, resolveActiveOrgContext } from "../org";
import type {
  AuthUser,
  CreatedIdentity,
  OAuthProvider,
  ResetPasswordInput,
  Session,
  SignInInput,
  SignUpInput,
} from "../types";

/* -- Credential storage ---------------------------------------------------- */

interface AuthCredentialDoc {
  user_id: mongoose.Types.ObjectId;
  password_hash: string;
}

const authCredentialSchema = new Schema<AuthCredentialDoc>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    password_hash: { type: String, required: true },
  },
  { timestamps: true, collection: "auth_credentials" },
);

const AuthCredentialModel: Model<AuthCredentialDoc> =
  (mongoose.models.AuthCredential as Model<AuthCredentialDoc> | undefined) ??
  mongoose.model<AuthCredentialDoc>("AuthCredential", authCredentialSchema);

/* -- OAuth provider endpoints ---------------------------------------------- */

interface OAuthProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
}

const OAUTH_PROVIDERS: Record<OAuthProvider, OAuthProviderConfig> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    scope: "openid email profile",
    clientId: () => env.GOOGLE_CLIENT_ID,
    clientSecret: () => env.GOOGLE_CLIENT_SECRET,
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    scope: "read:user user:email",
    clientId: () => env.GITHUB_CLIENT_ID,
    clientSecret: () => env.GITHUB_CLIENT_SECRET,
  },
  // LinkedIn's OpenID Connect flow — userinfo returns { email, name } like
  // Google's, so the generic profile parse below covers it.
  linkedin: {
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    userInfoUrl: "https://api.linkedin.com/v2/userinfo",
    scope: "openid profile email",
    clientId: () => env.LINKEDIN_CLIENT_ID,
    clientSecret: () => env.LINKEDIN_CLIENT_SECRET,
  },
};

interface OAuthProfile {
  email: string;
  name: string | null;
}

/** Suspended/banned/pending-deletion accounts cannot sign in (data retained). */
function assertAccountActive(user: Pick<User, "status">): void {
  if (user.status === USER_STATUSES.active) return;
  if (user.status === USER_STATUSES.pending_deletion) {
    throw new Error(
      "This account is scheduled for deletion. Contact support to restore it.",
    );
  }
  throw new Error("This account has been suspended. Contact support.");
}

/* -------------------------------------------------------------------------- */

export class MongoAuthAdapter implements AuthAdapter {
  /* -- Session cookie helpers -------------------------------------------- */

  private async setSessionCookie(userId: string): Promise<void> {
    const token = await signToken(
      { sub: userId, purpose: TOKEN_PURPOSE.session },
      SESSION_MAX_AGE_SECONDS,
    );
    const store = await cookies();
    store.set(SESSION_COOKIE, token, sessionCookieOptions);
  }

  private async buildSession(user: AuthUser): Promise<Session> {
    const { organizationId, role } = await resolveActiveOrgContext(user.id);
    return { user, organizationId, role };
  }

  async getSession(): Promise<Session | null> {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const claims = await verifyToken(token, TOKEN_PURPOSE.session);
    if (!claims) return null;
    const user = await db.getUserById(claims.sub);
    // Suspended/banned/pending-deletion accounts lose their session immediately.
    if (!user || user.status !== USER_STATUSES.active) return null;
    return this.buildSession(toAuthUser(user));
  }

  async signOut(): Promise<void> {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
  }

  /* -- Email / password --------------------------------------------------- */

  async createCredentials(input: SignUpInput): Promise<CreatedIdentity> {
    await connectMongo();
    const existing = await db.getUserByEmail(input.email);
    if (existing) {
      throw new Error("A user with that email already exists");
    }
    const user = await db.createUser({
      email: input.email,
      name: input.name ?? null,
      unsubscribeToken: crypto.randomUUID(),
    });
    const passwordHash = await bcrypt.hash(input.password, 10);
    await AuthCredentialModel.create({
      user_id: new mongoose.Types.ObjectId(user.id),
      password_hash: passwordHash,
    });
    return { user: toAuthUser(user) };
  }

  async signUp(input: SignUpInput): Promise<Session> {
    const { user } = await this.createCredentials(input);
    await ensureDefaultOrganization(user);
    await this.setSessionCookie(user.id);
    return this.buildSession(user);
  }

  async signIn(input: SignInInput): Promise<Session> {
    await connectMongo();
    const user = await db.getUserByEmail(input.email);
    if (!user) throw new Error("Invalid email or password");
    const credential = await AuthCredentialModel.findOne({
      user_id: new mongoose.Types.ObjectId(user.id),
    })
      .lean<AuthCredentialDoc>()
      .exec();
    if (!credential) throw new Error("Invalid email or password");
    const ok = await bcrypt.compare(input.password, credential.password_hash);
    if (!ok) throw new Error("Invalid email or password");
    assertAccountActive(user);
    await this.setSessionCookie(user.id);
    return this.buildSession(toAuthUser(user));
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await db.getUserByEmail(email);
    // Do not reveal whether the account exists.
    if (!user) return;
    const token = await signToken(
      { sub: user.id, purpose: TOKEN_PURPOSE.passwordReset },
      RESET_TOKEN_TTL_SECONDS,
    );
    const url = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: email,
      subject: "Reset your password",
      text: `Reset your password: ${url}`,
      html: `<p>Reset your password by clicking <a href="${url}">this link</a>. It expires in 1 hour.</p>`,
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await connectMongo();
    const claims = await verifyToken(input.token, TOKEN_PURPOSE.passwordReset);
    if (!claims) throw new Error("Invalid or expired reset token");
    const passwordHash = await bcrypt.hash(input.password, 10);
    await AuthCredentialModel.findOneAndUpdate(
      { user_id: new mongoose.Types.ObjectId(claims.sub) },
      { password_hash: passwordHash },
      { upsert: true },
    ).exec();
  }

  /* -- Magic link --------------------------------------------------------- */

  async sendMagicLink(email: string): Promise<void> {
    const token = await signToken(
      { sub: email, purpose: TOKEN_PURPOSE.magicLink, email },
      MAGIC_LINK_TTL_SECONDS,
    );
    const url = `${env.NEXT_PUBLIC_APP_URL}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: email,
      subject: "Your sign-in link",
      text: `Sign in: ${url}`,
      html: `<p>Sign in by clicking <a href="${url}">this link</a>. It expires in 15 minutes.</p>`,
    });
  }

  async verifyMagicLink(token: string): Promise<Session> {
    const claims = await verifyToken(token, TOKEN_PURPOSE.magicLink);
    if (!claims?.email) throw new Error("Invalid or expired magic link");
    const user = await this.findOrCreateUser(claims.email, null);
    await this.setSessionCookie(user.id);
    return this.buildSession(user);
  }

  /* -- OAuth (authorization-code flow) ------------------------------------ */

  async getOAuthUrl(
    provider: OAuthProvider,
    redirectTo?: string,
  ): Promise<string> {
    const config = OAUTH_PROVIDERS[provider];
    const clientId = config.clientId();
    if (!clientId) throw new Error(`${provider} OAuth is not configured`);

    const state = crypto.randomUUID();
    const store = await cookies();
    store.set(OAUTH_STATE_COOKIE, `${state}:${redirectTo ?? ""}`, {
      ...sessionCookieOptions,
      maxAge: 600,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.callbackUrl(provider),
      response_type: "code",
      scope: config.scope,
      state,
    });
    return `${config.authorizeUrl}?${params.toString()}`;
  }

  async completeOAuth(
    provider: OAuthProvider,
    params: { code: string; state?: string },
  ): Promise<Session> {
    const store = await cookies();
    const stored = store.get(OAUTH_STATE_COOKIE)?.value ?? "";
    const [expectedState] = stored.split(":");
    if (!params.state || params.state !== expectedState) {
      throw new Error("OAuth state mismatch");
    }
    store.delete(OAUTH_STATE_COOKIE);

    const profile = await this.fetchOAuthProfile(provider, params.code);
    const user = await this.findOrCreateUser(profile.email, profile.name);
    await this.setSessionCookie(user.id);
    return this.buildSession(user);
  }

  private callbackUrl(provider: OAuthProvider): string {
    return `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback/${provider}`;
  }

  private async fetchOAuthProfile(
    provider: OAuthProvider,
    code: string,
  ): Promise<OAuthProfile> {
    const config = OAUTH_PROVIDERS[provider];
    const clientId = config.clientId();
    const clientSecret = config.clientSecret();
    if (!clientId || !clientSecret) {
      throw new Error(`${provider} OAuth is not configured`);
    }

    const tokenRes = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: this.callbackUrl(provider),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      throw new Error(`${provider} token exchange failed (${tokenRes.status})`);
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) throw new Error(`${provider} returned no access token`);

    const userRes = await fetch(config.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "ninjakit",
      },
    });
    if (!userRes.ok) {
      throw new Error(`${provider} userinfo failed (${userRes.status})`);
    }
    const info = (await userRes.json()) as {
      email?: string | null;
      name?: string | null;
      login?: string | null;
    };

    let email = info.email ?? null;
    if (!email && provider === "github") {
      email = await fetchGithubPrimaryEmail(accessToken);
    }
    if (!email) throw new Error(`${provider} did not return an email`);

    return { email, name: info.name ?? info.login ?? null };
  }

  /**
   * Shared by OAuth and magic-link — both flows prove ownership of the email,
   * so the account is marked verified (and the one-per-verified-email Pro
   * trial starts) here, without a separate verification step.
   */
  private async findOrCreateUser(
    email: string,
    name: string | null,
  ): Promise<AuthUser> {
    const existing = await db.getUserByEmail(email);
    if (existing) {
      assertAccountActive(existing);
      if (!existing.emailVerifiedAt) {
        const verified = await db.updateUser(existing.id, {
          emailVerifiedAt: new Date(),
        });
        const orgId = await ensureDefaultOrganization(toAuthUser(verified));
        await startTrialIfEligible(verified.id, orgId);
        return toAuthUser(verified);
      }
      return toAuthUser(existing);
    }
    const created = await db.createUser({
      email,
      name,
      unsubscribeToken: crypto.randomUUID(),
    });
    const withVerification = await db.updateUser(created.id, {
      emailVerifiedAt: new Date(),
    });
    const user = toAuthUser(withVerification);
    const orgId = await ensureDefaultOrganization(user);
    await startTrialIfEligible(user.id, orgId);
    return user;
  }

  async ensureDefaultOrganization(user: AuthUser): Promise<string> {
    return ensureDefaultOrganization(user);
  }
}

async function fetchGithubPrimaryEmail(
  accessToken: string,
): Promise<string | null> {
  const res = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "ninjakit",
    },
  });
  if (!res.ok) return null;
  const emails = (await res.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;
  const primary = emails.find((e) => e.primary && e.verified) ?? emails[0];
  return primary?.email ?? null;
}

function toAuthUser(user: {
  id: string;
  email: string;
  name?: string | null;
  isSuperAdmin?: boolean;
  isSupportAdmin?: boolean;
  emailVerifiedAt?: Date | null;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    isSuperAdmin: user.isSuperAdmin ?? false,
    isSupportAdmin: user.isSupportAdmin ?? false,
    emailVerified: Boolean(user.emailVerifiedAt),
  };
}
