import type { Metadata } from "next";

import { LegalPage } from "@/components/shared/LegalPage";
import { APP_NAME } from "@/config/brand";

export const metadata: Metadata = { title: "Cookie Policy" };

export default function CookiePolicyPage() {
  return (
    <LegalPage title="Cookie Policy" updated="July 28, 2026">
      <p>
        {APP_NAME} uses a small number of cookies. Here is every one of them
        and what it does.
      </p>

      <h2>Essential cookies (always on)</h2>
      <ul>
        <li>
          <strong>Session cookie</strong> — keeps you signed in (httpOnly,
          7-day lifetime).
        </li>
        <li>
          <strong>OAuth state cookies</strong> — short-lived CSRF protection
          during Google/LinkedIn sign-in and the Gmail connect flow (10
          minutes).
        </li>
        <li>
          <strong>Cookie-consent cookie</strong> — remembers your
          accept/reject choice from the banner (180 days).
        </li>
      </ul>
      <p>
        These are required for the product to function and can&apos;t be
        switched off; blocking them in your browser will break sign-in.
      </p>

      <h2>Non-essential cookies</h2>
      <p>
        Analytics and marketing cookies are <strong>not set unless you
        accept</strong> them via the consent banner. If you reject, only the
        essential cookies above are used. (v1 of {APP_NAME} ships no
        analytics cookies at all; this section governs any added later.)
      </p>

      <h2>Managing your choice</h2>
      <p>
        You can clear the consent cookie in your browser at any time to see
        the banner again, or manage cookies through your browser settings.
      </p>
    </LegalPage>
  );
}
