/**
 * lib/profiles/service.ts — profile business logic (Node).
 *
 * The ONLY module that encrypts/decrypts EEO fields (lib/crypto) — routes and
 * the DB adapter only ever see packed ciphertext. Also owns default-profile
 * bookkeeping, per-domain last-used prefs, and ownership checks (every read/
 * write is scoped to the session user).
 */

import { z } from "zod";

import type { Session } from "@/lib/auth/types";
import { decryptField, encryptField } from "@/lib/crypto/field-encryption";
import {
  db,
  employmentTypeSchema,
  profileContactSchema,
  profileCustomFieldSchema,
  profileDocumentSchema,
  profileEducationSchema,
  profileExperienceSchema,
  profileLinksSchema,
  profileProjectSchema,
  workArrangementSchema,
  workAuthorizationSchema,
  type Profile,
  type ProfileEeo,
  type UpdateProfile,
} from "@/lib/db";
import { objectUrlFor } from "@/lib/storage/mongodb/adapter";
import { enforceProfileLimit } from "@/lib/usage/enforce";

class ProfileError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ProfileError";
    this.status = status;
  }
}

/* -- EEO encryption boundary ------------------------------------------------ */

/** Plaintext EEO shape — exists ONLY in memory within this module's callers. */
export interface DecryptedEeo {
  consentGivenAt: Date;
  gender: string | null;
  raceEthnicity: string | null;
  veteranStatus: string | null;
  disabilityStatus: string | null;
}

/** Route-level input: consent must be explicitly true to store anything. */
export const eeoInputSchema = z.object({
  consent: z.literal(true),
  gender: z.string().max(100).nullable().optional(),
  raceEthnicity: z.string().max(100).nullable().optional(),
  veteranStatus: z.string().max(100).nullable().optional(),
  disabilityStatus: z.string().max(100).nullable().optional(),
});
export type EeoInput = z.infer<typeof eeoInputSchema>;

function encryptEeo(userId: string, input: EeoInput): ProfileEeo {
  const enc = (value: string | null | undefined): string | null =>
    value ? encryptField(value, userId) : null;
  return {
    consentGivenAt: new Date(),
    gender: enc(input.gender),
    raceEthnicity: enc(input.raceEthnicity),
    veteranStatus: enc(input.veteranStatus),
    disabilityStatus: enc(input.disabilityStatus),
  };
}

function decryptEeo(
  userId: string,
  eeo: ProfileEeo | null | undefined,
): DecryptedEeo | null {
  if (!eeo) return null;
  const dec = (value: string | null | undefined): string | null =>
    value ? decryptField(value, userId) : null;
  return {
    consentGivenAt: eeo.consentGivenAt,
    gender: dec(eeo.gender),
    raceEthnicity: dec(eeo.raceEthnicity),
    veteranStatus: dec(eeo.veteranStatus),
    disabilityStatus: dec(eeo.disabilityStatus),
  };
}

/** A profile as returned to its owner — EEO decrypted. */
export type OwnedProfile = Omit<Profile, "eeo"> & { eeo: DecryptedEeo | null };

function toOwned(profile: Profile): OwnedProfile {
  return { ...profile, eeo: decryptEeo(profile.userId, profile.eeo) };
}

/* -- Input schema (create/update from routes) ------------------------------- */

export const profileInputSchema = z.object({
  name: z.string().min(1).max(60),
  contact: profileContactSchema.optional(),
  summary: z.string().max(2000).nullable().optional(),
  skills: z.array(z.string().max(80)).max(100).optional(),
  experience: z.array(profileExperienceSchema).max(30).optional(),
  education: z.array(profileEducationSchema).max(15).optional(),
  projects: z.array(profileProjectSchema).max(20).optional(),
  customFields: z.array(profileCustomFieldSchema).max(50).optional(),
  /** At most one per kind; the route trusts the storage key it minted. */
  documents: z.array(profileDocumentSchema).max(4).optional(),
  knowledgeBase: z.string().max(10000).optional(),
  links: profileLinksSchema.optional(),
  workAuthorization: workAuthorizationSchema.nullable().optional(),
  workArrangement: workArrangementSchema.nullable().optional(),
  employmentTypes: z.array(employmentTypeSchema).optional(),
  salaryExpectation: z.string().max(120).nullable().optional(),
  /** null clears stored EEO data; omitted leaves it unchanged. */
  eeo: eeoInputSchema.nullable().optional(),
  isDefault: z.boolean().optional(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

/* -- CRUD ------------------------------------------------------------------- */

async function requireOwned(session: Session, id: string): Promise<Profile> {
  const profile = await db.getProfileById(id);
  if (!profile || profile.userId !== session.user.id) {
    throw new ProfileError("Profile not found", 404);
  }
  return profile;
}

/** Just enough to render a picker — deliberately no resume or EEO data. */
export interface ProfileSummary {
  id: string;
  name: string;
  isDefault: boolean;
  updatedAt: Date;
}

/**
 * Profile summaries for pickers (extension popup, selectors). Never decrypts
 * EEO data: callers that list profiles don't need the most sensitive fields
 * in the product, so they never leave the server. Use `getProfile` for the
 * full record when editing.
 */
export async function listProfileSummaries(
  session: Session,
): Promise<ProfileSummary[]> {
  const profiles = await db.listProfilesForUser(session.user.id);
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    isDefault: profile.isDefault,
    updatedAt: profile.updatedAt,
  }));
}

export async function getProfile(
  session: Session,
  id: string,
): Promise<OwnedProfile> {
  return toOwned(await requireOwned(session, id));
}

/**
 * The whitelisted payload the extension's offline Quick Fill matches against.
 *
 * **This ships decrypted EEO answers to the popup** — a deliberate, explicit
 * product decision by the owner, and the ONE place the "EEO never leaves the
 * server" rule is relaxed. (`listProfileSummaries` still withholds them; the
 * picker has no reason to know.) The justification is that EEO self-ID
 * questions are exactly the repetitive ones users want filled without
 * spending an AI action. Consequences to keep in mind before copying this
 * pattern: the values sit in popup memory for the life of the popup, and any
 * future extension code can read them.
 *
 * Everything here is a whitelist, never a spread of the profile — new profile
 * fields must be added deliberately rather than leaking by default.
 */
export interface ProfileFillData {
  id: string;
  name: string;
  contact: Profile["contact"];
  links: Profile["links"];
  workAuthorization: string | null;
  workArrangement: string | null;
  employmentTypes: string[];
  salaryExpectation: string | null;
  customFields: Profile["customFields"];
  /** CV / cover letter the extension can upload into a form's file input. */
  documents: Array<{
    kind: string;
    filename: string;
    contentType: string;
    size: number;
    /** Same-origin path to fetch the bytes from (Bearer-capable). */
    url: string;
  }>;
  /** Most recent role/school only — forms ask for "current", not a history. */
  currentTitle: string | null;
  currentCompany: string | null;
  latestSchool: string | null;
  latestDegree: string | null;
  eeo: DecryptedEeo | null;
}

export async function getProfileFillData(
  session: Session,
  id: string,
): Promise<ProfileFillData> {
  const profile = await requireOwned(session, id);
  const latestRole =
    profile.experience.find((e) => e.current) ?? profile.experience[0];
  const latestSchool = profile.education[0];
  return {
    id: profile.id,
    name: profile.name,
    contact: profile.contact,
    links: profile.links,
    workAuthorization: profile.workAuthorization ?? null,
    workArrangement: profile.workArrangement ?? null,
    employmentTypes: profile.employmentTypes,
    salaryExpectation: profile.salaryExpectation ?? null,
    customFields: profile.customFields,
    documents: profile.documents.map((document) => ({
      kind: document.kind,
      filename: document.filename,
      contentType: document.contentType,
      size: document.size,
      url: objectUrlFor(document.key),
    })),
    currentTitle: latestRole?.title ?? null,
    currentCompany: latestRole?.company ?? null,
    latestSchool: latestSchool?.school ?? null,
    latestDegree: latestSchool?.degree ?? null,
    eeo: decryptEeo(profile.userId, profile.eeo),
  };
}

export async function createProfile(
  session: Session,
  input: ProfileInput,
): Promise<OwnedProfile> {
  if (!session.organizationId) {
    throw new ProfileError("No active organization", 400);
  }
  const existing = await db.listProfilesForUser(session.user.id);
  await enforceProfileLimit(session, existing.length);
  if (existing.some((p) => p.name === input.name)) {
    throw new ProfileError(
      `You already have a profile named "${input.name}"`,
      409,
    );
  }
  const profile = await db.createProfile({
    organizationId: session.organizationId,
    userId: session.user.id,
    name: input.name,
    contact: input.contact ?? {},
    summary: input.summary ?? null,
    skills: input.skills ?? [],
    experience: input.experience ?? [],
    education: input.education ?? [],
    projects: input.projects ?? [],
    customFields: input.customFields ?? [],
    documents: input.documents ?? [],
    knowledgeBase: input.knowledgeBase ?? "",
    links: input.links ?? {},
    workAuthorization: input.workAuthorization ?? null,
    workArrangement: input.workArrangement ?? null,
    employmentTypes: input.employmentTypes ?? [],
    salaryExpectation: input.salaryExpectation ?? null,
    eeo: input.eeo ? encryptEeo(session.user.id, input.eeo) : null,
    // The first profile is automatically the default.
    isDefault: existing.length === 0 ? true : (input.isDefault ?? false),
  });
  if (profile.isDefault && existing.length > 0) {
    await unsetOtherDefaults(session.user.id, profile.id);
  }
  return toOwned(profile);
}

export async function updateProfile(
  session: Session,
  id: string,
  input: Partial<ProfileInput>,
): Promise<OwnedProfile> {
  const current = await requireOwned(session, id);

  if (input.name && input.name !== current.name) {
    const siblings = await db.listProfilesForUser(session.user.id);
    if (siblings.some((p) => p.id !== id && p.name === input.name)) {
      throw new ProfileError(
        `You already have a profile named "${input.name}"`,
        409,
      );
    }
  }

  const patch: UpdateProfile = {
    name: input.name,
    contact: input.contact,
    summary: input.summary,
    skills: input.skills,
    experience: input.experience,
    education: input.education,
    projects: input.projects,
    customFields: input.customFields,
    documents: input.documents,
    knowledgeBase: input.knowledgeBase,
    links: input.links,
    workAuthorization: input.workAuthorization,
    workArrangement: input.workArrangement,
    employmentTypes: input.employmentTypes,
    salaryExpectation: input.salaryExpectation,
    isDefault: input.isDefault,
  };
  if (input.eeo !== undefined) {
    patch.eeo =
      input.eeo === null ? null : encryptEeo(session.user.id, input.eeo);
  }

  const updated = await db.updateProfile(id, patch);
  if (input.isDefault) {
    await unsetOtherDefaults(session.user.id, id);
  }
  return toOwned(updated);
}

export async function deleteProfile(
  session: Session,
  id: string,
): Promise<void> {
  const profile = await requireOwned(session, id);
  await db.deleteProfile(id);
  if (profile.isDefault) {
    const remaining = await db.listProfilesForUser(session.user.id);
    if (remaining.length > 0 && !remaining.some((p) => p.isDefault)) {
      await db.updateProfile(remaining[0].id, { isDefault: true });
    }
  }
}

async function unsetOtherDefaults(
  userId: string,
  keepId: string,
): Promise<void> {
  const profiles = await db.listProfilesForUser(userId);
  for (const profile of profiles) {
    if (profile.id !== keepId && profile.isDefault) {
      await db.updateProfile(profile.id, { isDefault: false });
    }
  }
}

/* -- Per-domain last-used profile (extension picker memory) ----------------- */

export async function rememberDomainProfile(
  session: Session,
  domain: string,
  profileId: string,
): Promise<void> {
  if (!session.organizationId) return;
  await requireOwned(session, profileId);
  await db.setProfileDomainPref(
    session.organizationId,
    session.user.id,
    domain.toLowerCase(),
    profileId,
  );
}

/**
 * The profile to preselect for a domain: last-used there → default → first.
 * Returns null when the user has no profiles yet.
 */
export async function profileForDomain(
  session: Session,
  domain: string | null,
): Promise<OwnedProfile | null> {
  if (domain) {
    const pref = await db.getProfileDomainPref(
      session.user.id,
      domain.toLowerCase(),
    );
    if (pref) {
      const preferred = await db.getProfileById(pref.profileId);
      if (preferred && preferred.userId === session.user.id) {
        return toOwned(preferred);
      }
    }
  }
  const profiles = await db.listProfilesForUser(session.user.id);
  const chosen = profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;
  return chosen ? toOwned(chosen) : null;
}
