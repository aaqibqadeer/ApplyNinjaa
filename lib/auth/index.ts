/**
 * lib/auth/index.ts — the auth adapter accessor (Node). App code and route
 * handlers do `import { auth } from "@/lib/auth"`. This module imports the
 * concrete adapter (mongoose), so it is Node-only — middleware uses
 * `@/lib/auth/edge` instead. This fork resolved to MongoDB (§1.5); the
 * Supabase auth adapter was removed.
 */

import type { AuthAdapter } from "./adapter";
import { MongoAuthAdapter } from "./mongodb/adapter";

function createAuthAdapter(): AuthAdapter {
  return new MongoAuthAdapter();
}

/** Created lazily on first use (not at import) — see the note in lib/db/index.ts. */
let instance: AuthAdapter | null = null;
function getInstance(): AuthAdapter {
  return (instance ??= createAuthAdapter());
}

export const auth: AuthAdapter = new Proxy({} as AuthAdapter, {
  get(_target, prop) {
    const target = getInstance() as unknown as Record<PropertyKey, unknown>;
    const value = target[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  },
});

export type { AuthAdapter } from "./adapter";
export * from "./types";
