import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  API_ORIGIN,
  ApiRequestError,
  getToken,
  SignInRequiredError,
} from "../lib/api";
import { collectPageData, fillFields } from "../lib/dom-actions";
import type { CollectedField, CollectedPage } from "../lib/dom-actions";
import type {
  AnalyzeJobResponse,
  MapFieldsResponse,
  ProfileSummary,
  Usage,
} from "../lib/types";

type Screen =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "no-page"; reason: string }
  | { kind: "ready" };

interface ReviewField {
  label: string;
  filled: boolean;
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [page, setPage] = useState<CollectedPage | null>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeJobResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [filling, setFilling] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(false);
  const [review, setReview] = useState<ReviewField[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capBlocked, setCapBlocked] = useState(false);

  const domain = useMemo(() => {
    try {
      return tabUrl ? new URL(tabUrl).hostname : null;
    } catch {
      return null;
    }
  }, [tabUrl]);

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

  const runAnalysis = useCallback(
    async (
      collected: CollectedPage,
      url: string | null,
      chosenProfileId: string | null,
      bypassCache: boolean,
    ): Promise<void> => {
      setError(null);
      setAnalyzing(true);
      try {
        const cacheKey = url ? `analysis:${url}:${chosenProfileId ?? ""}` : null;
        if (cacheKey && !bypassCache) {
          const cached = await chrome.storage.session.get(cacheKey);
          const hit = cached[cacheKey] as AnalyzeJobResponse | undefined;
          if (hit) {
            setAnalysis(hit);
            setProfileId(hit.profileId);
            setUsage(hit.usage);
            return;
          }
        }
        const result = await api<AnalyzeJobResponse>("/api/ai/analyze-job", {
          body: {
            jobText: collected.jobText,
            url,
            domain: url ? new URL(url).hostname : null,
            ...(chosenProfileId ? { profileId: chosenProfileId } : {}),
          },
        });
        setAnalysis(result);
        setProfileId(result.profileId);
        setUsage(result.usage);
        if (cacheKey) {
          await chrome.storage.session.set({ [cacheKey]: result });
        }
      } catch (err) {
        handleApiError(err);
      } finally {
        setAnalyzing(false);
      }
    },
    [handleApiError],
  );

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
      if (!collected || collected.jobText.trim().length < 40) {
        setScreen({
          kind: "no-page",
          reason: "Not enough text on this page to analyze.",
        });
        return;
      }
      setPage(collected);
      setScreen({ kind: "ready" });

      try {
        const data = await api<{ profiles: ProfileSummary[] }>("/api/profiles");
        setProfiles(data.profiles);
      } catch (err) {
        handleApiError(err);
        return;
      }
      void runAnalysis(collected, tab.url, null, false);
    })();
  }, [handleApiError, runAnalysis]);

  async function onAutofill(): Promise<void> {
    if (!page || !tabId) return;
    setError(null);
    setFilling(true);
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
        .filter((m): m is { fieldId: string; value: string; confidence: "high" | "low" } =>
          Boolean(m.value),
        )
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
      const needsReview: ReviewField[] = result.mappings
        .filter((m) => !filledIds.has(m.fieldId) || m.confidence === "low")
        .map((m) => {
          const field = fieldById.get(m.fieldId);
          return {
            label:
              field?.label ?? field?.name ?? field?.placeholder ?? "Unnamed field",
            filled: filledIds.has(m.fieldId),
          };
        });
      setReview(needsReview);
    } catch (err) {
      handleApiError(err);
    } finally {
      setFilling(false);
    }
  }

  async function onTrack(): Promise<void> {
    if (!page) return;
    setError(null);
    setTracking(true);
    try {
      await api("/api/applications", {
        body: {
          company: analysis?.company ?? domain ?? "Unknown",
          roleTitle: analysis?.roleTitle ?? page.title.slice(0, 200),
          url: tabUrl,
          domain,
          // Tracking from the extension always starts at "Applied".
          status: "Applied",
          profileId: profileId ?? undefined,
          fitScore: analysis?.fitScore ?? null,
          fitReasoning: analysis?.fitReasoning ?? null,
          filterResults: analysis?.filterResults ?? [],
        },
      });
      setTracked(true);
    } catch (err) {
      handleApiError(err);
    } finally {
      setTracking(false);
    }
  }

  function openDashboard(path = "/dashboard"): void {
    void chrome.tabs.create({ url: `${API_ORIGIN}${path}` });
  }

  /* -- Screens ------------------------------------------------------------- */

  if (screen.kind === "loading") {
    return <Shell><p className="text-muted-foreground py-8 text-center text-sm">Loading…</p></Shell>;
  }

  if (screen.kind === "signed-out") {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm">Sign in to use ApplyNinjaa.</p>
          <button className="btn-primary" onClick={() => openDashboard("/login")}>
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
              if (page) void runAnalysis(page, tabUrl, next, true);
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

      {capBlocked ? (
        <div className="border-destructive/40 bg-destructive/10 rounded-lg border p-3 text-sm">
          <p className="font-medium">Monthly AI limit reached</p>
          <p className="text-muted-foreground mt-1 text-xs">
            You&apos;ve used all your AI actions this month. Upgrade to keep
            analyzing and autofilling.
          </p>
          <button
            className="btn-primary mt-2 w-full"
            onClick={() => openDashboard("/settings/billing")}
          >
            Upgrade
          </button>
        </div>
      ) : analyzing ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Analyzing this job…
        </p>
      ) : analysis ? (
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
      ) : null}

      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}

      {!capBlocked && (
        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            disabled={filling || !page?.fields.length}
            onClick={() => void onAutofill()}
          >
            {filling
              ? "Filling…"
              : page?.fields.length
                ? "Autofill"
                : "No form here"}
          </button>
          <button
            className="btn-secondary flex-1"
            disabled={tracking || tracked}
            onClick={() => void onTrack()}
          >
            {tracked ? "Tracked ✓" : tracking ? "Tracking…" : "Track"}
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
