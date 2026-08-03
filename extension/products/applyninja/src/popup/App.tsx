import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  API_ORIGIN,
  ApiRequestError,
  getToken,
  SignInRequiredError,
} from "../../../../shared/api";
import type {
  AnalyzeJobResponse,
  MapFieldsResponse,
  ProfileFillData,
  ProfileSummary,
  TrackedApplication,
  Usage,
  UsageResponse,
} from "../../../../shared/types";
import { collectPageData, fillFields } from "../lib/dom-actions";
import type { CollectedField, CollectedPage } from "../lib/dom-actions";
import { quickFill } from "../lib/quick-fill";

type Screen =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "no-page"; reason: string }
  | { kind: "ready" };

interface ReviewField {
  label: string;
  filled: boolean;
}

/** Enough page text to be worth spending an AI action on. */
const MIN_JOB_TEXT = 40;

const RECENT_APPS_KEY = "recent-apps";
const RECENT_APPS_SHOWN = 5;

function analysisKey(url: string, profileId: string | null): string {
  return `analysis:${url}:${profileId ?? ""}`;
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [page, setPage] = useState<CollectedPage | null>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeJobResponse | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [recent, setRecent] = useState<TrackedApplication[]>([]);
  const [showRetrack, setShowRetrack] = useState(false);
  const [review, setReview] = useState<ReviewField[]>([]);
  const [busy, setBusy] = useState<
    null | "analyze" | "quick" | "ai" | "track" | "retrack"
  >(null);
  const [tracked, setTracked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capBlocked, setCapBlocked] = useState(false);

  const domain = useMemo(() => {
    try {
      return tabUrl ? new URL(tabUrl).hostname : null;
    } catch {
      return null;
    }
  }, [tabUrl]);

  const atCap = usage ? usage.used >= usage.cap : false;
  const hasFields = (page?.fields.length ?? 0) > 0;
  const analyzable = (page?.jobText.trim().length ?? 0) >= MIN_JOB_TEXT;

  const handleApiError = useCallback((err: unknown): void => {
    if (err instanceof SignInRequiredError) {
      setScreen({ kind: "signed-out" });
      return;
    }
    if (err instanceof ApiRequestError) {
      if (err.body.code === "AI_CAP_REACHED") {
        setCapBlocked(true);
        if (err.body.used !== undefined && err.body.cap !== undefined) {
          setUsage({ used: err.body.used, cap: err.body.cap });
        }
        return;
      }
      setError(err.message);
      return;
    }
    setError(err instanceof Error ? err.message : "Something went wrong");
  }, []);

  /* -- Open: gather everything, spend nothing ----------------------------- */

  useEffect(() => {
    void (async () => {
      try {
        await getToken();
      } catch {
        setScreen({ kind: "signed-out" });
        return;
      }
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
        setScreen({ kind: "no-page", reason: "Open a job posting first." });
        return;
      }
      setTabId(tab.id);
      setTabUrl(tab.url);

      let collected: CollectedPage | null = null;
      try {
        const [injected] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: collectPageData,
        });
        collected = (injected?.result as CollectedPage | null) ?? null;
      } catch {
        setScreen({
          kind: "no-page",
          reason: "This page doesn't allow extensions.",
        });
        return;
      }
      // A page with no job text is still perfectly usable — it's typically the
      // application FORM, where Quick Fill and Track matter most. Only "Check
      // fit score" needs the text, and it disables itself below.
      setPage(collected);
      setScreen({ kind: "ready" });

      // Usage + profiles in parallel; neither costs an AI action.
      const [usageResult, profilesResult] = await Promise.allSettled([
        api<UsageResponse>("/api/usage"),
        api<{ profiles: ProfileSummary[] }>("/api/profiles"),
      ]);
      if (usageResult.status === "fulfilled") {
        setUsage({ used: usageResult.value.used, cap: usageResult.value.cap });
      }
      if (profilesResult.status === "rejected") {
        handleApiError(profilesResult.reason);
        return;
      }
      const list = profilesResult.value.profiles;
      setProfiles(list);
      const active = list.find((p) => p.isDefault)?.id ?? list[0]?.id ?? null;
      setProfileId(active);

      // Show a previous analysis for this page if we already paid for one.
      const key = analysisKey(tab.url, active);
      const cached = await chrome.storage.session.get(key);
      const hit = cached[key] as AnalyzeJobResponse | undefined;
      if (hit) setAnalysis(hit);

      const stored = await chrome.storage.session.get(RECENT_APPS_KEY);
      const cachedRecent = stored[RECENT_APPS_KEY] as
        | TrackedApplication[]
        | undefined;
      if (cachedRecent) setRecent(cachedRecent);
    })();
  }, [handleApiError]);

  /* -- Actions ------------------------------------------------------------ */

  /** The only popup action that spends an AI call on analysis. */
  async function onCheckFit(): Promise<void> {
    if (!page || !analyzable) return;
    setError(null);
    setNotice(null);
    setBusy("analyze");
    try {
      const result = await api<AnalyzeJobResponse>("/api/ai/analyze-job", {
        body: {
          jobText: page.jobText,
          url: tabUrl,
          domain,
          ...(profileId ? { profileId } : {}),
        },
      });
      setAnalysis(result);
      setProfileId(result.profileId);
      setUsage(result.usage);
      if (tabUrl) {
        await chrome.storage.session.set({
          [analysisKey(tabUrl, result.profileId)]: result,
        });
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(null);
    }
  }

  /** Offline matching — no backend AI call, so it survives the monthly cap. */
  async function onQuickFill(): Promise<void> {
    if (!page || !tabId || !profileId) return;
    setError(null);
    setNotice(null);
    setBusy("quick");
    try {
      const { profile } = await api<{ profile: ProfileFillData }>(
        `/api/profiles/${profileId}/fill-data`,
      );
      const { values, unmatched } = quickFill(page.fields, profile);
      if (values.length === 0) {
        setReview(unmatched.map((label) => ({ label, filled: false })));
        setNotice("Nothing matched — fill these by hand, or try AI Fill.");
        return;
      }
      const [injected] = await chrome.scripting.executeScript({
        target: { tabId },
        func: fillFields,
        args: [values],
      });
      const filledIds = new Set((injected?.result as string[] | null) ?? []);
      const missed = values
        .filter((v) => !filledIds.has(v.id))
        .map((v) => {
          const field = page.fields.find((f) => f.id === v.id);
          return field?.label ?? field?.name ?? `Field ${v.id}`;
        });
      setReview([
        ...missed.map((label) => ({ label, filled: false })),
        ...unmatched.map((label) => ({ label, filled: false })),
      ]);
      setNotice(
        `Filled ${filledIds.size} field${filledIds.size === 1 ? "" : "s"} — no AI action used.`,
      );
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(null);
    }
  }

  async function onAiFill(): Promise<void> {
    if (!page || !tabId) return;
    setError(null);
    setNotice(null);
    setBusy("ai");
    try {
      const result = await api<MapFieldsResponse>("/api/ai/map-fields", {
        body: {
          fields: page.fields,
          domain,
          ...(profileId ? { profileId } : {}),
        },
      });
      setUsage(result.usage);
      const values = result.mappings
        .filter((m): m is typeof m & { value: string } => Boolean(m.value))
        .map((m) => ({ id: m.fieldId, value: m.value }));
      const [injected] = await chrome.scripting.executeScript({
        target: { tabId },
        func: fillFields,
        args: [values],
      });
      const filledIds = new Set((injected?.result as string[] | null) ?? []);
      const fieldById = new Map<string, CollectedField>(
        page.fields.map((f) => [f.id, f]),
      );
      // Everything unfilled or low-confidence goes to the manual-review list —
      // never silently skipped.
      setReview(
        result.mappings
          .filter((m) => !filledIds.has(m.fieldId) || m.confidence === "low")
          .map((m) => {
            const field = fieldById.get(m.fieldId);
            return {
              label:
                field?.label ??
                field?.name ??
                field?.placeholder ??
                "Unnamed field",
              filled: filledIds.has(m.fieldId),
            };
          }),
      );
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(null);
    }
  }

  async function onTrack(): Promise<void> {
    if (!page) return;
    setError(null);
    setNotice(null);
    setBusy("track");
    try {
      // Fit data rides along only when it was already paid for.
      await api("/api/applications", {
        body: {
          company: analysis?.company ?? domain ?? "Unknown",
          roleTitle: analysis?.roleTitle ?? page.title.slice(0, 200),
          url: tabUrl,
          domain,
          status: "Applied",
          profileId: profileId ?? undefined,
          fitScore: analysis?.fitScore ?? null,
          fitReasoning: analysis?.fitReasoning ?? null,
          filterResults: analysis?.filterResults ?? [],
        },
      });
      setTracked(true);
      setNotice("Tracked.");
      await refreshRecent();
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(null);
    }
  }

  async function refreshRecent(): Promise<TrackedApplication[]> {
    try {
      const data = await api<{ applications: TrackedApplication[] }>(
        "/api/applications",
      );
      const top = data.applications.slice(0, RECENT_APPS_SHOWN);
      setRecent(top);
      await chrome.storage.session.set({ [RECENT_APPS_KEY]: top });
      return top;
    } catch {
      return [];
    }
  }

  async function onOpenRetrack(): Promise<void> {
    setError(null);
    setNotice(null);
    setShowRetrack(true);
    if (recent.length === 0) await refreshRecent();
  }

  async function onRetrack(applicationId: string): Promise<void> {
    if (!tabUrl) return;
    setError(null);
    setBusy("retrack");
    try {
      await api(`/api/applications/${applicationId}/retrack`, {
        body: { url: tabUrl },
      });
      setShowRetrack(false);
      setNotice("Added this page to that application.");
    } catch (err) {
      handleApiError(err);
    } finally {
      setBusy(null);
    }
  }

  /** Clear the paid-for analysis for this page so a re-check starts clean. */
  async function onReset(): Promise<void> {
    setAnalysis(null);
    setReview([]);
    setNotice(null);
    setError(null);
    setTracked(false);
    if (!tabUrl) return;
    const all = await chrome.storage.session.get(null);
    const keys = Object.keys(all).filter((k) =>
      k.startsWith(`analysis:${tabUrl}:`),
    );
    if (keys.length > 0) await chrome.storage.session.remove(keys);
  }

  function openDashboard(path = "/dashboard"): void {
    void chrome.tabs.create({ url: `${API_ORIGIN}${path}` });
  }

  /* -- Screens ------------------------------------------------------------ */

  if (screen.kind === "loading") {
    return (
      <Shell>
        <p className="text-muted-foreground py-8 text-center text-sm">
          Loading…
        </p>
      </Shell>
    );
  }

  if (screen.kind === "signed-out") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm">Sign in to use ApplyNinjaa.</p>
          <button
            className="btn-primary"
            onClick={() => openDashboard("/login")}
          >
            Sign in
          </button>
        </div>
      </Shell>
    );
  }

  if (screen.kind === "no-page") {
    return (
      <Shell>
        <p className="text-muted-foreground py-8 text-center text-sm">
          {screen.reason}
        </p>
      </Shell>
    );
  }

  const aiDisabled = capBlocked || atCap;

  return (
    <Shell usage={usage}>
      {profiles.length > 1 && (
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground shrink-0">Profile</span>
          <select
            className="border-input bg-card w-full rounded-md border px-2 py-1.5 text-sm"
            value={profileId ?? ""}
            onChange={(e) => {
              const next = e.target.value || null;
              setProfileId(next);
              // Analysis is per profile — don't show one profile's verdicts
              // under another's name.
              setAnalysis(null);
            }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {aiDisabled && (
        <div className="border-destructive/40 bg-destructive/10 rounded-lg border p-3 text-sm">
          <p className="font-medium">Monthly AI limit reached</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Quick Fill, Track and Re-track still work — they never use AI
            actions. Upgrade to re-enable fit scores and AI Fill.
          </p>
          <button
            className="btn-primary mt-2 w-full"
            onClick={() => openDashboard("/settings/billing")}
          >
            Upgrade
          </button>
        </div>
      )}

      {analysis && (
        <>
          <div className="bg-card border-border rounded-lg border p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-xs">Fit score</span>
              <span
                className={`text-2xl font-semibold ${
                  analysis.fitScore >= 70
                    ? "text-success"
                    : analysis.fitScore >= 40
                      ? "text-foreground"
                      : "text-destructive"
                }`}
              >
                {analysis.fitScore}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {analysis.fitReasoning}
            </p>
          </div>

          {analysis.filterResults.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {analysis.filterResults.map((f) => (
                <li
                  key={f.filterId}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate">{f.label}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${
                      f.verdict === "Yes"
                        ? "bg-success/15 text-success"
                        : f.verdict === "No"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {f.verdict}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
      {notice && !error && (
        <p className="text-muted-foreground text-xs">{notice}</p>
      )}

      {showRetrack ? (
        <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-xs font-medium">
            Attach this page to an application
          </p>
          {recent.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Nothing tracked yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {recent.map((app) => (
                <li key={app.id}>
                  <button
                    className="hover:bg-muted w-full rounded-md px-2 py-1.5 text-left text-xs"
                    disabled={busy === "retrack"}
                    onClick={() => void onRetrack(app.id)}
                  >
                    <span className="font-medium">{app.roleTitle}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {app.company}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="btn-secondary"
            onClick={() => setShowRetrack(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            className="btn-primary"
            disabled={busy !== null || aiDisabled || !analyzable}
            title={
              analyzable ? undefined : "Not enough job text on this page"
            }
            onClick={() => void onCheckFit()}
          >
            {busy === "analyze"
              ? "Checking…"
              : analysis
                ? "Check fit score again (1 AI action)"
                : "Check fit score (1 AI action)"}
          </button>

          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1"
              disabled={busy !== null || !hasFields || !profileId}
              title={hasFields ? undefined : "No form fields on this page"}
              onClick={() => void onQuickFill()}
            >
              {busy === "quick" ? "Filling…" : "Quick Fill"}
            </button>
            <button
              className="btn-secondary flex-1"
              disabled={busy !== null || aiDisabled || !hasFields}
              title={hasFields ? undefined : "No form fields on this page"}
              onClick={() => void onAiFill()}
            >
              {busy === "ai" ? "Filling…" : "AI Fill (1)"}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1"
              disabled={busy !== null || tracked}
              onClick={() => void onTrack()}
            >
              {tracked
                ? "Tracked ✓"
                : busy === "track"
                  ? "Tracking…"
                  : "Track"}
            </button>
            <button
              className="btn-secondary flex-1"
              disabled={busy !== null}
              onClick={() => void onOpenRetrack()}
            >
              Re-track
            </button>
          </div>

          <button
            className="text-muted-foreground hover:text-foreground text-xs underline"
            disabled={busy !== null}
            onClick={() => void onReset()}
          >
            Reset this page
          </button>
        </div>
      )}

      {review.length > 0 && (
        <div className="border-border rounded-lg border p-3">
          <p className="text-xs font-medium">Review these fields manually</p>
          <ul className="text-muted-foreground mt-1 flex flex-col gap-0.5 text-xs">
            {review.map((f, i) => (
              <li key={i}>
                {f.filled ? "◐" : "○"} {f.label}
                {f.filled ? " (low confidence)" : " (not filled)"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
}

function Shell({
  children,
  usage,
}: {
  children: React.ReactNode;
  usage?: Usage | null;
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <span className="text-sm font-semibold">ApplyNinjaa</span>
        {usage ? (
          <span className="text-muted-foreground text-xs">
            {usage.used}/{usage.cap} AI actions
          </span>
        ) : null}
      </header>
      {children}
    </div>
  );
}
