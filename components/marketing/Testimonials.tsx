/**
 * Testimonials — placeholder structure (product spec §11): the layout ships
 * now; swap the placeholder quotes for real ones as they come in.
 */
const TESTIMONIALS = [
  {
    quote:
      "[Placeholder] Stopped wasting evenings on postings that don't sponsor. The filter badges pay for themselves.",
    name: "A. Kumar",
    role: "SWE, F-1 STEM OPT",
  },
  {
    quote:
      "[Placeholder] Applied to 40 jobs in a weekend. The autofill catches fields I'd have mistyped.",
    name: "M. Chen",
    role: "Data Analyst",
  },
  {
    quote:
      "[Placeholder] The Gmail scan found two interview invites buried in promotions. Worth it for that alone.",
    name: "S. Alvarez",
    role: "Product Designer",
  },
] as const;

export function Testimonials() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20">
      <h2 className="font-heading text-center text-3xl font-bold tracking-tight">
        What job seekers say
      </h2>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure
            key={t.name}
            className="border-border bg-card flex flex-col gap-4 rounded-xl border p-6"
          >
            <blockquote className="text-sm">&ldquo;{t.quote}&rdquo;</blockquote>
            <figcaption className="text-muted-foreground mt-auto text-xs">
              <span className="text-foreground font-medium">{t.name}</span> ·{" "}
              {t.role}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
