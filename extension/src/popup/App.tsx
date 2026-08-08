import { useCallback, useEffect, useMemo, useState } from "react";

import {
  api,
  API_ORIGIN,
  ApiRequestError,
  clearToken,
  getToken,
  SignInRequiredError,
} from "../lib/api";
import { loadAttachments, matchDocuments } from "../lib/documents";
import { attachFiles, collectPageData, fillFields } from "../lib/dom-actions";
import type { CollectedField, CollectedPage } from "../lib/dom-actions";
import { matchExclusions } from "../lib/exclusions";
import { quickFill } from "../lib/quick-fill";
import type {
  AnalyzeJobResponse,
  ExclusionRule,
  MapFieldsResponse,
  ProfileFillData,
  ProfileSummary,
  RetrackedApplication,
  TrackedApplication,
  Usage,
  UsageResponse,
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

/** What an application points at after a Re-track, for the confirmation list. */
interface AttachedSummary {
  roleTitle: string;
  company: string;
  links: Array<{ url: string; primary: boolean }>;
}

/** Enough page text to be worth spending an AI action on. */
const MIN_JOB_TEXT = 40;

const RECENT_APPS_KEY = "recent-apps";
const RECENT_APPS_SHOWN = 5;
/** Enough to know why it fired; the rest collapse into a "+N more". */
const EXCLUSIONS_SHOWN = 2;

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
  const [exclusions, setExclusions] = useState<ExclusionRule[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [recent, setRecent] = useState<TrackedApplication[]>([]);
  const [showRetrack, setShowRetrack] = useState(false);
  const [attached, setAttached] = useState<AttachedSummary | null>(null);
  const [review, setReview] = useState<ReviewField[]>([]);
  const [busy, setBusy] = useState<
    null | "analyze" | "quick" | "ai" | "track" | "retrack" | "signin"
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

  // Matched in the popup, not on the server: an exclusion has to be able to
  // warn on a page the user hasn't spent an AI action on. `analysis.company`
  // is used when it's already been paid for, otherwise the domain carries it.
  const exclusionHits = useMemo(
    () =>
      page
        ? matchExclusions(
            {
              company: analysis?.company ?? null,
              roleTitle: analysis?.roleTitle ?? page.title,
              jobText: page.jobText,
              domain,
            },
            exclusions,
          )
        : [],
    [page, analysis, domain, exclusions],
  );

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

      // Usage + profiles + exclusions in parallel; none costs an AI action.
      const [usageResult, profilesResult, exclusionsResult] =
        await Promise.allSettled([
          api<UsageResponse>("/api/usage"),
          api<{ profiles: ProfileSummary[] }>("/api/profiles"),
          api<{ exclusions: ExclusionRule[] }>("/api/exclusions"),
        ]);
      if (usageResult.status === "fulfilled") {
        setUsage({ used: usageResult.value.used, cap: usageResult.value.cap });
      }
      if (exclusionsResult.status === "fulfilled") {
        setExclusions(exclusionsResult.value.exclusions);
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

      // Chrome builds context menus ahead of time, so the manual-fill submenu
      // only picks up a new profile or saved answer when we ask for a rebuild.
      void chrome.runtime.sendMessage({ type: "refresh-menu" }).catch(() => {});

      const stored = await chrome.storage.session.get(RECENT_APPS_KEY);
      const cachedRecent = stored[RECENT_APPS_KEY] as
        TrackedApplication[] | undefined;
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

  /**
   * Attach stored CV / cover letter to the page's file inputs. Costs no AI
   * action — it's a byte copy, not a decision. Returns how many landed.
   */
  async function attachDocuments(
    documents: ProfileFillData["documents"],
  ): Promise<number> {
    if (!page || !tabId || documents.length === 0) return 0;
    const pairs = matchDocuments(page.fields, documents);
    if (pairs.length === 0) return 0;
    try {
      const files = await loadAttachments(pairs);
      if (files.length === 0) return 0;
      const [injected] = await chrome.scripting.executeScript({
        target: { tabId },
        func: attachFiles,
        args: [files],
      });
      return ((injected?.result as string[] | null) ?? []).length;
    } catch {
      // Never fail a fill because a document couldn't be attached.
      return 0;
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
      const attachedCount = await attachDocuments(profile.documents);
      const { values, unmatched } = quickFill(page.fields, profile);
      if (values.length === 0) {
        setReview(unmatched.map((label) => ({ label, filled: false })));
        setNotice(
          attachedCount > 0
            ? `Attached ${attachedCount} file${attachedCount === 1 ? "" : "s"}; no text field matched — fill these by hand, or try AI Fill.`
            : "Nothing matched — fill these by hand, or try AI Fill.",
        );
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
        `Filled ${filledIds.size} field${filledIds.size === 1 ? "" : "s"}` +
          (attachedCount > 0
            ? ` and attached ${attachedCount} file${attachedCount === 1 ? "" : "s"}`
            : "") +
          " — no AI action used.",
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
      // Documents attach the same way here — the AI maps text fields, it has
      // nothing to say about a file input.
      let attachedCount = 0;
      if (profileId) {
        const { profile } = await api<{ profile: ProfileFillData }>(
          `/api/profiles/${profileId}/fill-data`,
        );
        attachedCount = await attachDocuments(profile.documents);
      }
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
      if (attachedCount > 0) {
        setNotice(
          `Attached ${attachedCount} file${attachedCount === 1 ? "" : "s"} from your profile.`,
        );
      }
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
          jobDetails: analysis?.jobDetails ?? null,
          // Recorded even though the user went ahead — the dashboard should be
          // able to show that this application was against their own rules.
          exclusionMatches: exclusionHits,
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
      const { application } = await api<{ application: RetrackedApplication }>(
        `/api/applications/${applicationId}/retrack`,
        { body: { url: tabUrl } },
      );
      setShowRetrack(false);
      setNotice(null);
      // Show what the application now points at: re-track is otherwise a
      // silent write, and "did that attach?" is the obvious next question.
      setAttached({
        roleTitle: application.roleTitle,
        company: application.company,
        links: [
          ...(application.url ? [{ url: application.url, primary: true }] : []),
          ...application.additionalLinks.map((link) => ({
            url: link.url,
            primary: false,
          })),
        ],
      });
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

  /**
   * Drop the stored token. The dashboard cookie is left alone on purpose —
   * signing the extension out shouldn't sign the user out of a tab they have
   * open; "Sign in" re-exchanges the cookie for a new token.
   */
  async function onSignOut(): Promise<void> {
    await clearToken();
    // Menu entries are built from profile data this token fetched.
    void chrome.runtime.sendMessage({ type: "refresh-menu" }).catch(() => {});
    setProfiles([]);
    setProfileId(null);
    setAnalysis(null);
    setExclusions([]);
    setUsage(null);
    setRecent([]);
    setError(null);
    setNotice(null);
    setScreen({ kind: "signed-out" });
  }

  /** Re-exchange the dashboard cookie after the user signed in elsewhere. */
  async function onRetrySignIn(): Promise<void> {
    setError(null);
    setBusy("signin");
    try {
      await getToken();
      // Simplest correct reload of every piece of open-time state.
      window.location.reload();
    } catch {
      setError("Still signed out — sign in on the dashboard, then retry.");
    } finally {
      setBusy(null);
    }
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
            className="btn-primary w-full"
            onClick={() => openDashboard("/login?next=/dashboard")}
          >
            Sign in
          </button>
          {/* The popup can't observe the sign-in happening in another tab, so
              this is how the user comes back without reopening it. */}
          <button
            className="btn-secondary w-full"
            onClick={() => void onRetrySignIn()}
          >
            {busy === "signin" ? "Checking…" : "I've signed in — retry"}
          </button>
          {error && (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          )}
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
  const tally = { Yes: 0, No: 0, Neutral: 0 };
  for (const f of analysis?.filterResults ?? []) tally[f.verdict] += 1;

  return (
    <Shell usage={usage} onSignOut={() => void onSignOut()}>
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

      {exclusionHits.length > 0 && (
        <div className="border-destructive/50 bg-destructive/10 rounded-lg border p-3">
          <p className="text-destructive text-sm font-medium">
            ⚠ On your exclusion list
          </p>
          <ul className="text-muted-foreground mt-1 flex flex-col gap-0.5 text-xs">
            {exclusionHits.slice(0, EXCLUSIONS_SHOWN).map((hit) => (
              <li key={`${hit.kind}:${hit.value}`}>
                {hit.kind === "company" ? "Company" : "Keyword"} “{hit.value}”
              </li>
            ))}
            {exclusionHits.length > EXCLUSIONS_SHOWN && (
              <li>+{exclusionHits.length - EXCLUSIONS_SHOWN} more</li>
            )}
          </ul>
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
            // Collapsed by default: the tally answers "anything wrong?" in one
            // line, and the popup stays short now that exclusions live above.
            <details className="border-border rounded-lg border px-3 py-2">
              <summary className="cursor-pointer text-xs">
                <span className="text-muted-foreground">Filters</span>{" "}
                <span className="text-success font-medium">✓{tally.Yes}</span>{" "}
                <span className="text-destructive font-medium">
                  ✗{tally.No}
                </span>{" "}
                <span className="text-muted-foreground font-medium">
                  ○{tally.Neutral}
                </span>
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5">
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
            </details>
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

      {attached && (
        <div className="border-border flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-xs font-medium">
            Attached to {attached.roleTitle} — {attached.company}
          </p>
          <ul className="flex flex-col gap-1">
            {attached.links.map((link) => (
              <li key={link.url} className="text-xs">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary block truncate hover:underline"
                  title={link.url}
                >
                  {link.url}
                </a>
                <span className="text-muted-foreground">
                  {link.primary ? "primary" : "re-tracked"}
                </span>
              </li>
            ))}
          </ul>
          <button className="btn-secondary" onClick={() => setAttached(null)}>
            Done
          </button>
        </div>
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
            title={analyzable ? undefined : "Not enough job text on this page"}
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
              {tracked ? "Tracked ✓" : busy === "track" ? "Tracking…" : "Track"}
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
  onSignOut,
}: {
  children: React.ReactNode;
  usage?: Usage | null;
  onSignOut?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">ApplyNinjaa</span>
        <div className="flex items-center gap-2">
          {usage ? (
            <span className="text-muted-foreground text-xs">
              {usage.used}/{usage.cap} AI actions
            </span>
          ) : null}
          {onSignOut && (
            <button
              className="text-muted-foreground hover:text-foreground text-xs underline"
              onClick={onSignOut}
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
