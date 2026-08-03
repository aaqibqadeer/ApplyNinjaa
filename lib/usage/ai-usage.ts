/**
 * lib/usage/ai-usage.ts — per-user monthly AI usage counters + call log
 * (MongoDB-only module — see rate-limit.ts for why this bypasses the adapter).
 *
 * The counter collection (`ai_usage_counters`, one doc per user+month) is the
 * cap-enforcement source of truth — incremented atomically by
 * `lib/usage/enforce.ts`. The log collection (`ai_usage_logs`) is an
 * observability trail (admin "usage this month" detail, debugging), TTL'd
 * after ~180 days.
 */

import mongoose, { Schema, type Model } from "mongoose";

import { connectMongo } from "@/lib/db/mongodb/adapter";

/** What kind of AI work a call performed (one entry per billable call). */
export const AI_CALL_KINDS = [
  "resume_parse",
  "field_map",
  // Combined filter-verdicts + fit-score popup analysis (one billable call).
  "job_analysis",
  "gmail_classify",
  // ScrapperNinja: repair one flagged capture's rawSnippet (one call each).
  "lead_rescue",
  // ScrapperNinja: generic-adapter extraction of cleaned text blocks.
  "scrape_extract",
  // ScrapperNinja Phase 3 batch passes (one billable call per lead each).
  "lead_normalize",
  "lead_label",
  "lead_enrich",
  "lead_score",
  "lead_offer",
] as const;
export type AiCallKind = (typeof AI_CALL_KINDS)[number];

interface AiUsageCounterDoc {
  _id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  /** Calendar month, e.g. "2026-07" (UTC). */
  period: string;
  count: number;
}

const aiUsageCounterSchema = new Schema<AiUsageCounterDoc>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    period: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
  },
  { collection: "ai_usage_counters" },
);
aiUsageCounterSchema.index({ user_id: 1, period: 1 }, { unique: true });

interface AiUsageLogDoc {
  _id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  organization_id: mongoose.Types.ObjectId | null;
  kind: string;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  createdAt: Date;
}

const aiUsageLogSchema = new Schema<AiUsageLogDoc>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    organization_id: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    kind: { type: String, required: true },
    model: { type: String, default: null },
    tokens_in: { type: Number, default: null },
    tokens_out: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "ai_usage_logs" },
);
aiUsageLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

const AiUsageCounterModel: Model<AiUsageCounterDoc> =
  (mongoose.models.AiUsageCounter as Model<AiUsageCounterDoc> | undefined) ??
  mongoose.model<AiUsageCounterDoc>("AiUsageCounter", aiUsageCounterSchema);

const AiUsageLogModel: Model<AiUsageLogDoc> =
  (mongoose.models.AiUsageLog as Model<AiUsageLogDoc> | undefined) ??
  mongoose.model<AiUsageLogDoc>("AiUsageLog", aiUsageLogSchema);

/** Current UTC calendar month, e.g. "2026-07". */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getMonthlyAiUsage(
  userId: string,
  period = currentPeriod(),
): Promise<number> {
  await connectMongo();
  const doc = await AiUsageCounterModel.findOne({
    user_id: new mongoose.Types.ObjectId(userId),
    period,
  })
    .lean<AiUsageCounterDoc>()
    .exec();
  return doc?.count ?? 0;
}

/** Batched month-usage lookup (admin user list) — userId → count. */
export async function getMonthlyAiUsageBulk(
  userIds: string[],
  period = currentPeriod(),
): Promise<Map<string, number>> {
  await connectMongo();
  if (userIds.length === 0) return new Map();
  const docs = await AiUsageCounterModel.find({
    user_id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
    period,
  })
    .lean<AiUsageCounterDoc[]>()
    .exec();
  return new Map(docs.map((d) => [d.user_id.toString(), d.count]));
}

/**
 * Atomically increment the user's monthly counter and return the new value.
 * Increment-first (check-and-refund in the caller) keeps the hard cap
 * race-free under concurrent requests.
 */
export async function incrementMonthlyAiUsage(
  userId: string,
  period = currentPeriod(),
): Promise<number> {
  await connectMongo();
  const doc = await AiUsageCounterModel.findOneAndUpdate(
    { user_id: new mongoose.Types.ObjectId(userId), period },
    { $inc: { count: 1 } },
    { new: true, upsert: true },
  )
    .lean<AiUsageCounterDoc>()
    .exec();
  return doc?.count ?? 1;
}

/** Refund one increment (used when the increment overshot the cap). */
export async function decrementMonthlyAiUsage(
  userId: string,
  period = currentPeriod(),
): Promise<void> {
  await connectMongo();
  await AiUsageCounterModel.updateOne(
    { user_id: new mongoose.Types.ObjectId(userId), period },
    { $inc: { count: -1 } },
  ).exec();
}

export interface RecordAiCallInput {
  userId: string;
  organizationId: string | null;
  kind: AiCallKind;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}

/** Append to the observability log (the counter is handled by enforce.ts). */
export async function recordAiCall(input: RecordAiCallInput): Promise<void> {
  await connectMongo();
  await AiUsageLogModel.create({
    user_id: new mongoose.Types.ObjectId(input.userId),
    organization_id: input.organizationId
      ? new mongoose.Types.ObjectId(input.organizationId)
      : null,
    kind: input.kind,
    model: input.model ?? null,
    tokens_in: input.tokensIn ?? null,
    tokens_out: input.tokensOut ?? null,
  });
}
