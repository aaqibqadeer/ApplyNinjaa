import type { Metadata } from "next";

import { LegalPage } from "@/components/shared/LegalPage";
import { APP_NAME } from "@/config/brand";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="July 28, 2026">
      <p>
        This policy explains what {APP_NAME} collects, why, and what happens
        to it. The short version: your data exists to fill job applications
        for you, we encrypt the sensitive parts, we don&apos;t sell it, and
        you can delete it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — email, name, password hash (or your
          Google/LinkedIn identity), plan and billing status.
        </li>
        <li>
          <strong>Profile data</strong> — the structured information parsed
          from your resume (contact details, work history, education, skills,
          links, work-authorization and job preferences), plus any edits you
          make. <strong>The resume file itself is discarded immediately after
          parsing</strong> — we store only the structured data you review and
          save.
        </li>
        <li>
          <strong>Application data</strong> — jobs you track (company, role,
          URL, status, notes) and the AI evaluations you request (filter
          verdicts, fit scores).
        </li>
        <li>
          <strong>Usage data</strong> — counts of AI actions (for plan
          limits), timestamps, and coarse technical logs.
        </li>
      </ul>

      <h2>EEO / demographic data (optional, encrypted)</h2>
      <p>
        Many US job applications include voluntary self-identification
        questions (gender, race/ethnicity, veteran status, disability
        status). {APP_NAME} stores these answers <strong>only if you
        explicitly opt in</strong> via the consent checkbox in your profile —
        it is never pre-checked and never required. If you consent, the
        answers are protected with <strong>field-level encryption</strong>{" "}
        (AES-256-GCM with a key held outside the database) on top of
        database-level protections, are used solely to fill those questions
        in applications you initiate, and can be cleared at any time by
        unchecking consent. Withholding them never affects your ability to
        use {APP_NAME}.
      </p>

      <h2>Gmail data (optional, read-only)</h2>
      <p>
        The Gmail scan feature is a separate, optional permission requested
        independently of login. If you connect Gmail, we request{" "}
        <strong>read-only</strong> access, and scans run{" "}
        <strong>only when you click &ldquo;Scan Now&rdquo;</strong> — there is
        no background or scheduled scanning. We read message headers and
        snippets in the date range you choose to classify job-related emails,
        and we propose status updates that <strong>you approve or dismiss
        individually</strong>; nothing is written without your approval.
      </p>
      <p>
        {APP_NAME}&apos;s use and transfer of information received from
        Google APIs adheres to the{" "}
        <a
          className="underline underline-offset-4"
          href="https://developers.google.com/terms/api-services-user-data-policy"
          rel="noreferrer"
          target="_blank"
        >
          Google API Services User Data Policy
        </a>
        , including the <strong>Limited Use</strong> requirements: Gmail data
        is used only to provide the email-scanning feature you requested,
        is never used for advertising, is never sold, and is never read by
        humans except with your explicit consent, for security, or as
        required by law. Your Gmail refresh token is stored encrypted and is
        deleted when you disconnect.
      </p>

      <h2>AI processing</h2>
      <p>
        Resume parsing, job screening, fit scoring, form-field mapping, and
        email classification are performed by an AI model provider (DeepSeek)
        via our backend. We send only the data needed for the specific action
        you triggered (e.g. your profile and the job posting text). EEO
        answers are <strong>never</strong> included in fit-scoring or
        screening prompts.
      </p>

      <h2>Payments</h2>
      <p>
        Payments are processed by Stripe. We never see or store your card
        number; we store your Stripe customer/subscription identifiers and
        billing status.
      </p>

      <h2>Retention &amp; deletion</h2>
      <p>
        Delete your account from Settings (or by contacting support). Your
        account enters a <strong>30-day recoverable window</strong>, after
        which personal data — profiles (including any EEO answers), tracked
        applications, Gmail connection, and account identity — is
        permanently deleted. Anonymized, aggregate usage statistics (e.g.
        counts of AI actions) may be retained indefinitely; they no longer
        identify you.
      </p>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We don&apos;t sell your personal data.</li>
        <li>We don&apos;t use Gmail data for anything but the scans you run.</li>
        <li>We don&apos;t apply to jobs autonomously — every action is user-initiated.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Privacy questions or data requests: contact support via your account
        or the address published on our site.
      </p>
    </LegalPage>
  );
}
