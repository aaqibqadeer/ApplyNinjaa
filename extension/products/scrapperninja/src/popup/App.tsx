/**
 * ScrapperNinja popup — STUB (P1).
 *
 * The full capture UI (campaign picker, Fast/Deep, Start/Stop, counters,
 * pacing, per-run cap, tier-d warning, manual capture) lands in Phase 2 of the
 * ScrapperNinja execution plan. This stub only proves the multi-product build
 * wiring: it renders and confirms the shared API client is reachable.
 */

import { useEffect, useState } from "react";

import { API_ORIGIN, getToken, SignInRequiredError } from "../../../../shared/api";

export function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await getToken();
        setSignedIn(true);
      } catch (error) {
        setSignedIn(error instanceof SignInRequiredError ? false : false);
      }
    })();
  }, []);

  return (
    <div className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <span className="text-sm font-semibold">ScrapperNinja</span>
      </header>
      {signedIn === null ? (
        <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
      ) : signedIn ? (
        <p className="text-muted-foreground text-sm">
          Capture UI arrives in Phase 2.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm">Sign in to the dashboard to continue.</p>
          <button
            className="btn-primary"
            onClick={() =>
              void chrome.tabs.create({ url: `${API_ORIGIN}/login` })
            }
          >
            Sign in
          </button>
        </div>
      )}
    </div>
  );
}
