/**
 * scripts/seed.ts — CORE (CLAUDE.md §2). Provider-aware baseline seed.
 *
 * Seeds whichever provider `DB_PROVIDER` selects. Creates two users WITH valid
 * auth credentials (via the auth adapter, so email/password sign-in works
 * locally), one test organization, and their memberships (admin + user).
 *
 * Per the "new table = three things" rule (§1.4), every model added in a later
 * phase adds its seed entry here in the same commit as its schema and adapter
 * method.
 *
 * Run with `pnpm seed` (or `npm run seed`). Idempotent — safe to re-run against
 * an existing database (users, org, memberships, and pending invites are
 * looked up before insert). Requires valid DB + AUTH env (see .env.example).
 */

import { randomUUID } from "node:crypto";

import "./load-env";
import { env } from "@/config/env.schema";
import { auth } from "@/lib/auth";
import {
  db,
  INVITATION_STATUSES,
  JOB_FILTER_TYPES,
  ORG_ROLES,
  PLAN_SLUGS,
  type Invitation,
  type NewInvitation,
  type NewOrganization,
  type NewOrganizationMember,
  type NewPlan,
  type Organization,
} from "@/lib/db";

/** Shared password for the seeded users — local testing only. */
const SEED_PASSWORD = "Password123!";

/** How long seeded invitations stay valid. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function ensureUser(
  email: string,
  name: string,
): Promise<{ id: string; email: string }> {
  const existing = await db.getUserByEmail(email);
  if (existing) return existing;
  const { user } = await auth.createCredentials({
    email,
    password: SEED_PASSWORD,
    name,
  });
  return user;
}

async function ensureOrganization(
  input: NewOrganization,
): Promise<Organization> {
  const existing = await db.getOrganizationBySlug(input.slug);
  if (existing) return existing;
  return db.createOrganization(input);
}

async function ensureMember(
  input: NewOrganizationMember,
): Promise<Awaited<ReturnType<typeof db.addMember>>> {
  const existing = await db.getMembership(input.organizationId, input.userId);
  if (existing) return existing;
  return db.addMember(input);
}

async function ensurePendingInvitation(
  input: NewInvitation,
): Promise<Invitation> {
  const existing = await db.getPendingInvitationForEmail(
    input.organizationId,
    input.email,
  );
  if (existing) return existing;
  return db.createInvitation(input);
}

async function main(): Promise<void> {
  console.log(`Seeding via the "${env.DB_PROVIDER}" adapter…`);

  const admin = await ensureUser("admin@example.com", "Admin User");
  const member = await ensureUser("user@example.com", "Regular User");

  const org = await ensureOrganization({
    name: "Test Organization",
    slug: "test-org",
  });

  await ensureMember({
    organizationId: org.id,
    userId: admin.id,
    role: ORG_ROLES.admin,
  });
  await ensureMember({
    organizationId: org.id,
    userId: member.id,
    role: ORG_ROLES.user,
  });

  // Promote the platform super-admin (§14) — from SUPER_ADMIN_EMAIL, or the
  // seeded admin as a sensible local default. Never hardcoded in app code.
  const superAdminEmail = env.SUPER_ADMIN_EMAIL ?? admin.email;
  const superAdminUser = await db.getUserByEmail(superAdminEmail);
  if (superAdminUser) {
    await db.updateUser(superAdminUser.id, { isSuperAdmin: true });
  }

  // A pending invitation so the members UI has data to render.
  const invite = await ensurePendingInvitation({
    organizationId: org.id,
    email: "invitee@example.com",
    role: ORG_ROLES.user,
    token: `seed-invite-${randomUUID()}`,
    status: INVITATION_STATUSES.pending,
    invitedByUserId: admin.id,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  // Seeded local users are treated as email-verified so credential login and
  // trial logic behave like a real verified account.
  for (const seeded of [admin, member]) {
    const record = await db.getUserById(seeded.id);
    if (record && !record.emailVerifiedAt) {
      await db.updateUser(seeded.id, { emailVerifiedAt: new Date() });
    }
  }

  // Platform pricing plans (§15). Prices/names/caps are data (super admin edits
  // them in the admin panel; Stripe ids are minted by scripts/sync-plans.ts) —
  // nothing in app logic hardcodes them. Slugs are the stable lookups. Prices
  // are integer minor units (cents); aiCallsPerMonth is the per-plan AI cap.
  // Idempotent by slug.
  const planSeeds: NewPlan[] = [
    {
      slug: PLAN_SLUGS.free,
      name: "Free",
      description: "Try it out with a small monthly allowance.",
      priceMonthly: 0,
      priceAnnual: null,
      annualDiscountPercent: null,
      limits: {
        aiCallsPerMonth: 5,
        leadLimit: 100,
        campaignLimit: 2,
        enrichment: false,
        offerLines: false,
        dataExport: false,
      },
      isActive: true,
      sortOrder: 0,
    },
    {
      slug: PLAN_SLUGS.starter,
      name: "Starter",
      description: "For getting your first lead lists off the ground.",
      priceMonthly: 399,
      priceAnnual: 3830,
      annualDiscountPercent: 20,
      limits: {
        aiCallsPerMonth: 50,
        leadLimit: 2000,
        campaignLimit: 10,
        enrichment: false,
        offerLines: false,
        dataExport: false,
      },
      isActive: true,
      sortOrder: 1,
    },
    {
      slug: PLAN_SLUGS.pro,
      name: "Pro",
      description: "For serious, high-volume lead generation.",
      priceMonthly: 699,
      priceAnnual: 6710,
      annualDiscountPercent: 20,
      limits: {
        aiCallsPerMonth: 150,
        leadLimit: 25000,
        campaignLimit: 50,
        enrichment: true,
        offerLines: true,
        dataExport: true,
      },
      isActive: true,
      sortOrder: 2,
    },
    {
      slug: PLAN_SLUGS.premium,
      name: "Premium",
      description: "Unlimited throughput for power users and teams.",
      priceMonthly: 999,
      priceAnnual: 9590,
      annualDiscountPercent: 20,
      limits: {
        // -1 = unlimited (see the numeric limit helpers in
        // lib/usage/enforce.ts).
        aiCallsPerMonth: 300,
        leadLimit: -1,
        campaignLimit: -1,
        enrichment: true,
        offerLines: true,
        dataExport: true,
      },
      isActive: true,
      sortOrder: 3,
    },
  ];
  for (const planSeed of planSeeds) {
    const existing = await db.getPlanBySlug(planSeed.slug);
    if (!existing) {
      await db.createPlan(planSeed);
      continue;
    }
    // Backfill only limit keys the plan doesn't have yet, so a deployment
    // seeded before an entitlement existed picks it up on the next `npm run
    // seed`. Everything a super admin owns — price, name, description, active,
    // sort order, Stripe ids, and any limit they've already tuned — is left
    // exactly as-is, which keeps this safe to re-run any number of times.
    const seededLimits = planSeed.limits ?? {};
    const currentLimits = existing.limits ?? {};
    const missing = Object.entries(seededLimits).filter(
      ([key]) => !(key in currentLimits),
    );
    if (missing.length > 0) {
      await db.updatePlan(existing.id, {
        limits: { ...currentLimits, ...Object.fromEntries(missing) },
      });
      console.log(
        `  ↳ ${planSeed.slug}: added limits ${missing.map(([k]) => k).join(", ")}`,
      );
    }
  }

  // Admin-default "Valid Job" filters (product spec §4). Idempotent by label.
  const defaultFilters = [
    {
      label: "Visa Sponsorship Available",
      description:
        "Yes when the posting says it sponsors visas (H1-B or similar). No when it says it cannot sponsor. Neutral when sponsorship is never mentioned — most postings say nothing, and silence is not a refusal.",
    },
    {
      label: "US Citizenship Required",
      description:
        "Yes when the posting requires US citizenship. No when it explicitly says citizenship is not required. Neutral when it isn't mentioned. (Yes here is a restriction, not a positive.)",
    },
    {
      label: "Security Clearance Required",
      description:
        "Yes when the posting requires an active or obtainable clearance. No when it explicitly says none is needed. Neutral when it isn't mentioned. (Yes here is a restriction, not a positive.)",
    },
    {
      label: "Work Authorization Match",
      description:
        "Compares the posting against the candidate's stated work authorization. Yes when they're compatible, No when the posting's requirement rules the candidate out, Neutral when the posting states no requirement.",
    },
    {
      label: "Remote/Hybrid/Onsite Match",
      description:
        "Compares the posting against the candidate's preferred arrangement. Yes when they match, No when the posting conflicts (e.g. fully onsite for a remote-only candidate), Neutral when the posting doesn't state where the work happens.",
    },
    {
      label: "Salary Range Disclosed",
      description:
        "Yes when the posting states a salary or compensation range. No is not really applicable here — a posting that omits pay is Neutral, not No.",
    },
  ];
  const existingAdminFilters = await db.listAdminJobFilters();
  const existingLabels = new Set(existingAdminFilters.map((f) => f.label));
  for (const filter of defaultFilters) {
    if (!existingLabels.has(filter.label)) {
      await db.createJobFilter({
        label: filter.label,
        description: filter.description,
        type: JOB_FILTER_TYPES.admin,
        ownerId: null,
        isActive: true,
      });
    }
  }

  // Ensure the platform settings singleton exists. `trialDays` (default 7) is
  // the length of the local no-card trial started at email verification;
  // the legacy Stripe-checkout trial is disabled in lib/payments/checkout.ts.
  const settings = await db.getAppSettings();

  console.log("Seed complete:");
  console.log(`  organization  ${org.id} (${org.slug})`);
  console.log(`  admin user    ${admin.id} (${admin.email})`);
  console.log(`  regular user  ${member.id} (${member.email})`);
  console.log(
    `  super admin   ${
      superAdminUser
        ? superAdminEmail +
          (env.SUPER_ADMIN_EMAIL
            ? ""
            : " (default; set SUPER_ADMIN_EMAIL to override)")
        : `not promoted — ${superAdminEmail} not found`
    }`,
  );
  console.log(
    `  invitation    ${invite.email} → ${invite.status} (${org.slug})`,
  );
  const plans = await db.listPlans();
  console.log(
    `  plans         ${plans.map((p) => `${p.name} (${p.slug})`).join(", ") || "none"}`,
  );
  const filters = await db.listAdminJobFilters();
  console.log(`  job filters   ${filters.length} admin defaults`);
  console.log(`  app settings  trialDays=${settings.trialDays}`);
  console.log(`  password for both: ${SEED_PASSWORD}`);

  await db.disconnect?.();
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
