/**
 * lib/auth/types.ts — provider-agnostic auth types. Pure types only, so this
 * module is safe to import from anywhere (including Edge middleware).
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  /** Platform-level super-admin flag (§14) — independent of any org role. */
  isSuperAdmin: boolean;
  /** Platform-level support-admin flag — limited admin tier, never merged
   * with isSuperAdmin checks. */
  isSupportAdmin: boolean;
  /** Whether the user has verified their email address. */
  emailVerified: boolean;
}

export interface Session {
  user: AuthUser;
  /** The active organization for this session (cookie-selected, else default). */
  organizationId: string | null;
  /**
   * The user's role in the active org (`admin` | `user` | a fork's custom role),
   * or null when they have no membership. Typed as a string — same as
   * `OrgRole`/`roleSchema` — so this Edge-safe module stays dependency-free.
   */
  role: string | null;
}

export type OAuthProvider = "google" | "github" | "linkedin";

export interface SignUpInput {
  email: string;
  password: string;
  name?: string | null;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

/** A minimal identity result (no session established). Used by seed + signUp. */
export interface CreatedIdentity {
  user: AuthUser;
}
