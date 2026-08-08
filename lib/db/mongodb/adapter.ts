/**
 * lib/db/mongodb/adapter.ts — MongoDB implementation of DatabaseAdapter.
 *
 * Uses Mongoose. Every tenant-scoped collection carries an indexed
 * `organization_id` field (§1.3); membership is additionally uniquely indexed on
 * `(organization_id, user_id)`. Connection is established lazily on first query
 * and reused. Documents are mapped to the canonical camelCase domain models in
 * ../schema (Mongo stores `_id`/snake_case; the domain layer never sees them).
 */

import mongoose, { Schema, type Model } from "mongoose";

import { env } from "@/config/env.schema";
import type {
  DatabaseAdapter,
  ListAdminActionsParams,
  ListAdminActionsResult,
  ListUsersParams,
  ListUsersResult,
} from "../adapter";
import {
  DEFAULT_TRIAL_DAYS,
  GMAIL_SCAN_STATUSES,
  INVITATION_STATUSES,
  ORG_ROLES,
  SUBSCRIPTION_STATUSES,
  USER_STATUSES,
  newAdminActionSchema,
  newApplicationSchema,
  newGmailScanSchema,
  newInvitationSchema,
  newExclusionRuleSchema,
  newJobFilterSchema,
  newOrganizationMemberSchema,
  newPlanSchema,
  newProfileSchema,
  newSubscriptionSchema,
  type AdminAction,
  type Application,
  type ApplicationFilterResult,
  type ApplicationLink,
  type ApplicationStatus,
  type AppSettings,
  type GmailScan,
  type GmailScanProposal,
  type Invitation,
  type InvitationStatus,
  type ExclusionMatch,
  type ExclusionRule,
  type JobFilter,
  type NewAdminAction,
  type NewApplication,
  type NewGmailScan,
  type NewInvitation,
  type NewExclusionRule,
  type NewJobFilter,
  type NewOrganization,
  type NewOrganizationMember,
  type NewPlan,
  type NewProfile,
  type NewSubscription,
  type NewUser,
  type Organization,
  type OrganizationMember,
  type OrgRole,
  type Plan,
  type Profile,
  type ProfileContact,
  type ProfileDomainPref,
  type ProfileEducation,
  type ProfileEeo,
  type ProfileExperience,
  type ProfileLinks,
  type ProfileCustomField,
  type ProfileProject,
  type Subscription,
  type UpdateApplication,
  type UpdateAppSettings,
  type UpdateGmailScan,
  type UpdateJobFilter,
  type UpdateOrganization,
  type UpdatePlan,
  type UpdateProfile,
  type UpdateSubscription,
  type UpdateUser,
  type User,
  type UserFilterSetting,
} from "../schema";

/* -- Document shapes (as stored, incl. Mongoose-managed fields) ------------ */

interface UserDoc {
  _id: mongoose.Types.ObjectId;
  email: string;
  name: string | null;
  is_super_admin: boolean;
  is_support_admin: boolean;
  status: string;
  email_verified_at: Date | null;
  trial_used_at: Date | null;
  deleted_at: Date | null;
  marketing_emails_enabled: boolean;
  unsubscribe_token: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationDoc {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  stripe_customer_id: string | null;
  trial_ends_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PlanDoc {
  _id: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_annual: number | null;
  annual_discount_percent: number | null;
  limits: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AppSettingsDoc {
  _id: mongoose.Types.ObjectId;
  key: string;
  trial_days: number;
  createdAt: Date;
  updatedAt: Date;
}

interface SubscriptionDoc {
  _id: mongoose.Types.ObjectId;
  organization_id: mongoose.Types.ObjectId;
  plan_id: mongoose.Types.ObjectId;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationMemberDoc {
  _id: mongoose.Types.ObjectId;
  organization_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

interface InvitationDoc {
  _id: mongoose.Types.ObjectId;
  organization_id: mongoose.Types.ObjectId;
  email: string;
  role: string;
  token: string;
  status: string;
  invited_by_user_id: mongoose.Types.ObjectId;
  expires_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface ProfileDoc {
  _id: mongoose.Types.ObjectId;
  organization_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  name: string;
  contact: ProfileContact;
  summary: string | null;
  skills: string[];
  experience: ProfileExperience[];
  education: ProfileEducation[];
  projects: ProfileProject[];
  custom_fields: ProfileCustomField[];
  knowledge_base: string;
  links: ProfileLinks;
  work_authorization: string | null;
  work_arrangement: string | null;
  employment_types: string[];
  salary_expectation: string | null;
  // EEO fields hold packed ciphertext (field-level encryption), never plaintext.
  eeo: ProfileEeo | null;
  is_default: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProfileDomainPrefDoc {
  _id: mongoose.Types.ObjectId;
  organization_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  domain: string;
  profile_id: mongoose.Types.ObjectId;
  last_used_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface ApplicationDoc {
  _id: mongoose.Types.ObjectId;
  organization_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  profile_id: mongoose.Types.ObjectId | null;
  company: string;
  role_title: string;
  url: string | null;
  domain: string | null;
  platform: string | null;
  additional_links: ApplicationLink[];
  status: string;
  fit_score: number | null;
  fit_reasoning: string | null;
  filter_results: ApplicationFilterResult[];
  exclusion_matches: ExclusionMatch[];
  applied_at: Date;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

interface JobFilterDoc {
  _id: mongoose.Types.ObjectId;
  label: string;
  type: string;
  owner_id: mongoose.Types.ObjectId | null;
  description: string | null;
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface UserFilterSettingDoc {
  _id: mongoose.Types.ObjectId;
  organization_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  filter_id: mongoose.Types.ObjectId;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ExclusionRuleDoc {
  _id: mongoose.Types.ObjectId;
  organization_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  kind: string;
  value: string;
  is_active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AdminActionDoc {
  _id: mongoose.Types.ObjectId;
  actor_user_id: mongoose.Types.ObjectId;
  actor_role: string;
  action: string;
  target_user_id: mongoose.Types.ObjectId | null;
  target_id: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface GmailScanDoc {
  _id: mongoose.Types.ObjectId;
  organization_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  range_from: Date;
  range_to: Date;
  status: string;
  error: string | null;
  proposals: GmailScanProposal[];
  createdAt: Date;
  updatedAt: Date;
}

/* -- Schemas & models (registered once) ------------------------------------ */

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: null },
    // Platform-level super-admin flag (§14) — not tied to any org membership.
    is_super_admin: { type: Boolean, required: true, default: false },
    // Platform-level support-admin tier — limited admin (§ product spec).
    is_support_admin: { type: Boolean, required: true, default: false },
    status: {
      type: String,
      required: true,
      default: USER_STATUSES.active,
      index: true,
    },
    email_verified_at: { type: Date, default: null },
    trial_used_at: { type: Date, default: null },
    deleted_at: { type: Date, default: null },
    marketing_emails_enabled: { type: Boolean, required: true, default: true },
    unsubscribe_token: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
  },
  { timestamps: true, collection: "users" },
);

const organizationSchema = new Schema<OrganizationDoc>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    // Billing linkage (Phase 5). Indexed for the webhook's customer→org lookup.
    stripe_customer_id: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    trial_ends_at: { type: Date, default: null },
  },
  { timestamps: true, collection: "organizations" },
);

// Plans are PLATFORM-level — no organization_id (§15). Monetary fields are
// integer minor units (cents).
const planSchema = new Schema<PlanDoc>(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    price_monthly: { type: Number, required: true },
    price_annual: { type: Number, default: null },
    annual_discount_percent: { type: Number, default: null },
    limits: { type: Schema.Types.Mixed, default: {} },
    is_active: { type: Boolean, required: true, default: true },
    sort_order: { type: Number, required: true, default: 0 },
    stripe_product_id: { type: String, default: null },
    stripe_price_id_monthly: { type: String, default: null },
    stripe_price_id_annual: { type: String, default: null },
  },
  { timestamps: true, collection: "plans" },
);

// Platform-level singleton settings row (unique `key`).
const appSettingsSchema = new Schema<AppSettingsDoc>(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    trial_days: { type: Number, required: true, default: DEFAULT_TRIAL_DAYS },
  },
  { timestamps: true, collection: "app_settings" },
);

const subscriptionSchema = new Schema<SubscriptionDoc>(
  {
    // Tenant key — indexed on every tenant-scoped collection (§1.3).
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    plan_id: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    status: {
      type: String,
      required: true,
      default: SUBSCRIPTION_STATUSES.trialing,
    },
    stripe_customer_id: { type: String, default: null },
    stripe_subscription_id: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    current_period_end: { type: Date, default: null },
    cancel_at_period_end: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: "subscriptions" },
);

const organizationMemberSchema = new Schema<OrganizationMemberDoc>(
  {
    // Tenant key — indexed on every tenant-scoped collection (§1.3).
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: { type: String, required: true, default: ORG_ROLES.user },
  },
  { timestamps: true, collection: "organization_members" },
);
organizationMemberSchema.index(
  { organization_id: 1, user_id: 1 },
  { unique: true },
);

const invitationSchema = new Schema<InvitationDoc>(
  {
    // Tenant key — indexed on every tenant-scoped collection (§1.3).
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    email: { type: String, required: true, index: true },
    role: { type: String, required: true, default: ORG_ROLES.user },
    token: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      required: true,
      default: INVITATION_STATUSES.pending,
    },
    invited_by_user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expires_at: { type: Date, required: true },
  },
  { timestamps: true, collection: "organization_invitations" },
);

const profileSchema = new Schema<ProfileDoc>(
  {
    // Tenant key — indexed on every tenant-scoped collection (§1.3).
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    contact: { type: Schema.Types.Mixed, default: {} },
    summary: { type: String, default: null },
    skills: { type: [String], default: [] },
    // Structured sub-documents are stored schema-less (Mixed) — their shape is
    // enforced by the Zod domain schemas at the adapter boundary.
    experience: { type: Schema.Types.Mixed, default: [] },
    education: { type: Schema.Types.Mixed, default: [] },
    projects: { type: Schema.Types.Mixed, default: [] },
    custom_fields: { type: Schema.Types.Mixed, default: [] },
    knowledge_base: { type: String, default: "" },
    links: { type: Schema.Types.Mixed, default: {} },
    work_authorization: { type: String, default: null },
    work_arrangement: { type: String, default: null },
    employment_types: { type: [String], default: [] },
    salary_expectation: { type: String, default: null },
    // Packed ciphertext only — encrypted/decrypted by the profile service.
    eeo: { type: Schema.Types.Mixed, default: null },
    is_default: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, collection: "profiles" },
);
profileSchema.index({ user_id: 1, name: 1 }, { unique: true });

const profileDomainPrefSchema = new Schema<ProfileDomainPrefDoc>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    domain: { type: String, required: true },
    profile_id: { type: Schema.Types.ObjectId, ref: "Profile", required: true },
    last_used_at: { type: Date, required: true },
  },
  { timestamps: true, collection: "profile_domain_prefs" },
);
profileDomainPrefSchema.index({ user_id: 1, domain: 1 }, { unique: true });

const applicationSchema = new Schema<ApplicationDoc>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    profile_id: { type: Schema.Types.ObjectId, ref: "Profile", default: null },
    company: { type: String, required: true },
    role_title: { type: String, required: true },
    url: { type: String, default: null },
    domain: { type: String, default: null },
    platform: { type: String, default: null },
    additional_links: { type: Schema.Types.Mixed, default: [] },
    status: { type: String, required: true, default: "Applied" },
    fit_score: { type: Number, default: null },
    fit_reasoning: { type: String, default: null },
    filter_results: { type: Schema.Types.Mixed, default: [] },
    exclusion_matches: { type: Schema.Types.Mixed, default: [] },
    applied_at: { type: Date, required: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true, collection: "applications" },
);
applicationSchema.index({ user_id: 1, applied_at: -1 });
applicationSchema.index({ user_id: 1, status: 1 });

const jobFilterSchema = new Schema<JobFilterDoc>(
  {
    label: { type: String, required: true },
    // 'admin' = platform default (no owner); 'user' = one user's custom filter.
    type: { type: String, required: true, index: true },
    owner_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
      sparse: true,
    },
    description: { type: String, default: null },
    is_active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "job_filters" },
);

const userFilterSettingSchema = new Schema<UserFilterSettingDoc>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    filter_id: {
      type: Schema.Types.ObjectId,
      ref: "JobFilter",
      required: true,
    },
    enabled: { type: Boolean, required: true },
  },
  { timestamps: true, collection: "user_filter_settings" },
);
userFilterSettingSchema.index({ user_id: 1, filter_id: 1 }, { unique: true });

// Flat per-user blocklists ("never Acme", "never anything saying unpaid").
// Matched in code, never by the AI — see lib/exclusions/service.ts.
const exclusionRuleSchema = new Schema<ExclusionRuleDoc>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    kind: { type: String, required: true },
    value: { type: String, required: true },
    is_active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: "exclusion_rules" },
);
// One rule per (user, kind, value) — re-adding the same company is a no-op.
exclusionRuleSchema.index({ user_id: 1, kind: 1, value: 1 }, { unique: true });

// Append-only audit log — no updates, newest-first reads.
const adminActionSchema = new Schema<AdminActionDoc>(
  {
    actor_user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actor_role: { type: String, required: true },
    action: { type: String, required: true, index: true },
    target_user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
      sparse: true,
    },
    target_id: { type: String, default: null },
    reason: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "admin_actions" },
);
adminActionSchema.index({ createdAt: -1 });

const gmailScanSchema = new Schema<GmailScanDoc>(
  {
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    range_from: { type: Date, required: true },
    range_to: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      default: GMAIL_SCAN_STATUSES.running,
    },
    error: { type: String, default: null },
    proposals: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, collection: "gmail_scans" },
);

/** Reuse existing models across hot-reloads / repeated imports. */
function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (
    (mongoose.models[name] as Model<T> | undefined) ??
    mongoose.model<T>(name, schema)
  );
}

const UserModel = model<UserDoc>("User", userSchema);
const OrganizationModel = model<OrganizationDoc>(
  "Organization",
  organizationSchema,
);
const OrganizationMemberModel = model<OrganizationMemberDoc>(
  "OrganizationMember",
  organizationMemberSchema,
);
const InvitationModel = model<InvitationDoc>("Invitation", invitationSchema);
const PlanModel = model<PlanDoc>("Plan", planSchema);
const AppSettingsModel = model<AppSettingsDoc>(
  "AppSettings",
  appSettingsSchema,
);
const SubscriptionModel = model<SubscriptionDoc>(
  "Subscription",
  subscriptionSchema,
);
const ProfileModel = model<ProfileDoc>("Profile", profileSchema);
const ProfileDomainPrefModel = model<ProfileDomainPrefDoc>(
  "ProfileDomainPref",
  profileDomainPrefSchema,
);
const ApplicationModel = model<ApplicationDoc>(
  "Application",
  applicationSchema,
);
const JobFilterModel = model<JobFilterDoc>("JobFilter", jobFilterSchema);
const UserFilterSettingModel = model<UserFilterSettingDoc>(
  "UserFilterSetting",
  userFilterSettingSchema,
);
const ExclusionRuleModel = model<ExclusionRuleDoc>(
  "ExclusionRule",
  exclusionRuleSchema,
);
const AdminActionModel = model<AdminActionDoc>(
  "AdminAction",
  adminActionSchema,
);
const GmailScanModel = model<GmailScanDoc>("GmailScan", gmailScanSchema);

/* -- Mappers --------------------------------------------------------------- */

function toUser(doc: UserDoc): User {
  return {
    id: doc._id.toString(),
    email: doc.email,
    name: doc.name,
    isSuperAdmin: doc.is_super_admin ?? false,
    isSupportAdmin: doc.is_support_admin ?? false,
    status: (doc.status ?? USER_STATUSES.active) as User["status"],
    emailVerifiedAt: doc.email_verified_at ?? null,
    trialUsedAt: doc.trial_used_at ?? null,
    deletedAt: doc.deleted_at ?? null,
    marketingEmailsEnabled: doc.marketing_emails_enabled ?? true,
    unsubscribeToken: doc.unsubscribe_token ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toOrganization(doc: OrganizationDoc): Organization {
  return {
    id: doc._id.toString(),
    name: doc.name,
    slug: doc.slug,
    stripeCustomerId: doc.stripe_customer_id ?? null,
    trialEndsAt: doc.trial_ends_at ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toPlan(doc: PlanDoc): Plan {
  return {
    id: doc._id.toString(),
    slug: doc.slug,
    name: doc.name,
    description: doc.description ?? null,
    priceMonthly: doc.price_monthly,
    priceAnnual: doc.price_annual ?? null,
    annualDiscountPercent: doc.annual_discount_percent ?? null,
    limits: doc.limits ?? {},
    isActive: doc.is_active,
    sortOrder: doc.sort_order,
    stripeProductId: doc.stripe_product_id ?? null,
    stripePriceIdMonthly: doc.stripe_price_id_monthly ?? null,
    stripePriceIdAnnual: doc.stripe_price_id_annual ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toAppSettings(doc: AppSettingsDoc): AppSettings {
  return {
    id: doc._id.toString(),
    trialDays: doc.trial_days,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toSubscription(doc: SubscriptionDoc): Subscription {
  return {
    id: doc._id.toString(),
    organizationId: doc.organization_id.toString(),
    planId: doc.plan_id.toString(),
    status: doc.status as Subscription["status"],
    stripeCustomerId: doc.stripe_customer_id ?? null,
    stripeSubscriptionId: doc.stripe_subscription_id ?? null,
    currentPeriodEnd: doc.current_period_end ?? null,
    cancelAtPeriodEnd: doc.cancel_at_period_end,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toMember(doc: OrganizationMemberDoc): OrganizationMember {
  return {
    id: doc._id.toString(),
    organizationId: doc.organization_id.toString(),
    userId: doc.user_id.toString(),
    role: doc.role,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toInvitation(doc: InvitationDoc): Invitation {
  return {
    id: doc._id.toString(),
    organizationId: doc.organization_id.toString(),
    email: doc.email,
    role: doc.role,
    token: doc.token,
    status: doc.status as Invitation["status"],
    invitedByUserId: doc.invited_by_user_id.toString(),
    expiresAt: doc.expires_at,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toProfile(doc: ProfileDoc): Profile {
  return {
    id: doc._id.toString(),
    organizationId: doc.organization_id.toString(),
    userId: doc.user_id.toString(),
    name: doc.name,
    contact: doc.contact ?? {},
    summary: doc.summary ?? null,
    skills: doc.skills ?? [],
    experience: doc.experience ?? [],
    education: doc.education ?? [],
    projects: doc.projects ?? [],
    customFields: doc.custom_fields ?? [],
    knowledgeBase: doc.knowledge_base ?? "",
    links: doc.links ?? {},
    workAuthorization: (doc.work_authorization ??
      null) as Profile["workAuthorization"],
    workArrangement: (doc.work_arrangement ??
      null) as Profile["workArrangement"],
    employmentTypes: (doc.employment_types ?? []) as Profile["employmentTypes"],
    salaryExpectation: doc.salary_expectation ?? null,
    eeo: doc.eeo ?? null,
    isDefault: doc.is_default ?? false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toProfileDomainPref(doc: ProfileDomainPrefDoc): ProfileDomainPref {
  return {
    id: doc._id.toString(),
    organizationId: doc.organization_id.toString(),
    userId: doc.user_id.toString(),
    domain: doc.domain,
    profileId: doc.profile_id.toString(),
    lastUsedAt: doc.last_used_at,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toApplication(doc: ApplicationDoc): Application {
  return {
    id: doc._id.toString(),
    organizationId: doc.organization_id.toString(),
    userId: doc.user_id.toString(),
    profileId: doc.profile_id ? doc.profile_id.toString() : null,
    company: doc.company,
    roleTitle: doc.role_title,
    url: doc.url ?? null,
    domain: doc.domain ?? null,
    platform: doc.platform ?? null,
    additionalLinks: doc.additional_links ?? [],
    status: doc.status as Application["status"],
    fitScore: doc.fit_score ?? null,
    fitReasoning: doc.fit_reasoning ?? null,
    filterResults: doc.filter_results ?? [],
    exclusionMatches: doc.exclusion_matches ?? [],
    appliedAt: doc.applied_at,
    notes: doc.notes ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toJobFilter(doc: JobFilterDoc): JobFilter {
  return {
    id: doc._id.toString(),
    label: doc.label,
    type: doc.type as JobFilter["type"],
    ownerId: doc.owner_id ? doc.owner_id.toString() : null,
    description: doc.description ?? null,
    isActive: doc.is_active,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toUserFilterSetting(doc: UserFilterSettingDoc): UserFilterSetting {
  return {
    id: doc._id.toString(),
    organizationId: doc.organization_id.toString(),
    userId: doc.user_id.toString(),
    filterId: doc.filter_id.toString(),
    enabled: doc.enabled,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toExclusionRule(doc: ExclusionRuleDoc): ExclusionRule {
  return {
    id: doc._id.toString(),
    organizationId: doc.organization_id.toString(),
    userId: doc.user_id.toString(),
    kind: doc.kind as ExclusionRule["kind"],
    value: doc.value,
    isActive: doc.is_active,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toAdminAction(doc: AdminActionDoc): AdminAction {
  return {
    id: doc._id.toString(),
    actorUserId: doc.actor_user_id.toString(),
    actorRole: doc.actor_role as AdminAction["actorRole"],
    action: doc.action as AdminAction["action"],
    targetUserId: doc.target_user_id ? doc.target_user_id.toString() : null,
    targetId: doc.target_id ?? null,
    reason: doc.reason ?? "",
    metadata: doc.metadata ?? {},
    createdAt: doc.createdAt,
  };
}

function toGmailScan(doc: GmailScanDoc): GmailScan {
  return {
    id: doc._id.toString(),
    organizationId: doc.organization_id.toString(),
    userId: doc.user_id.toString(),
    rangeFrom: doc.range_from,
    rangeTo: doc.range_to,
    status: doc.status as GmailScan["status"],
    error: doc.error ?? null,
    proposals: doc.proposals ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function requireUri(): string {
  if (!env.MONGODB_URI) {
    throw new Error("MongoAdapter: MONGODB_URI is not configured");
  }
  return env.MONGODB_URI;
}

/** Connect once, lazily; reuse the singleton connection thereafter. Exported so
 * the auth adapter (which stores credentials in the same Mongo connection) can
 * share it. */
let connectionPromise: Promise<typeof mongoose> | null = null;
export async function connectMongo(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  connectionPromise ??= mongoose.connect(requireUri());
  await connectionPromise;
}

export class MongoAdapter implements DatabaseAdapter {
  private async connect(): Promise<void> {
    await connectMongo();
  }

  /* -- Users -------------------------------------------------------------- */

  async createUser(input: NewUser): Promise<User> {
    await this.connect();
    const created = await UserModel.create({
      email: input.email,
      name: input.name ?? null,
      unsubscribe_token: input.unsubscribeToken ?? null,
    });
    return toUser(created.toObject<UserDoc>());
  }

  async getUserById(id: string): Promise<User | null> {
    await this.connect();
    const doc = await UserModel.findById(id).lean<UserDoc>().exec();
    return doc ? toUser(doc) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    await this.connect();
    const doc = await UserModel.findOne({ email }).lean<UserDoc>().exec();
    return doc ? toUser(doc) : null;
  }

  async updateUser(id: string, patch: UpdateUser): Promise<User> {
    await this.connect();
    // Map camelCase domain fields to the stored field names.
    const update: Record<string, unknown> = {};
    if (patch.email !== undefined) update.email = patch.email;
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.isSuperAdmin !== undefined)
      update.is_super_admin = patch.isSuperAdmin;
    if (patch.isSupportAdmin !== undefined)
      update.is_support_admin = patch.isSupportAdmin;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.emailVerifiedAt !== undefined)
      update.email_verified_at = patch.emailVerifiedAt ?? null;
    if (patch.trialUsedAt !== undefined)
      update.trial_used_at = patch.trialUsedAt ?? null;
    if (patch.deletedAt !== undefined)
      update.deleted_at = patch.deletedAt ?? null;
    if (patch.marketingEmailsEnabled !== undefined)
      update.marketing_emails_enabled = patch.marketingEmailsEnabled;
    if (patch.unsubscribeToken !== undefined)
      update.unsubscribe_token = patch.unsubscribeToken ?? null;
    const doc = await UserModel.findByIdAndUpdate(id, update, { new: true })
      .lean<UserDoc>()
      .exec();
    if (!doc) throw new Error(`mongo updateUser: user ${id} not found`);
    return toUser(doc);
  }

  async getUserByUnsubscribeToken(token: string): Promise<User | null> {
    await this.connect();
    const doc = await UserModel.findOne({ unsubscribe_token: token })
      .lean<UserDoc>()
      .exec();
    return doc ? toUser(doc) : null;
  }

  async listUsers(params: ListUsersParams = {}): Promise<ListUsersResult> {
    await this.connect();
    const { search, limit = 25, offset = 0 } = params;
    const query: Record<string, unknown> = {};
    if (search) {
      const pattern = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      query.$or = [{ email: pattern }, { name: pattern }];
    }
    const [docs, total] = await Promise.all([
      UserModel.find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean<UserDoc[]>()
        .exec(),
      UserModel.countDocuments(query).exec(),
    ]);
    return { users: docs.map(toUser), total };
  }

  async deleteUser(id: string): Promise<void> {
    await this.connect();
    await UserModel.findByIdAndDelete(id).exec();
  }

  /* -- Organizations ------------------------------------------------------ */

  async createOrganization(input: NewOrganization): Promise<Organization> {
    await this.connect();
    const created = await OrganizationModel.create({
      name: input.name,
      slug: input.slug,
      trial_ends_at: input.trialEndsAt ?? null,
    });
    return toOrganization(created.toObject<OrganizationDoc>());
  }

  async getOrganizationById(id: string): Promise<Organization | null> {
    await this.connect();
    const doc = await OrganizationModel.findById(id)
      .lean<OrganizationDoc>()
      .exec();
    return doc ? toOrganization(doc) : null;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    await this.connect();
    const doc = await OrganizationModel.findOne({ slug })
      .lean<OrganizationDoc>()
      .exec();
    return doc ? toOrganization(doc) : null;
  }

  async updateOrganization(
    id: string,
    patch: UpdateOrganization,
  ): Promise<Organization> {
    await this.connect();
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.slug !== undefined) update.slug = patch.slug;
    if (patch.stripeCustomerId !== undefined)
      update.stripe_customer_id = patch.stripeCustomerId;
    if (patch.trialEndsAt !== undefined)
      update.trial_ends_at = patch.trialEndsAt ?? null;
    const doc = await OrganizationModel.findByIdAndUpdate(id, update, {
      new: true,
    })
      .lean<OrganizationDoc>()
      .exec();
    if (!doc) throw new Error(`mongo updateOrganization: org ${id} not found`);
    return toOrganization(doc);
  }

  async getOrganizationByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<Organization | null> {
    await this.connect();
    const doc = await OrganizationModel.findOne({
      stripe_customer_id: stripeCustomerId,
    })
      .lean<OrganizationDoc>()
      .exec();
    return doc ? toOrganization(doc) : null;
  }

  async deleteOrganization(id: string): Promise<void> {
    await this.connect();
    await OrganizationModel.findByIdAndDelete(id).exec();
  }

  /* -- Membership (scoped by organization_id) ----------------------------- */

  async addMember(input: NewOrganizationMember): Promise<OrganizationMember> {
    await this.connect();
    const parsed = newOrganizationMemberSchema.parse(input);
    const created = await OrganizationMemberModel.create({
      organization_id: new mongoose.Types.ObjectId(parsed.organizationId),
      user_id: new mongoose.Types.ObjectId(parsed.userId),
      role: parsed.role,
    });
    return toMember(created.toObject<OrganizationMemberDoc>());
  }

  async getMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null> {
    await this.connect();
    const doc = await OrganizationMemberModel.findOne({
      organization_id: organizationId,
      user_id: userId,
    })
      .lean<OrganizationMemberDoc>()
      .exec();
    return doc ? toMember(doc) : null;
  }

  async listMembers(organizationId: string): Promise<OrganizationMember[]> {
    await this.connect();
    const docs = await OrganizationMemberModel.find({
      organization_id: organizationId,
    })
      .lean<OrganizationMemberDoc[]>()
      .exec();
    return docs.map(toMember);
  }

  async listMembershipsForUser(userId: string): Promise<OrganizationMember[]> {
    await this.connect();
    const docs = await OrganizationMemberModel.find({ user_id: userId })
      .lean<OrganizationMemberDoc[]>()
      .exec();
    return docs.map(toMember);
  }

  async listMembershipsForUsers(
    userIds: string[],
  ): Promise<OrganizationMember[]> {
    await this.connect();
    if (userIds.length === 0) return [];
    const docs = await OrganizationMemberModel.find({
      user_id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .lean<OrganizationMemberDoc[]>()
      .exec();
    return docs.map(toMember);
  }

  async updateMemberRole(
    organizationId: string,
    userId: string,
    role: OrgRole,
  ): Promise<OrganizationMember> {
    await this.connect();
    const doc = await OrganizationMemberModel.findOneAndUpdate(
      { organization_id: organizationId, user_id: userId },
      { role },
      { new: true },
    )
      .lean<OrganizationMemberDoc>()
      .exec();
    if (!doc) {
      throw new Error(
        `mongo updateMemberRole: membership (${organizationId}, ${userId}) not found`,
      );
    }
    return toMember(doc);
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    await this.connect();
    await OrganizationMemberModel.deleteOne({
      organization_id: organizationId,
      user_id: userId,
    }).exec();
  }

  /* -- Invitations (scoped by organization_id) ---------------------------- */

  async createInvitation(input: NewInvitation): Promise<Invitation> {
    await this.connect();
    const parsed = newInvitationSchema.parse(input);
    const created = await InvitationModel.create({
      organization_id: new mongoose.Types.ObjectId(parsed.organizationId),
      email: parsed.email,
      role: parsed.role,
      token: parsed.token,
      status: parsed.status,
      invited_by_user_id: new mongoose.Types.ObjectId(parsed.invitedByUserId),
      expires_at: parsed.expiresAt,
    });
    return toInvitation(created.toObject<InvitationDoc>());
  }

  async getInvitationByToken(token: string): Promise<Invitation | null> {
    await this.connect();
    const doc = await InvitationModel.findOne({ token })
      .lean<InvitationDoc>()
      .exec();
    return doc ? toInvitation(doc) : null;
  }

  async listInvitations(organizationId: string): Promise<Invitation[]> {
    await this.connect();
    const docs = await InvitationModel.find({
      organization_id: organizationId,
    })
      .lean<InvitationDoc[]>()
      .exec();
    return docs.map(toInvitation);
  }

  async updateInvitationStatus(
    id: string,
    status: InvitationStatus,
  ): Promise<Invitation> {
    await this.connect();
    const doc = await InvitationModel.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    )
      .lean<InvitationDoc>()
      .exec();
    if (!doc) throw new Error(`mongo updateInvitationStatus: ${id} not found`);
    return toInvitation(doc);
  }

  async getPendingInvitationForEmail(
    organizationId: string,
    email: string,
  ): Promise<Invitation | null> {
    await this.connect();
    const doc = await InvitationModel.findOne({
      organization_id: organizationId,
      email,
      status: INVITATION_STATUSES.pending,
    })
      .lean<InvitationDoc>()
      .exec();
    return doc ? toInvitation(doc) : null;
  }

  /* -- Plans (platform-level, no organization_id — §15) ------------------- */

  async createPlan(input: NewPlan): Promise<Plan> {
    await this.connect();
    const parsed = newPlanSchema.parse(input);
    const created = await PlanModel.create({
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description ?? null,
      price_monthly: parsed.priceMonthly,
      price_annual: parsed.priceAnnual ?? null,
      annual_discount_percent: parsed.annualDiscountPercent ?? null,
      limits: parsed.limits,
      is_active: parsed.isActive,
      sort_order: parsed.sortOrder,
      stripe_product_id: parsed.stripeProductId ?? null,
      stripe_price_id_monthly: parsed.stripePriceIdMonthly ?? null,
      stripe_price_id_annual: parsed.stripePriceIdAnnual ?? null,
    });
    return toPlan(created.toObject<PlanDoc>());
  }

  async getPlanById(id: string): Promise<Plan | null> {
    await this.connect();
    const doc = await PlanModel.findById(id).lean<PlanDoc>().exec();
    return doc ? toPlan(doc) : null;
  }

  async getPlanBySlug(slug: string): Promise<Plan | null> {
    await this.connect();
    const doc = await PlanModel.findOne({ slug }).lean<PlanDoc>().exec();
    return doc ? toPlan(doc) : null;
  }

  async listPlans(): Promise<Plan[]> {
    await this.connect();
    const docs = await PlanModel.find()
      .sort({ sort_order: 1 })
      .lean<PlanDoc[]>()
      .exec();
    return docs.map(toPlan);
  }

  async listActivePlans(): Promise<Plan[]> {
    await this.connect();
    const docs = await PlanModel.find({ is_active: true })
      .sort({ sort_order: 1 })
      .lean<PlanDoc[]>()
      .exec();
    return docs.map(toPlan);
  }

  async updatePlan(id: string, patch: UpdatePlan): Promise<Plan> {
    await this.connect();
    const update: Record<string, unknown> = {};
    if (patch.slug !== undefined) update.slug = patch.slug;
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.priceMonthly !== undefined)
      update.price_monthly = patch.priceMonthly;
    if (patch.priceAnnual !== undefined)
      update.price_annual = patch.priceAnnual;
    if (patch.annualDiscountPercent !== undefined)
      update.annual_discount_percent = patch.annualDiscountPercent;
    if (patch.limits !== undefined) update.limits = patch.limits;
    if (patch.isActive !== undefined) update.is_active = patch.isActive;
    if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
    if (patch.stripeProductId !== undefined)
      update.stripe_product_id = patch.stripeProductId;
    if (patch.stripePriceIdMonthly !== undefined)
      update.stripe_price_id_monthly = patch.stripePriceIdMonthly;
    if (patch.stripePriceIdAnnual !== undefined)
      update.stripe_price_id_annual = patch.stripePriceIdAnnual;
    const doc = await PlanModel.findByIdAndUpdate(id, update, { new: true })
      .lean<PlanDoc>()
      .exec();
    if (!doc) throw new Error(`mongo updatePlan: plan ${id} not found`);
    return toPlan(doc);
  }

  async deletePlan(id: string): Promise<void> {
    await this.connect();
    await PlanModel.findByIdAndDelete(id).exec();
  }

  /* -- App settings (platform-level singleton) ---------------------------- */

  async getAppSettings(): Promise<AppSettings> {
    await this.connect();
    const existing = await AppSettingsModel.findOne({ key: "global" })
      .lean<AppSettingsDoc>()
      .exec();
    if (existing) return toAppSettings(existing);
    const created = await AppSettingsModel.create({
      key: "global",
      trial_days: DEFAULT_TRIAL_DAYS,
    });
    return toAppSettings(created.toObject<AppSettingsDoc>());
  }

  async updateAppSettings(patch: UpdateAppSettings): Promise<AppSettings> {
    await this.connect();
    const update: Record<string, unknown> = {};
    if (patch.trialDays !== undefined) update.trial_days = patch.trialDays;
    const doc = await AppSettingsModel.findOneAndUpdate(
      { key: "global" },
      { $set: update, $setOnInsert: { key: "global" } },
      { new: true, upsert: true },
    )
      .lean<AppSettingsDoc>()
      .exec();
    return toAppSettings(doc as AppSettingsDoc);
  }

  /* -- Subscriptions (scoped by organization_id) -------------------------- */

  async createSubscription(input: NewSubscription): Promise<Subscription> {
    await this.connect();
    const parsed = newSubscriptionSchema.parse(input);
    const created = await SubscriptionModel.create({
      organization_id: new mongoose.Types.ObjectId(parsed.organizationId),
      plan_id: new mongoose.Types.ObjectId(parsed.planId),
      status: parsed.status,
      stripe_customer_id: parsed.stripeCustomerId ?? null,
      stripe_subscription_id: parsed.stripeSubscriptionId ?? null,
      current_period_end: parsed.currentPeriodEnd ?? null,
      cancel_at_period_end: parsed.cancelAtPeriodEnd,
    });
    return toSubscription(created.toObject<SubscriptionDoc>());
  }

  async getSubscriptionByOrg(
    organizationId: string,
  ): Promise<Subscription | null> {
    await this.connect();
    const doc = await SubscriptionModel.findOne({
      organization_id: organizationId,
    })
      .sort({ createdAt: -1 })
      .lean<SubscriptionDoc>()
      .exec();
    return doc ? toSubscription(doc) : null;
  }

  async getSubscriptionByStripeId(
    stripeSubscriptionId: string,
  ): Promise<Subscription | null> {
    await this.connect();
    const doc = await SubscriptionModel.findOne({
      stripe_subscription_id: stripeSubscriptionId,
    })
      .lean<SubscriptionDoc>()
      .exec();
    return doc ? toSubscription(doc) : null;
  }

  async listSubscriptions(): Promise<Subscription[]> {
    await this.connect();
    const docs = await SubscriptionModel.find()
      .sort({ createdAt: -1 })
      .lean<SubscriptionDoc[]>()
      .exec();
    return docs.map(toSubscription);
  }

  async updateSubscription(
    id: string,
    patch: UpdateSubscription,
  ): Promise<Subscription> {
    await this.connect();
    const update: Record<string, unknown> = {};
    if (patch.planId !== undefined)
      update.plan_id = new mongoose.Types.ObjectId(patch.planId);
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.stripeCustomerId !== undefined)
      update.stripe_customer_id = patch.stripeCustomerId;
    if (patch.stripeSubscriptionId !== undefined)
      update.stripe_subscription_id = patch.stripeSubscriptionId;
    if (patch.currentPeriodEnd !== undefined)
      update.current_period_end = patch.currentPeriodEnd ?? null;
    if (patch.cancelAtPeriodEnd !== undefined)
      update.cancel_at_period_end = patch.cancelAtPeriodEnd;
    const doc = await SubscriptionModel.findByIdAndUpdate(id, update, {
      new: true,
    })
      .lean<SubscriptionDoc>()
      .exec();
    if (!doc) throw new Error(`mongo updateSubscription: ${id} not found`);
    return toSubscription(doc);
  }

  async listSubscriptionsForOrgs(
    organizationIds: string[],
  ): Promise<Subscription[]> {
    await this.connect();
    if (organizationIds.length === 0) return [];
    const docs = await SubscriptionModel.find({
      organization_id: {
        $in: organizationIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    })
      .lean<SubscriptionDoc[]>()
      .exec();
    return docs.map(toSubscription);
  }

  /* -- Profiles (scoped by organization_id; multiple per user) ------------- */

  async createProfile(input: NewProfile): Promise<Profile> {
    await this.connect();
    const parsed = newProfileSchema.parse(input);
    const created = await ProfileModel.create({
      organization_id: new mongoose.Types.ObjectId(parsed.organizationId),
      user_id: new mongoose.Types.ObjectId(parsed.userId),
      name: parsed.name,
      contact: parsed.contact,
      summary: parsed.summary ?? null,
      skills: parsed.skills,
      experience: parsed.experience,
      education: parsed.education,
      projects: parsed.projects,
      custom_fields: parsed.customFields,
      knowledge_base: parsed.knowledgeBase,
      links: parsed.links,
      work_authorization: parsed.workAuthorization ?? null,
      work_arrangement: parsed.workArrangement ?? null,
      employment_types: parsed.employmentTypes,
      salary_expectation: parsed.salaryExpectation ?? null,
      eeo: parsed.eeo ?? null,
      is_default: parsed.isDefault,
    });
    return toProfile(created.toObject<ProfileDoc>());
  }

  async getProfileById(id: string): Promise<Profile | null> {
    await this.connect();
    const doc = await ProfileModel.findById(id).lean<ProfileDoc>().exec();
    return doc ? toProfile(doc) : null;
  }

  async listProfilesForUser(userId: string): Promise<Profile[]> {
    await this.connect();
    const docs = await ProfileModel.find({ user_id: userId })
      .sort({ createdAt: 1 })
      .lean<ProfileDoc[]>()
      .exec();
    return docs.map(toProfile);
  }

  async updateProfile(id: string, patch: UpdateProfile): Promise<Profile> {
    await this.connect();
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.contact !== undefined) update.contact = patch.contact;
    if (patch.summary !== undefined) update.summary = patch.summary ?? null;
    if (patch.skills !== undefined) update.skills = patch.skills;
    if (patch.experience !== undefined) update.experience = patch.experience;
    if (patch.education !== undefined) update.education = patch.education;
    if (patch.projects !== undefined) update.projects = patch.projects;
    if (patch.customFields !== undefined)
      update.custom_fields = patch.customFields;
    if (patch.knowledgeBase !== undefined)
      update.knowledge_base = patch.knowledgeBase;
    if (patch.links !== undefined) update.links = patch.links;
    if (patch.workAuthorization !== undefined)
      update.work_authorization = patch.workAuthorization ?? null;
    if (patch.workArrangement !== undefined)
      update.work_arrangement = patch.workArrangement ?? null;
    if (patch.employmentTypes !== undefined)
      update.employment_types = patch.employmentTypes;
    if (patch.salaryExpectation !== undefined)
      update.salary_expectation = patch.salaryExpectation ?? null;
    if (patch.eeo !== undefined) update.eeo = patch.eeo ?? null;
    if (patch.isDefault !== undefined) update.is_default = patch.isDefault;
    const doc = await ProfileModel.findByIdAndUpdate(id, update, { new: true })
      .lean<ProfileDoc>()
      .exec();
    if (!doc) throw new Error(`mongo updateProfile: profile ${id} not found`);
    return toProfile(doc);
  }

  async deleteProfile(id: string): Promise<void> {
    await this.connect();
    await ProfileModel.findByIdAndDelete(id).exec();
    await ProfileDomainPrefModel.deleteMany({ profile_id: id }).exec();
  }

  /* -- Profile domain prefs ------------------------------------------------ */

  async setProfileDomainPref(
    organizationId: string,
    userId: string,
    domain: string,
    profileId: string,
  ): Promise<ProfileDomainPref> {
    await this.connect();
    const doc = await ProfileDomainPrefModel.findOneAndUpdate(
      {
        user_id: new mongoose.Types.ObjectId(userId),
        domain,
      },
      {
        $set: {
          profile_id: new mongoose.Types.ObjectId(profileId),
          last_used_at: new Date(),
        },
        $setOnInsert: {
          organization_id: new mongoose.Types.ObjectId(organizationId),
        },
      },
      { new: true, upsert: true },
    )
      .lean<ProfileDomainPrefDoc>()
      .exec();
    return toProfileDomainPref(doc as ProfileDomainPrefDoc);
  }

  async getProfileDomainPref(
    userId: string,
    domain: string,
  ): Promise<ProfileDomainPref | null> {
    await this.connect();
    const doc = await ProfileDomainPrefModel.findOne({
      user_id: userId,
      domain,
    })
      .lean<ProfileDomainPrefDoc>()
      .exec();
    return doc ? toProfileDomainPref(doc) : null;
  }

  /* -- Applications (scoped by organization_id) ---------------------------- */

  async createApplication(input: NewApplication): Promise<Application> {
    await this.connect();
    const parsed = newApplicationSchema.parse(input);
    const created = await ApplicationModel.create({
      organization_id: new mongoose.Types.ObjectId(parsed.organizationId),
      user_id: new mongoose.Types.ObjectId(parsed.userId),
      profile_id: parsed.profileId
        ? new mongoose.Types.ObjectId(parsed.profileId)
        : null,
      company: parsed.company,
      role_title: parsed.roleTitle,
      url: parsed.url ?? null,
      domain: parsed.domain ?? null,
      platform: parsed.platform ?? null,
      additional_links: parsed.additionalLinks,
      status: parsed.status,
      fit_score: parsed.fitScore ?? null,
      fit_reasoning: parsed.fitReasoning ?? null,
      filter_results: parsed.filterResults,
      exclusion_matches: parsed.exclusionMatches,
      applied_at: parsed.appliedAt,
      notes: parsed.notes,
    });
    return toApplication(created.toObject<ApplicationDoc>());
  }

  async getApplicationById(id: string): Promise<Application | null> {
    await this.connect();
    const doc = await ApplicationModel.findById(id)
      .lean<ApplicationDoc>()
      .exec();
    return doc ? toApplication(doc) : null;
  }

  async listApplicationsForUser(userId: string): Promise<Application[]> {
    await this.connect();
    const docs = await ApplicationModel.find({ user_id: userId })
      .sort({ applied_at: -1 })
      .lean<ApplicationDoc[]>()
      .exec();
    return docs.map(toApplication);
  }

  async updateApplication(
    id: string,
    patch: UpdateApplication,
  ): Promise<Application> {
    await this.connect();
    const update: Record<string, unknown> = {};
    if (patch.profileId !== undefined)
      update.profile_id = patch.profileId
        ? new mongoose.Types.ObjectId(patch.profileId)
        : null;
    if (patch.company !== undefined) update.company = patch.company;
    if (patch.roleTitle !== undefined) update.role_title = patch.roleTitle;
    if (patch.url !== undefined) update.url = patch.url ?? null;
    if (patch.domain !== undefined) update.domain = patch.domain ?? null;
    if (patch.platform !== undefined) update.platform = patch.platform ?? null;
    if (patch.additionalLinks !== undefined)
      update.additional_links = patch.additionalLinks;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.fitScore !== undefined) update.fit_score = patch.fitScore ?? null;
    if (patch.fitReasoning !== undefined)
      update.fit_reasoning = patch.fitReasoning ?? null;
    if (patch.filterResults !== undefined)
      update.filter_results = patch.filterResults;
    if (patch.exclusionMatches !== undefined)
      update.exclusion_matches = patch.exclusionMatches;
    if (patch.appliedAt !== undefined) update.applied_at = patch.appliedAt;
    if (patch.notes !== undefined) update.notes = patch.notes;
    const doc = await ApplicationModel.findByIdAndUpdate(id, update, {
      new: true,
    })
      .lean<ApplicationDoc>()
      .exec();
    if (!doc) throw new Error(`mongo updateApplication: ${id} not found`);
    return toApplication(doc);
  }

  async deleteApplication(id: string): Promise<void> {
    await this.connect();
    await ApplicationModel.findByIdAndDelete(id).exec();
  }

  async deleteApplicationsForUser(
    userId: string,
    ids: string[],
  ): Promise<number> {
    await this.connect();
    if (ids.length === 0) return 0;
    const result = await ApplicationModel.deleteMany({
      user_id: new mongoose.Types.ObjectId(userId),
      _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
    }).exec();
    return result.deletedCount ?? 0;
  }

  async updateApplicationsStatusForUser(
    userId: string,
    ids: string[],
    status: ApplicationStatus,
  ): Promise<number> {
    await this.connect();
    if (ids.length === 0) return 0;
    const result = await ApplicationModel.updateMany(
      {
        user_id: new mongoose.Types.ObjectId(userId),
        _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
      },
      { status },
    ).exec();
    return result.modifiedCount ?? 0;
  }

  /* -- Job filters ---------------------------------------------------------- */

  async createJobFilter(input: NewJobFilter): Promise<JobFilter> {
    await this.connect();
    const parsed = newJobFilterSchema.parse(input);
    const created = await JobFilterModel.create({
      label: parsed.label,
      type: parsed.type,
      owner_id: parsed.ownerId
        ? new mongoose.Types.ObjectId(parsed.ownerId)
        : null,
      description: parsed.description ?? null,
      is_active: parsed.isActive,
    });
    return toJobFilter(created.toObject<JobFilterDoc>());
  }

  async getJobFilterById(id: string): Promise<JobFilter | null> {
    await this.connect();
    const doc = await JobFilterModel.findById(id).lean<JobFilterDoc>().exec();
    return doc ? toJobFilter(doc) : null;
  }

  async listAdminJobFilters(): Promise<JobFilter[]> {
    await this.connect();
    const docs = await JobFilterModel.find({ type: "admin" })
      .sort({ createdAt: 1 })
      .lean<JobFilterDoc[]>()
      .exec();
    return docs.map(toJobFilter);
  }

  async listJobFiltersForUser(userId: string): Promise<JobFilter[]> {
    await this.connect();
    const docs = await JobFilterModel.find({
      $or: [
        { type: "admin", is_active: true },
        { type: "user", owner_id: new mongoose.Types.ObjectId(userId) },
      ],
    })
      .sort({ createdAt: 1 })
      .lean<JobFilterDoc[]>()
      .exec();
    return docs.map(toJobFilter);
  }

  async updateJobFilter(
    id: string,
    patch: UpdateJobFilter,
  ): Promise<JobFilter> {
    await this.connect();
    const update: Record<string, unknown> = {};
    if (patch.label !== undefined) update.label = patch.label;
    if (patch.description !== undefined)
      update.description = patch.description ?? null;
    if (patch.isActive !== undefined) update.is_active = patch.isActive;
    const doc = await JobFilterModel.findByIdAndUpdate(id, update, {
      new: true,
    })
      .lean<JobFilterDoc>()
      .exec();
    if (!doc) throw new Error(`mongo updateJobFilter: ${id} not found`);
    return toJobFilter(doc);
  }

  async deleteJobFilter(id: string): Promise<void> {
    await this.connect();
    await JobFilterModel.findByIdAndDelete(id).exec();
    await UserFilterSettingModel.deleteMany({ filter_id: id }).exec();
  }

  /* -- User filter settings ------------------------------------------------- */

  async setUserFilterEnabled(
    organizationId: string,
    userId: string,
    filterId: string,
    enabled: boolean,
  ): Promise<UserFilterSetting> {
    await this.connect();
    const doc = await UserFilterSettingModel.findOneAndUpdate(
      {
        user_id: new mongoose.Types.ObjectId(userId),
        filter_id: new mongoose.Types.ObjectId(filterId),
      },
      {
        $set: { enabled },
        $setOnInsert: {
          organization_id: new mongoose.Types.ObjectId(organizationId),
        },
      },
      { new: true, upsert: true },
    )
      .lean<UserFilterSettingDoc>()
      .exec();
    return toUserFilterSetting(doc as UserFilterSettingDoc);
  }

  async listUserFilterSettings(userId: string): Promise<UserFilterSetting[]> {
    await this.connect();
    const docs = await UserFilterSettingModel.find({ user_id: userId })
      .lean<UserFilterSettingDoc[]>()
      .exec();
    return docs.map(toUserFilterSetting);
  }

  /* -- Exclusion rules ------------------------------------------------------ */

  async createExclusionRule(input: NewExclusionRule): Promise<ExclusionRule> {
    await this.connect();
    const parsed = newExclusionRuleSchema.parse(input);
    // Idempotent by (user, kind, value): adding a company you already excluded
    // returns the existing rule instead of failing on the unique index.
    const doc = await ExclusionRuleModel.findOneAndUpdate(
      {
        user_id: new mongoose.Types.ObjectId(parsed.userId),
        kind: parsed.kind,
        value: parsed.value,
      },
      {
        $set: { is_active: parsed.isActive },
        $setOnInsert: {
          organization_id: new mongoose.Types.ObjectId(parsed.organizationId),
        },
      },
      { new: true, upsert: true },
    )
      .lean<ExclusionRuleDoc>()
      .exec();
    return toExclusionRule(doc as ExclusionRuleDoc);
  }

  async getExclusionRuleById(id: string): Promise<ExclusionRule | null> {
    await this.connect();
    const doc = await ExclusionRuleModel.findById(id)
      .lean<ExclusionRuleDoc>()
      .exec();
    return doc ? toExclusionRule(doc) : null;
  }

  async listExclusionRulesForUser(userId: string): Promise<ExclusionRule[]> {
    await this.connect();
    const docs = await ExclusionRuleModel.find({ user_id: userId })
      .sort({ kind: 1, value: 1 })
      .lean<ExclusionRuleDoc[]>()
      .exec();
    return docs.map(toExclusionRule);
  }

  async deleteExclusionRule(id: string): Promise<void> {
    await this.connect();
    await ExclusionRuleModel.findByIdAndDelete(id).exec();
  }

  /* -- Admin actions (append-only audit log) -------------------------------- */

  async createAdminAction(input: NewAdminAction): Promise<AdminAction> {
    await this.connect();
    const parsed = newAdminActionSchema.parse(input);
    const created = await AdminActionModel.create({
      actor_user_id: new mongoose.Types.ObjectId(parsed.actorUserId),
      actor_role: parsed.actorRole,
      action: parsed.action,
      target_user_id: parsed.targetUserId
        ? new mongoose.Types.ObjectId(parsed.targetUserId)
        : null,
      target_id: parsed.targetId ?? null,
      reason: parsed.reason,
      metadata: parsed.metadata,
    });
    return toAdminAction(created.toObject<AdminActionDoc>());
  }

  async listAdminActions(
    params: ListAdminActionsParams = {},
  ): Promise<ListAdminActionsResult> {
    await this.connect();
    const { limit = 50, offset = 0 } = params;
    const [docs, total] = await Promise.all([
      AdminActionModel.find()
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean<AdminActionDoc[]>()
        .exec(),
      AdminActionModel.countDocuments().exec(),
    ]);
    return { actions: docs.map(toAdminAction), total };
  }

  /* -- Gmail scans ----------------------------------------------------------- */

  async createGmailScan(input: NewGmailScan): Promise<GmailScan> {
    await this.connect();
    const parsed = newGmailScanSchema.parse(input);
    const created = await GmailScanModel.create({
      organization_id: new mongoose.Types.ObjectId(parsed.organizationId),
      user_id: new mongoose.Types.ObjectId(parsed.userId),
      range_from: parsed.rangeFrom,
      range_to: parsed.rangeTo,
      status: parsed.status,
      error: parsed.error ?? null,
      proposals: parsed.proposals,
    });
    return toGmailScan(created.toObject<GmailScanDoc>());
  }

  async getGmailScanById(id: string): Promise<GmailScan | null> {
    await this.connect();
    const doc = await GmailScanModel.findById(id).lean<GmailScanDoc>().exec();
    return doc ? toGmailScan(doc) : null;
  }

  async listGmailScansForUser(userId: string): Promise<GmailScan[]> {
    await this.connect();
    const docs = await GmailScanModel.find({ user_id: userId })
      .sort({ createdAt: -1 })
      .lean<GmailScanDoc[]>()
      .exec();
    return docs.map(toGmailScan);
  }

  async updateGmailScan(
    id: string,
    patch: UpdateGmailScan,
  ): Promise<GmailScan> {
    await this.connect();
    const update: Record<string, unknown> = {};
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.error !== undefined) update.error = patch.error ?? null;
    if (patch.proposals !== undefined) update.proposals = patch.proposals;
    const doc = await GmailScanModel.findByIdAndUpdate(id, update, {
      new: true,
    })
      .lean<GmailScanDoc>()
      .exec();
    if (!doc) throw new Error(`mongo updateGmailScan: ${id} not found`);
    return toGmailScan(doc);
  }

  async disconnect(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      connectionPromise = null;
    }
  }
}
