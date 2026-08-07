import type { Metadata } from "next";

import { LegalPage } from "@/components/shared/LegalPage";
import { APP_NAME } from "@/config/brand";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="July 28, 2026">
      <p>
        These terms govern your use of {APP_NAME}. By creating an account you
        agree to them.
      </p>

      <h2>What {APP_NAME} is</h2>
      <p>
        {APP_NAME} is an assistant for your job search: it parses your resume
        into a reusable profile, screens job postings against filters you
        choose, scores fit, fills application forms, and tracks your
        applications.
      </p>

      <h2>User-initiated actions</h2>
      <p>
        <strong>
          Every autofill, analysis, scan, and tracking action in {APP_NAME}{" "}
          is initiated by you.
        </strong>{" "}
        The product does not autonomously crawl job boards, submit
        applications, or act on your behalf without a direct action from you
        (clicking Analyze, Autofill, Track, or Scan Now). You review and
        submit every application yourself; you are responsible for the
        accuracy of what you submit. {APP_NAME} is a form-filling and
        organization tool, not an agent that applies for you.
      </p>

      <h2>Accounts &amp; acceptable use</h2>
      <ul>
        <li>You must provide accurate information and keep your account secure.</li>
        <li>One free trial per verified email address.</li>
        <li>
          Don&apos;t use {APP_NAME} to submit false information, to violate a
          job site&apos;s terms, or to abuse the AI features (automated
          scripting against our API, quota circumvention, resale).
        </li>
        <li>
          We may suspend accounts that violate these terms; suspension blocks
          access but preserves your data.
        </li>
      </ul>

      <h2>Plans, trials &amp; billing</h2>
      <ul>
        <li>
          Paid plans are billed monthly or annually via Stripe. Prices and
          AI-action allowances are shown at checkout and on the pricing page.
        </li>
        <li>
          New accounts get a free trial (no card required). When it ends,
          the account automatically moves to the Free plan unless you
          subscribe.
        </li>
        <li>
          When you reach your plan&apos;s monthly AI-action limit, AI
          features pause until you upgrade or the month resets — tracked data
          is never held back.
        </li>
        <li>Cancel anytime from the billing portal; access continues to the end of the paid period.</li>
      </ul>

      <h2>AI output</h2>
      <p>
        Filter verdicts, fit scores, and autofilled values are AI-generated
        assistance, not guarantees. Review them — you can edit anything,
        including scores. {APP_NAME} is not responsible for hiring outcomes.
      </p>

      <h2>Disclaimers</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; without warranties. To
        the maximum extent permitted by law, our liability is limited to the
        amount you paid in the twelve months before a claim. We are not
        affiliated with the job sites you use {APP_NAME} on.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms; material changes will be announced by
        email or in-app. Continued use after changes means acceptance.
      </p>
    </LegalPage>
  );
}
