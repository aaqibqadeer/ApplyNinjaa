/**
 * Offline capture queue — hand-rolled IndexedDB (no new dependency).
 *
 * Every captured record lands here first, keyed by a client-generated
 * `clientId` (crypto.randomUUID()). The sync loop (sync.ts) drains it to
 * POST /api/leads/ingest; the `clientId` is sent as `clientCaptureId`, and the
 * server upserts on the unique-sparse (organization_id, client_capture_id)
 * index — so retries can never double-insert. This means capture works fully
 * offline: records accumulate here and flush when the network returns.
 *
 * Usable from the service worker (IndexedDB is available there).
 */

import type { RawRecord } from "../scrapers/types";

/** Mirrors LEAD_SOURCE_TYPES in lib/db/schema.ts. */
export type LeadSourceType = "google_maps" | "generic_web" | "manual" | "csv";

const DB_NAME = "scrapperninja";
const DB_VERSION = 1;
const STORE = "captureQueue";

export type QueueState = "pending" | "syncing" | "synced" | "failed";

export interface QueueRecord {
  clientId: string;
  campaignId: string;
  sessionId: string | null;
  sourceType: LeadSourceType;
  payload: RawRecord;
  attempts: number;
  state: QueueState;
  createdAt: number;
  lastError?: string;
}

export interface QueueCounts {
  total: number;
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  /** Records whose payload carries parse issues (need server-side review). */
  needsReview: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "clientId" });
        store.createIndex("state", "state", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

function getAll(): Promise<QueueRecord[]> {
  return tx<QueueRecord[]>("readonly", (store) => store.getAll());
}

/**
 * Add a captured record to the queue. Returns the assigned clientId. A record
 * arriving with an existing clientId is treated as an update (idempotent).
 */
export async function enqueue(input: {
  payload: RawRecord;
  campaignId: string;
  sessionId: string | null;
  sourceType: LeadSourceType;
}): Promise<string> {
  const clientId = input.payload.clientId ?? crypto.randomUUID();
  const record: QueueRecord = {
    clientId,
    campaignId: input.campaignId,
    sessionId: input.sessionId,
    sourceType: input.sourceType,
    payload: { ...input.payload, clientId },
    attempts: 0,
    state: "pending",
    createdAt: Date.now(),
  };
  await tx("readwrite", (store) => store.put(record));
  return clientId;
}

/** Records eligible to sync now: pending or previously failed. */
export async function listPending(limit?: number): Promise<QueueRecord[]> {
  const all = await getAll();
  const ready = all
    .filter((r) => r.state === "pending" || r.state === "failed")
    .sort((a, b) => a.createdAt - b.createdAt);
  return typeof limit === "number" ? ready.slice(0, limit) : ready;
}

/** Mark a batch as syncing so overlapping ticks don't double-send them. */
export async function markSyncing(clientIds: string[]): Promise<void> {
  await Promise.all(
    clientIds.map(async (clientId) => {
      const record = await tx<QueueRecord | undefined>("readonly", (store) =>
        store.get(clientId),
      );
      if (!record) return;
      await tx("readwrite", (store) =>
        store.put({ ...record, state: "syncing" as QueueState }),
      );
    }),
  );
}

/** A successful sync leaves a lightweight tombstone so counts stay accurate. */
export async function markSynced(clientIds: string[]): Promise<void> {
  await Promise.all(
    clientIds.map(async (clientId) => {
      const record = await tx<QueueRecord | undefined>("readonly", (store) =>
        store.get(clientId),
      );
      if (!record) return;
      await tx("readwrite", (store) =>
        store.put({ ...record, state: "synced" as QueueState }),
      );
    }),
  );
}

/** A failed sync bumps attempts and returns the batch to a retryable state. */
export async function markFailed(
  clientIds: string[],
  error: string,
): Promise<void> {
  await Promise.all(
    clientIds.map(async (clientId) => {
      const record = await tx<QueueRecord | undefined>("readonly", (store) =>
        store.get(clientId),
      );
      if (!record) return;
      await tx("readwrite", (store) =>
        store.put({
          ...record,
          state: "failed" as QueueState,
          attempts: record.attempts + 1,
          lastError: error,
        }),
      );
    }),
  );
}

export async function counts(): Promise<QueueCounts> {
  const all = await getAll();
  const base: QueueCounts = {
    total: all.length,
    pending: 0,
    syncing: 0,
    synced: 0,
    failed: 0,
    needsReview: 0,
  };
  for (const record of all) {
    base[record.state] += 1;
    if ((record.payload.parseIssues?.length ?? 0) > 0) base.needsReview += 1;
  }
  return base;
}

/** Remove synced tombstones (called when clearing a finished session). */
export async function clearSynced(): Promise<void> {
  const all = await getAll();
  await Promise.all(
    all
      .filter((r) => r.state === "synced")
      .map((r) => tx("readwrite", (store) => store.delete(r.clientId))),
  );
}
