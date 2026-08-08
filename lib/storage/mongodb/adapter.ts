/**
 * lib/storage/mongodb/adapter.ts — GridFS implementation of StorageAdapter.
 *
 * Why this exists alongside the S3 adapter: this fork runs on Railway +
 * MongoDB Atlas and has no object-store credentials, so an S3-only storage
 * layer would ship a feature nobody could turn on. GridFS reuses the database
 * connection that already exists.
 *
 * The one place it diverges from S3 is presigning. GridFS has no notion of a
 * signed URL, so `getUploadUrl`/`getDownloadUrl` return a same-origin app
 * route (`/api/storage/objects/<key>`) instead. The trade-off is deliberate:
 * bytes travel through the Next.js server rather than client↔provider, and
 * authority comes from the caller's own session on that route rather than from
 * the URL. Callers see the same interface either way.
 */

import { Readable } from "node:stream";

import mongoose from "mongoose";

import { connectMongo } from "@/lib/db/mongodb/adapter";

import type { StorageAdapter } from "../adapter";

const BUCKET_NAME = "uploads";

/** Route that serves these objects; also the "URL" this adapter hands back. */
export const OBJECT_ROUTE_PREFIX = "/api/storage/objects";

export function objectUrlFor(key: string): string {
  return `${OBJECT_ROUTE_PREFIX}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function bucket(): Promise<mongoose.mongo.GridFSBucket> {
  await connectMongo();
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoStorageAdapter: no database connection");
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
}

export interface StoredObject {
  stream: Readable;
  contentType: string;
  length: number;
  filename: string;
}

export class MongoStorageAdapter implements StorageAdapter {
  // The content type isn't needed up front (nothing is being signed) — it is
  // read from the PUT's own Content-Type header, so the parameter is dropped.
  async getUploadUrl(key: string): Promise<{ url: string; key: string }> {
    // No presigning: the client PUTs to our own route, which authenticates the
    // session and checks the key belongs to it.
    return { url: objectUrlFor(key), key };
  }

  async getDownloadUrl(key: string): Promise<{ url: string }> {
    return { url: objectUrlFor(key) };
  }

  async deleteObject(key: string): Promise<void> {
    const gridfs = await bucket();
    const files = await gridfs.find({ filename: key }).toArray();
    for (const file of files) {
      await gridfs.delete(file._id);
    }
  }
}

/* -- Byte-level helpers used by the object route ---------------------------- */

/**
 * Write (or replace) an object. Replacing rather than versioning keeps "one
 * key = one file" true, which is what the profile-document rows assume.
 */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const gridfs = await bucket();
  const existing = await gridfs.find({ filename: key }).toArray();
  for (const file of existing) {
    await gridfs.delete(file._id);
  }
  await new Promise<void>((resolve, reject) => {
    const upload = gridfs.openUploadStream(key, {
      metadata: { contentType },
    });
    upload.on("error", reject);
    upload.on("finish", () => resolve());
    Readable.from(body).pipe(upload);
  });
}

export async function getObject(key: string): Promise<StoredObject | null> {
  const gridfs = await bucket();
  const [file] = await gridfs.find({ filename: key }).limit(1).toArray();
  if (!file) return null;
  const metadata = (file.metadata ?? {}) as { contentType?: string };
  return {
    stream: gridfs.openDownloadStream(file._id),
    contentType: metadata.contentType ?? "application/octet-stream",
    length: file.length,
    filename: key.split("/").pop() ?? "file",
  };
}
