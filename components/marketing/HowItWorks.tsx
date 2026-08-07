const STEPS = [
  {
    title: "Upload your resume once",
    body: "We parse it into a structured profile — every field editable, nothing re-typed again. The file itself is discarded after parsing.",
  },
  {
    title: "Open any job posting",
    body: "Click the extension icon. Every deal-breaker filter you set gets a Yes / No / Neutral badge, plus a 0-100 fit score with reasoning.",
  },
  {
    title: "Autofill & apply",
    body: "One click fills the application from your profile. Anything the AI isn't sure about is flagged for your review — never silently skipped.",
  },
  {
    title: "Track everything",
    body: "Hit Track and the job lands in your dashboard. Optionally scan your Gmail to catch interview invites and rejections automatically.",
  },
] as const;

/** "How it works" — 4 steps (product spec §11). */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-20">
      <h2 className="font-heading text-center text-3xl font-bold tracking-tight">
        How it works
      </h2>
      <ol className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex flex-col gap-3">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-sm font-semibold">
              {i + 1}
            </span>
            <h3 className="font-semibold">{step.title}</h3>
            <p className="text-muted-foreground text-sm">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
