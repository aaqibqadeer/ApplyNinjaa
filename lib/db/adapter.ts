/**
 * lib/db/adapter.ts — the DatabaseAdapter interface. CORE (CLAUDE.md §2).
 *
 * This is the ONE interface all application code imports (via `@/lib/db`). It
 * never leaks a provider detail. Concrete implementations live in ./supabase
 * and ./mongodb; the provider is selected once in ./index.ts — the only file
 * allowed to branch on `DB_PROVIDER` (§1.2).
 *
 * Kept intentionally minimal — user CRUD, organization CRUD, and org-membership
 * CRUD. Later phases extend it per-feature (each new table adds its methods here
 * alongside a Zod schema and a seed entry, in the same commit — §1.4).
 *
 * Tenant scoping (§1.3): membership methods take `organizationId` as their first
 * argument so every tenant-scoped read/write is explicitly org-bound.
 */

import type {
  AdminAction,
  Application,
  ApplicationStatus,
  AppSettings,
  GmailScan,
  Invitation,
  InvitationStatus,
  JobFilter,
  NewAdminAction,
  NewApplication,
  NewGmailScan,
  NewInvitation,
  NewJobFilter,
  NewOrganization,
  NewOrganizationMember,
  NewPlan,
  NewProfile,
  NewSubscription,
  NewUser,
  Organization,
  OrganizationMember,
  OrgRole,
  Plan,
  Profile,
  ProfileDomainPref,
  Subscription,
  UpdateApplication,
  UpdateAppSettings,
  UpdateGmailScan,
  UpdateJobFilter,
  UpdateOrganization,
  UpdatePlan,
  UpdateProfile,
  UpdateSubscription,
  UpdateUser,
  User,
  UserFilterSetting,
} from "./schema";

/** Paged user listing for the admin dashboard. */
export interface ListUsersParams {
  /** Case-insensitive match against email or name. */
  search?: string;
  limit?: number;
  offset?: number;
}
export interface ListUsersResult {
  users: User[];
  total: number;
}

export interface ListAdminActionsParams {
  limit?: number;
  offset?: number;
}
export interface ListAdminActionsResult {
  actions: AdminAction[];
  total: number;
}

export interface DatabaseAdapter {
  /* -- Users (global identities) ------------------------------------------ */
  createUser(input: NewUser): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByUnsubscribeToken(token: string): Promise<User | null>;
  /** Paged search across all users (admin dashboard). */
  listUsers(params?: ListUsersParams): Promise<ListUsersResult>;
  updateUser(id: string, patch: UpdateUser): Promise<User>;
  deleteUser(id: string): Promise<void>;

  /* -- Organizations (tenant boundary) ------------------------------------ */
  createOrganization(input: NewOrganization): Promise<Organization>;
  getOrganizationById(id: string): Promise<Organization | null>;
  getOrganizationBySlug(slug: string): Promise<Organization | null>;
  updateOrganization(
    id: string,
    patch: UpdateOrganization,
  ): Promise<Organization>;
  deleteOrganization(id: string): Promise<void>;

  /* -- Organization membership (tenant-scoped by organizationId) ---------- */
  addMember(input: NewOrganizationMember): Promise<OrganizationMember>;
  getMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null>;
  listMembers(organizationId: string): Promise<OrganizationMember[]>;
  /** All memberships for a user across orgs — used to resolve org context. */
  listMembershipsForUser(userId: string): Promise<OrganizationMember[]>;
  /** Batched variant for admin joins (user → default org → subscription). */
  listMembershipsForUsers(userIds: string[]): Promise<OrganizationMember[]>;
  updateMemberRole(
    organizationId: string,
    userId: string,
    role: OrgRole,
  ): Promise<OrganizationMember>;
  removeMember(organizationId: string, userId: string): Promise<void>;

  /* -- Invitations (tenant-scoped by organizationId) ---------------------- */
  createInvitation(input: NewInvitation): Promise<Invitation>;
  getInvitationByToken(token: string): Promise<Invitation | null>;
  listInvitations(organizationId: string): Promise<Invitation[]>;
  updateInvitationStatus(
    id: string,
    status: InvitationStatus,
  ): Promise<Invitation>;
  /** A still-pending invite for this email in this org, if any (dedupe check). */
  getPendingInvitationForEmail(
    organizationId: string,
    email: string,
  ): Promise<Invitation | null>;

  /* -- Organization billing lookup (Phase 5) ------------------------------ */
  /** Find the org linked to a Stripe customer id — used by the webhook. */
  getOrganizationByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<Organization | null>;

  /* -- Plans (PLATFORM-LEVEL — no organizationId, §15) -------------------- */
  createPlan(input: NewPlan): Promise<Plan>;
  getPlanById(id: string): Promise<Plan | null>;
  /** Stable-slug lookup ("free", "pro") — code never matches on names. */
  getPlanBySlug(slug: string): Promise<Plan | null>;
  /** All plans (admin view), ordered by sortOrder. */
  listPlans(): Promise<Plan[]>;
  /** Active plans only (public pricing view), ordered by sortOrder. */
  listActivePlans(): Promise<Plan[]>;
  updatePlan(id: string, patch: UpdatePlan): Promise<Plan>;
  deletePlan(id: string): Promise<void>;

  /* -- App settings (PLATFORM-LEVEL singleton) ---------------------------- */
  /** Read the singleton settings row, creating it with defaults if missing. */
  getAppSettings(): Promise<AppSettings>;
  updateAppSettings(patch: UpdateAppSettings): Promise<AppSettings>;

  /* -- Subscriptions (tenant-scoped by organizationId) -------------------- */
  createSubscription(input: NewSubscription): Promise<Subscription>;
  getSubscriptionByOrg(organizationId: string): Promise<Subscription | null>;
  /** Look up by the provider subscription id — used by the webhook. */
  getSubscriptionByStripeId(
    stripeSubscriptionId: string,
  ): Promise<Subscription | null>;
  /** All subscriptions across every org (super-admin cross-org view, §15). */
  listSubscriptions(): Promise<Subscription[]>;
  updateSubscription(
    id: string,
    patch: UpdateSubscription,
  ): Promise<Subscription>;
  /** Batched variant for admin joins across many orgs. */
  listSubscriptionsForOrgs(organizationIds: string[]): Promise<Subscription[]>;

  /* -- Profiles (tenant-scoped; multiple per user) ------------------------- */
  createProfile(input: NewProfile): Promise<Profile>;
  getProfileById(id: string): Promise<Profile | null>;
  listProfilesForUser(userId: string): Promise<Profile[]>;
  updateProfile(id: string, patch: UpdateProfile): Promise<Profile>;
  deleteProfile(id: string): Promise<void>;

  /* -- Profile domain prefs (last-used profile per job-site domain) -------- */
  setProfileDomainPref(
    organizationId: string,
    userId: string,
    domain: string,
    profileId: string,
  ): Promise<ProfileDomainPref>;
  getProfileDomainPref(
    userId: string,
    domain: string,
  ): Promise<ProfileDomainPref | null>;

  /* -- Applications (tenant-scoped) ---------------------------------------- */
  createApplication(input: NewApplication): Promise<Application>;
  getApplicationById(id: string): Promise<Application | null>;
  /** All of a user's applications, newest appliedAt first. */
  listApplicationsForUser(userId: string): Promise<Application[]>;
  updateApplication(id: string, patch: UpdateApplication): Promise<Application>;
  deleteApplication(id: string): Promise<void>;
  /** Bulk delete, scoped to the owning user; returns the deleted count. */
  deleteApplicationsForUser(userId: string, ids: string[]): Promise<number>;
  /** Bulk status change, scoped to the owning user; returns the count. */
  updateApplicationsStatusForUser(
    userId: string,
    ids: string[],
    status: ApplicationStatus,
  ): Promise<number>;

  /* -- Job filters (admin master list + per-user custom) ------------------- */
  createJobFilter(input: NewJobFilter): Promise<JobFilter>;
  getJobFilterById(id: string): Promise<JobFilter | null>;
  /** The admin-managed master list (both active and inactive, admin view). */
  listAdminJobFilters(): Promise<JobFilter[]>;
  /** Active admin defaults + this user's own custom filters. */
  listJobFiltersForUser(userId: string): Promise<JobFilter[]>;
  updateJobFilter(id: string, patch: UpdateJobFilter): Promise<JobFilter>;
  deleteJobFilter(id: string): Promise<void>;

  /* -- User filter settings (per-user enable/disable toggles) -------------- */
  setUserFilterEnabled(
    organizationId: string,
    userId: string,
    filterId: string,
    enabled: boolean,
  ): Promise<UserFilterSetting>;
  listUserFilterSettings(userId: string): Promise<UserFilterSetting[]>;

  /* -- Admin actions (append-only audit log) ------------------------------- */
  createAdminAction(input: NewAdminAction): Promise<AdminAction>;
  listAdminActions(
    params?: ListAdminActionsParams,
  ): Promise<ListAdminActionsResult>;

  /* -- Gmail scans (manual, user-approved) --------------------------------- */
  createGmailScan(input: NewGmailScan): Promise<GmailScan>;
  getGmailScanById(id: string): Promise<GmailScan | null>;
  listGmailScansForUser(userId: string): Promise<GmailScan[]>;
  updateGmailScan(id: string, patch: UpdateGmailScan): Promise<GmailScan>;

  /* -- Lifecycle ---------------------------------------------------------- */
  /** Close underlying connections (used by scripts like seed). Optional. */
  disconnect?(): Promise<void>;
}
