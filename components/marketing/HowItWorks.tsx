import { activeProduct } from "@/config/products";

/** "How it works" — steps from activeProduct.marketing. */
export function HowItWorks() {
  const steps = activeProduct.marketing.howItWorks;

  return (
    <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-20">
      <h2 className="font-heading text-center text-3xl font-bold tracking-tight">
        How it works
      </h2>
      <ol className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
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
