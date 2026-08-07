/**
 * lib/gmail/scan.ts — the manual "Scan Now" flow (product spec §7).
 *
 * Synchronous within the route (no queue): hard-capped at 50 messages per
 * scan, metadata fetched with bounded concurrency, classified by the AI in
 * batches. Proposals are persisted on the scan document with decision=null —
 * NOTHING touches an application until the user explicitly approves a
 * proposal. One scan consumes one AI action from the user's cap (enforced by
 * the route before calling this).
 */

import { classifyEmails } from "@/lib/ai/tasks";
import type { Session } from "@/lib/auth/types";
import {
  db,
  GMAIL_SCAN_STATUSES,
  type Application,
  type ApplicationStatus,
  type EmailClassification,
  type GmailScan,
  type GmailScanProposal,
} from "@/lib/db";
import { recordAiCall } from "@/lib/usage/ai-usage";

import { getAccessToken, getMessageMeta, listMessageIds } from "./client";
import { getRefreshToken } from "./store";

const MAX_MESSAGES_PER_SCAN = 50;
const FETCH_CONCURRENCY = 5;
const CLASSIFY_BATCH = 10;

const STATUS_BY_CLASSIFICATION: Partial<
  Record<EmailClassification, ApplicationStatus>
> = {
  interview: "Interview",
  rejection: "Rejected",
  offer: "Offer",
  assessment: "OA/Assessment",
};

function matchApplication(
  applications: Application[],
  company: string | null,
): Application | null {
  if (!company) return null;
  const needle = company.trim().toLowerCase();
  if (!needle) return null;
  return (
    applications.find((app) => {
      const hay = app.company.trim().toLowerCase();
      return hay.includes(needle) || needle.includes(hay);
    }) ?? null
  );
}

export async function runScan(
  session: Session,
  range: { from: Date; to: Date },
): Promise<GmailScan> {
  if (!session.organizationId) throw new Error("No active organization");

  const refreshToken = await getRefreshToken(session.user.id);
  if (!refreshToken) {
    throw new Error("Gmail is not connected — connect it in settings first");
  }

  // Create the scan row first so a timeout still leaves a diagnosable record.
  let scan = await db.createGmailScan({
    organizationId: session.organizationId,
    userId: session.user.id,
    rangeFrom: range.from,
    rangeTo: range.to,
    status: GMAIL_SCAN_STATUSES.running,
    error: null,
    proposals: [],
  });

  try {
    const accessToken = await getAccessToken(refreshToken);
    const ids = await listMessageIds(accessToken, range, MAX_MESSAGES_PER_SCAN);

    const metas = [];
    for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
      const batch = ids.slice(i, i + FETCH_CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map((id) => getMessageMeta(accessToken, id)),
      );
      for (const result of settled) {
        if (result.status === "fulfilled") metas.push(result.value);
      }
    }

    const applications = await db.listApplicationsForUser(session.user.id);
    const proposals: GmailScanProposal[] = [];
    let model: string | null = null;

    for (let i = 0; i < metas.length; i += CLASSIFY_BATCH) {
      const batch = metas.slice(i, i + CLASSIFY_BATCH);
      const { data, result } = await classifyEmails(
        batch.map((m) => ({
          id: m.id,
          from: m.from,
          subject: m.subject,
          snippet: m.snippet,
        })),
      );
      model = result.model;
      const metaById = new Map(batch.map((m) => [m.id, m]));
      for (const entry of data.results) {
        const meta = metaById.get(entry.emailId);
        if (!meta || entry.classification === "other") continue;
        const matched = matchApplication(applications, entry.company);
        proposals.push({
          messageId: meta.id,
          from: meta.from,
          subject: meta.subject,
          receivedAt: meta.receivedAt,
          excerpt: meta.snippet.slice(0, 300),
          classification: entry.classification,
          matchedApplicationId: matched?.id ?? null,
          suggestedStatus: matched
            ? (STATUS_BY_CLASSIFICATION[entry.classification] ?? null)
            : null,
          decision: null,
        });
      }
    }

    // The whole scan is one billable AI action (route enforced the quota).
    await recordAiCall({
      userId: session.user.id,
      organizationId: session.organizationId,
      kind: "gmail_classify",
      model,
    });

    scan = await db.updateGmailScan(scan.id, {
      status: GMAIL_SCAN_STATUSES.ready,
      proposals,
    });
    return scan;
  } catch (error) {
    await db.updateGmailScan(scan.id, {
      status: GMAIL_SCAN_STATUSES.failed,
      error: error instanceof Error ? error.message : "Scan failed",
    });
    throw error;
  }
}

/**
 * Apply the user's decision on one proposal. Approving writes the suggested
 * status to the matched application — the ONLY path from scan to tracker.
 */
export async function decideProposal(
  session: Session,
  scanId: string,
  messageId: string,
  decision: "approved" | "rejected",
): Promise<GmailScan> {
  const scan = await db.getGmailScanById(scanId);
  if (!scan || scan.userId !== session.user.id) {
    throw new Error("Scan not found");
  }
  const proposal = scan.proposals.find((p) => p.messageId === messageId);
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.decision) throw new Error("Already decided");

  if (
    decision === "approved" &&
    proposal.matchedApplicationId &&
    proposal.suggestedStatus
  ) {
    const application = await db.getApplicationById(
      proposal.matchedApplicationId,
    );
    if (application && application.userId === session.user.id) {
      await db.updateApplication(application.id, {
        status: proposal.suggestedStatus,
      });
    }
  }

  return db.updateGmailScan(scanId, {
    proposals: scan.proposals.map((p) =>
      p.messageId === messageId ? { ...p, decision } : p,
    ),
  });
}
