import Link from "next/link";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/brand";
import { activeProduct } from "@/config/products";

/**
 * Landing-page hero: badge, headline, sub-headline, primary CTAs, and a
 * product-screenshot placeholder. Copy comes from activeProduct.marketing.
 */
export function Hero() {
  const { hero } = activeProduct.marketing;

  return (
    <section className="from-muted/60 to-background bg-gradient-to-b">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-24 text-center sm:py-28">
        <span className="border-border bg-background text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
          <span
            className="bg-primary size-1.5 rounded-full"
            aria-hidden="true"
          />
          {hero.badge}
        </span>

        <h1 className="font-heading max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
          {hero.headline}
        </h1>

        <p className="text-muted-foreground max-w-2xl text-lg text-pretty">
          {APP_NAME} {hero.sub}
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/signup">{hero.cta}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#how-it-works">{hero.secondaryCta}</a>
          </Button>
        </div>

        {/* Product screenshot/GIF placeholder — swap for a real capture. */}
        <div
          className="border-border bg-card mt-8 flex aspect-video w-full max-w-3xl items-center justify-center rounded-xl border shadow-lg"
          role="img"
          aria-label="Product screenshot placeholder"
        >
          <span className="text-muted-foreground text-sm">
            {hero.screenshotLabel}
          </span>
        </div>

        <ul className="text-muted-foreground mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          {hero.audience.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
