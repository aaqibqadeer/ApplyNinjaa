"use client";

import type { ApplicationRow } from "@/components/dashboard/ApplicationsTable";
import { Textarea } from "@/components/ui/textarea";

export interface ApplicationDetailsProps {
  row: ApplicationRow;
  onNotesChange: (notes: string) => void;
  onNotesCommit: (notes: string) => void;
}

const VERDICT_CLASS: Record<string, string> = {
  Yes: "bg-success/15 text-success",
  No: "bg-destructive/15 text-destructive",
  Neutral: "bg-muted text-muted-foreground",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate text-sm">{children}</dd>
    </div>
  );
}

/**
 * Everything about one application that doesn't fit a table cell: why the AI
 * scored it that way, what it read off the posting, every page attached to it
 * (including the ones added by Re-track), and the timestamps.
 *
 * Job details are only present when the user paid for an analysis on that
 * posting — a row tracked without one simply says so rather than showing a
 * grid of dashes.
 */
export function ApplicationDetails({
  row,
  onNotesChange,
  onNotesCommit,
}: ApplicationDetailsProps) {
  const details = row.jobDetails;
  const links = [
    ...(row.url
      ? [{ url: row.url, platform: row.platform, addedAt: null, primary: true }]
      : []),
    ...row.additionalLinks.map((link) => ({ ...link, primary: false })),
  ];

  return (
    <div className="bg-muted/30 flex flex-col gap-5 px-4 py-4">
      {row.exclusionMatches.length > 0 && (
        <div className="border-destructive/40 bg-destructive/10 rounded-md border p-3">
          <p className="text-destructive text-sm font-medium">
            Tracked despite your exclusions
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {row.exclusionMatches
              .map(
                (m) =>
                  `${m.kind === "company" ? "Company" : "Keyword"} “${m.value}”`,
              )
              .join(" · ")}
          </p>
        </div>
      )}

      <section>
        <h4 className="mb-1 text-xs font-semibold">Fit</h4>
        {row.fitScore === null && !row.fitReasoning ? (
          <p className="text-muted-foreground text-sm">
            No fit score — this was tracked without running an analysis.
          </p>
        ) : (
          <>
            <p className="text-sm">
              {row.fitReasoning ?? "No reasoning recorded."}
            </p>
            {row.analyzedAt && (
              <p className="text-muted-foreground mt-1 text-xs">
                Analyzed {formatDateTime(row.analyzedAt)}
              </p>
            )}
          </>
        )}
      </section>

      {row.filterResults.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold">Filter verdicts</h4>
          <ul className="flex flex-wrap gap-1.5">
            {row.filterResults.map((f, i) => (
              <li
                key={`${f.label}-${i}`}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  VERDICT_CLASS[f.verdict] ?? VERDICT_CLASS.Neutral
                }`}
              >
                {f.label}: {f.verdict}
              </li>
            ))}
          </ul>
        </section>
      )}

      {details && (
        <section>
          <h4 className="mb-2 text-xs font-semibold">From the posting</h4>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Location">{details.location ?? "Not stated"}</Field>
            <Field label="Arrangement">
              {details.workArrangement ?? "Not stated"}
            </Field>
            <Field label="Employment type">
              {details.employmentType ?? "Not stated"}
            </Field>
            <Field label="Seniority">{details.seniority ?? "Not stated"}</Field>
            <Field label="Salary">{details.salaryText ?? "Not stated"}</Field>
            <Field label="Sponsorship">
              {details.sponsorshipMentioned === "yes"
                ? "Sponsors"
                : details.sponsorshipMentioned === "no"
                  ? "Does not sponsor"
                  : "Not stated"}
            </Field>
            <Field label="Posted">{details.postedAt ?? "Not stated"}</Field>
          </dl>
          {details.requiredSkills.length > 0 && (
            <p className="text-muted-foreground mt-3 text-xs">
              <span className="font-medium">Required skills:</span>{" "}
              {details.requiredSkills.join(", ")}
            </p>
          )}
        </section>
      )}

      <section>
        <h4 className="mb-2 text-xs font-semibold">Links ({links.length})</h4>
        {links.length === 0 ? (
          <p className="text-muted-foreground text-sm">No URL saved.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <li key={link.url} className="flex items-baseline gap-2 text-xs">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary min-w-0 truncate hover:underline"
                >
                  {link.url}
                </a>
                <span className="text-muted-foreground shrink-0">
                  {link.primary ? "primary" : "re-tracked"}
                  {link.platform ? ` · ${link.platform}` : ""}
                  {!link.primary && link.addedAt
                    ? ` · ${formatDateTime(link.addedAt)}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold">Notes</h4>
          <Textarea
            rows={3}
            value={row.notes}
            placeholder="Recruiter name, referral, follow-up date…"
            onChange={(e) => onNotesChange(e.target.value)}
            onBlur={(e) => onNotesCommit(e.target.value)}
          />
        </div>
        <dl className="grid grid-cols-2 gap-3 self-start">
          <Field label="Applied">{formatDateTime(row.appliedAt)}</Field>
          <Field label="Tracked">{formatDateTime(row.createdAt)}</Field>
          <Field label="Last updated">{formatDateTime(row.updatedAt)}</Field>
          <Field label="Platform">{row.platform ?? "—"}</Field>
        </dl>
      </section>
    </div>
  );
}
