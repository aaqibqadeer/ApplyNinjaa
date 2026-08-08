/**
 * lib/storage/index.ts — selects the storage provider from `STORAGE_PROVIDER`
 * (mirrors lib/db/index.ts). App code does `import { storage } from
 * "@/lib/storage"` and never touches an SDK. Construction is lazy and guarded by
 * the `storage` flag — the adapter is only reached from flag-gated routes.
 */

import { env } from "@/config/env.schema";
import { features } from "@/config/features";

import type { StorageAdapter } from "./adapter";
import { MongoStorageAdapter } from "./mongodb/adapter";
import { S3StorageAdapter } from "./s3/adapter";

function createAdapter(): StorageAdapter {
  if (!features.storage) {
    throw new Error(
      "storage adapter used while storage is disabled — set NEXT_PUBLIC_FEATURE_STORAGE",
    );
  }
  // The one file allowed to branch on the provider (§1.2). `mongodb` reuses
  // the database connection and needs no object-store credentials, which is
  // why this fork defaults to it; `s3` covers AWS and any S3-compatible
  // endpoint (R2, MinIO).
  return env.STORAGE_PROVIDER === "s3"
    ? new S3StorageAdapter()
    : new MongoStorageAdapter();
}

let instance: StorageAdapter | null = null;
function getInstance(): StorageAdapter {
  return (instance ??= createAdapter());
}

export const storage: StorageAdapter = new Proxy({} as StorageAdapter, {
  get(_target, prop) {
    const target = getInstance() as unknown as Record<PropertyKey, unknown>;
    const value = target[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value;
  },
});

export type { StorageAdapter } from "./adapter";
