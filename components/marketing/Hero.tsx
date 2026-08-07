import Link from "next/link";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/brand";

/** Audience strip under the hero — who this is built for. */
const AUDIENCE = [
  "F-1 OPT / STEM OPT",
  "H1-B",
  "TN",
  "H4-EAD",
  "…and every job seeker tired of re-typing their resume",
] as const;

/**
 * Landing-page hero: badge, headline, sub-headline, primary CTAs, and a
 * product-screenshot placeholder.
 */
export function Hero() {
  return (
    <section className="from-muted/60 to-background bg-gradient-to-b">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-24 text-center sm:py-28">
        <span className="border-border bg-background text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
          <span
            className="bg-primary size-1.5 rounded-full"
            aria-hidden="true"
          />
          Built for visa-constrained job seekers
        </span>

        <h1 className="font-heading max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
          Stop applying to jobs that were never going to say yes.
        </h1>

        <p className="text-muted-foreground max-w-2xl text-lg text-pretty">
          {APP_NAME} screens every posting against your deal-breakers — visa
          sponsorship, citizenship requirements, clearance — scores your fit
          against your resume, autofills the application, and tracks it. One
          click, any job site.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/signup">Start free — no card required</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#how-it-works">See how it works</a>
          </Button>
        </div>

        {/* Product screenshot/GIF placeholder — swap for a real capture. */}
        <div
          className="border-border bg-card mt-8 flex aspect-video w-full max-w-3xl items-center justify-center rounded-xl border shadow-lg"
          role="img"
          aria-label="Product screenshot placeholder"
        >
          <span className="text-muted-foreground text-sm">
            [ Product screenshot — extension popup analyzing a job posting ]
          </span>
        </div>

        <ul className="text-muted-foreground mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          {AUDIENCE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
