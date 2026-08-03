/**
 * Command protocol between the popup and the service worker.
 *
 * The popup is stateless UI: it sends commands and renders the CaptureStatus
 * the worker reports back. The worker owns all capture state and the queue, so
 * closing the popup never interrupts a run.
 */

import type { AutomationTier } from "../scrapers/types";

import type { LeadSourceType, QueueCounts } from "./queue";

export type Pacing = "slow" | "normal" | "fast";
export type CaptureMode = "fast" | "deep";

/** Live snapshot the worker maintains and the popup renders. */
export interface CaptureStatus {
  running: boolean;
  /** The tab the worker is (or would be) capturing from. */
  tabId: number | null;
  tabUrl: string | null;
  sourceType: LeadSourceType;
  automationTier: AutomationTier;
  supportsDeep: boolean;
  /** True on tier-d sites: auto capture is refused, only manual is allowed. */
  tierBlocked: boolean;
  mode: CaptureMode;
  pacing: Pacing;
  cap: number;
  campaignId: string | null;
  sessionId: string | null;
  /** Records captured in the current/most-recent run. */
  captured: number;
  reachedCap: boolean;
  reachedEnd: boolean;
  lastError: string | null;
  counts: QueueCounts;
}

export type PopupCommand =
  | { cmd: "GET_STATUS" }
  | {
      cmd: "START";
      campaignId: string;
      mode: CaptureMode;
      pacing: Pacing;
      cap: number;
    }
  | { cmd: "STOP" }
  | { cmd: "KEEP_GOING"; additional: number }
  | { cmd: "MANUAL_CAPTURE"; campaignId: string }
  | { cmd: "SYNC_NOW" };

export interface CommandResult {
  ok: boolean;
  error?: string;
  status: CaptureStatus;
}
