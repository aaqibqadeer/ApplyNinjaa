/**
 * lib/usage/rate-limit.ts — fixed-window rate limiting backed by MongoDB.
 *
 * Deliberately NOT part of the provider-neutral DB adapter: atomic `$inc`
 * upserts and TTL indexes are Mongo primitives, and this is operational data,
 * not tenant domain data (same precedent as `auth_credentials`). This fork is
 * MongoDB-only (§1.5), so no second implementation is needed.
 *
 * Fixed windows are good enough for v1: the doc key embeds the window number,
 * a TTL index garbage-collects old windows, and one `$inc` upsert per request
 * is race-free.
 */

import mongoose, { Schema, type Model } from "mongoose";

import { connectMongo } from "@/lib/db/mongodb/adapter";

interface RateLimitDoc {
  _id: mongoose.Types.ObjectId;
  key: string;
  count: number;
  expires_at: Date;
}

const rateLimitSchema = new Schema<RateLimitDoc>(
  {
    key: { type: String, required: true, unique: true, index: true },
    count: { type: Number, required: true, default: 0 },
    expires_at: { type: Date, required: true },
  },
  { collection: "rate_limits" },
);
rateLimitSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

const RateLimitModel: Model<RateLimitDoc> =
  (mongoose.models.RateLimit as Model<RateLimitDoc> | undefined) ??
  mongoose.model<RateLimitDoc>("RateLimit", rateLimitSchema);

export class RateLimitError extends Error {
  readonly status = 429;
  readonly payload: { code: string; retryAfterSeconds: number };
  constructor(retryAfterSeconds: number) {
    super("Too many requests — slow down and try again shortly");
    this.name = "RateLimitError";
    this.payload = { code: "RATE_LIMITED", retryAfterSeconds };
  }
}

export interface RateLimitInput {
  /** Logical bucket, e.g. `ai:user:<id>` or `ai:ip:<addr>`. */
  key: string;
  /** Max requests allowed per window. */
  limit: number;
  windowSeconds: number;
}

/** Throws RateLimitError when `key` exceeds `limit` in the current window. */
export async function enforceRateLimit(input: RateLimitInput): Promise<void> {
  await connectMongo();
  const windowIndex = Math.floor(Date.now() / (input.windowSeconds * 1000));
  const windowEnd = (windowIndex + 1) * input.windowSeconds * 1000;
  const doc = await RateLimitModel.findOneAndUpdate(
    { key: `${input.key}:${windowIndex}` },
    {
      $inc: { count: 1 },
      // TTL padding so a window's doc survives slightly past its end.
      $setOnInsert: { expires_at: new Date(windowEnd + 60_000) },
    },
    { new: true, upsert: true },
  )
    .lean<RateLimitDoc>()
    .exec();
  if ((doc?.count ?? 0) > input.limit) {
    throw new RateLimitError(Math.ceil((windowEnd - Date.now()) / 1000));
  }
}

/** Best-effort client IP for per-IP limiting (behind a proxy/CDN). */
export function requestIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
