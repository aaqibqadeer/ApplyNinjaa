/**
 * lib/gmail/store.ts — encrypted Gmail refresh-token storage (Mongo-only
 * module, same precedent as auth_credentials: OAuth secrets stay out of the
 * provider-neutral DB adapter; scan documents DO go through the adapter).
 *
 * Refresh tokens are encrypted with the app's field-encryption key before
 * hitting the database and only decrypted transiently to mint access tokens.
 */

import mongoose, { Schema, type Model } from "mongoose";

import { decryptField, encryptField } from "@/lib/crypto/field-encryption";
import { connectMongo } from "@/lib/db/mongodb/adapter";

interface GmailTokenDoc {
  _id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  refresh_token_enc: string;
  email_address: string | null;
  scope: string;
  createdAt: Date;
  updatedAt: Date;
}

const gmailTokenSchema = new Schema<GmailTokenDoc>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    refresh_token_enc: { type: String, required: true },
    email_address: { type: String, default: null },
    scope: { type: String, required: true },
  },
  { timestamps: true, collection: "gmail_tokens" },
);

const GmailTokenModel: Model<GmailTokenDoc> =
  (mongoose.models.GmailToken as Model<GmailTokenDoc> | undefined) ??
  mongoose.model<GmailTokenDoc>("GmailToken", gmailTokenSchema);

export interface GmailConnection {
  emailAddress: string | null;
  scope: string;
  connectedAt: Date;
}

export async function getGmailConnection(
  userId: string,
): Promise<GmailConnection | null> {
  await connectMongo();
  const doc = await GmailTokenModel.findOne({ user_id: userId })
    .lean<GmailTokenDoc>()
    .exec();
  if (!doc) return null;
  return {
    emailAddress: doc.email_address,
    scope: doc.scope,
    connectedAt: doc.createdAt,
  };
}

export async function saveGmailToken(
  userId: string,
  refreshToken: string,
  emailAddress: string | null,
  scope: string,
): Promise<void> {
  await connectMongo();
  await GmailTokenModel.findOneAndUpdate(
    { user_id: new mongoose.Types.ObjectId(userId) },
    {
      refresh_token_enc: encryptField(refreshToken, userId),
      email_address: emailAddress,
      scope,
    },
    { upsert: true },
  ).exec();
}

/** Decrypt the stored refresh token (null when disconnected/undecryptable). */
export async function getRefreshToken(userId: string): Promise<string | null> {
  await connectMongo();
  const doc = await GmailTokenModel.findOne({ user_id: userId })
    .lean<GmailTokenDoc>()
    .exec();
  if (!doc) return null;
  return decryptField(doc.refresh_token_enc, userId);
}

export async function deleteGmailConnection(userId: string): Promise<void> {
  await connectMongo();
  await GmailTokenModel.deleteOne({ user_id: userId }).exec();
}
