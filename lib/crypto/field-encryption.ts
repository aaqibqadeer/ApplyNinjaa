/**
 * lib/crypto/field-encryption.ts — application-level field encryption
 * (AES-256-GCM via node:crypto).
 *
 * Used for data that must be unreadable even with raw database access: EEO/
 * demographic profile fields and stored Gmail refresh tokens. Key material is
 * `env.EEO_ENCRYPTION_KEY` (base64, exactly 32 bytes — `openssl rand -base64
 * 32`), validated lazily so builds without secrets still compile.
 *
 * Packed format: `v1.<iv>.<tag>.<ciphertext>` (base64url segments). The `v1`
 * prefix allows future key/algorithm rotation. Pass the owning user's id as
 * `aad` so a ciphertext can't be copied between records and still decrypt.
 *
 * ONLY service layers (lib/profiles, lib/gmail) may import this — routes,
 * adapters, and schemas only ever see the packed ciphertext string.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { env } from "@/config/env.schema";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  if (!env.EEO_ENCRYPTION_KEY) {
    throw new Error("EEO_ENCRYPTION_KEY is not configured");
  }
  const decoded = Buffer.from(env.EEO_ENCRYPTION_KEY, "base64");
  if (decoded.length !== 32) {
    throw new Error(
      "EEO_ENCRYPTION_KEY must be exactly 32 bytes, base64-encoded (openssl rand -base64 32)",
    );
  }
  cachedKey = decoded;
  return decoded;
}

export function encryptField(plaintext: string, aad?: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const data = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}

/**
 * Decrypt a packed field. Returns null (never throws) on tamper/corruption/
 * wrong key so one bad field degrades gracefully instead of 500-ing the whole
 * record — callers should surface "unavailable", not crash.
 */
export function decryptField(packed: string, aad?: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = packed.split(".");
    if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv(
      ALGORITHM,
      key(),
      Buffer.from(ivB64, "base64url"),
    );
    if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}
