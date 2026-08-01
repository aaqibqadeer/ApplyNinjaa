import { activeProduct } from "@/config/products";

/**
 * Testimonials — layout ships now; copy comes from activeProduct.marketing.
 * Swap placeholder quotes for real ones as they come in.
 */
export function Testimonials() {
  const { testimonials, testimonialsHeading } = activeProduct.marketing;

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <h2 className="font-heading text-center text-3xl font-bold tracking-tight">
        {testimonialsHeading}
      </h2>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {testimonials.map((t) => (
          <figure
            key={t.who}
            className="border-border bg-card flex flex-col gap-4 rounded-xl border p-6"
          >
            <blockquote className="text-sm">&ldquo;{t.quote}&rdquo;</blockquote>
            <figcaption className="text-muted-foreground mt-auto text-xs">
              <span className="text-foreground font-medium">{t.who}</span> ·{" "}
              {t.role}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
