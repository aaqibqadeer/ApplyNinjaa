/**
 * config/products.ts — product identity registry (two-product production plan §P0).
 *
 * NEXT_PUBLIC_PRODUCT selects which product this deployment is. Identity
 * (name, copy, legal) is independent of capability flags in features.ts on
 * purpose: a staging service can run ScrapperNinja's identity with enrichment
 * off.
 *
 * Unknown or absent values throw at module load — a silent wrong default would
 * ship the wrong brand to customers.
 */

export const PRODUCT_IDS = ["applyninja", "scrapperninja"] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

export interface ProductMarketing {
  hero: {
    headline: string;
    sub: string;
    cta: string;
    badge: string;
    secondaryCta: string;
    screenshotLabel: string;
    audience: string[];
  };
  howItWorks: { title: string; body: string }[];
  testimonials: { quote: string; who: string; role: string }[];
  pricing: { title: string; sub: string };
  testimonialsHeading: string;
}

export interface ProductDefinition {
  id: ProductId;
  name: string;
  description: string;
  tagline: string;
  supportEmail: string;
  marketing: ProductMarketing;
  /** Non-plan-table bullets shown on every public pricing card. */
  pricingBullets: string[];
}

export const PRODUCTS: Record<ProductId, ProductDefinition> = {
  applyninja: {
    id: "applyninja",
    name: "ApplyNinjaa",
    description:
      "Autofill job applications, screen listings against your deal-breakers, " +
      "score job fit against your resume, and track every application.",
    tagline: "Apply smarter, not slower.",
    supportEmail: "support@applyninjaa.com",
    marketing: {
      hero: {
        badge: "Built for visa-constrained job seekers",
        headline: "Stop applying to jobs that were never going to say yes.",
        sub:
          "screens every posting against your deal-breakers — visa " +
          "sponsorship, citizenship requirements, clearance — scores your fit " +
          "against your resume, autofills the application, and tracks it. One " +
          "click, any job site.",
        cta: "Start free — no card required",
        secondaryCta: "See how it works",
        screenshotLabel:
          "[ Product screenshot — extension popup analyzing a job posting ]",
        audience: [
          "F-1 OPT / STEM OPT",
          "H1-B",
          "TN",
          "H4-EAD",
          "…and every job seeker tired of re-typing their resume",
        ],
      },
      howItWorks: [
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
      ],
      testimonialsHeading: "What job seekers say",
      testimonials: [
        {
          quote:
            "[Placeholder] Stopped wasting evenings on postings that don't sponsor. The filter badges pay for themselves.",
          who: "A. Kumar",
          role: "SWE, F-1 STEM OPT",
        },
        {
          quote:
            "[Placeholder] Applied to 40 jobs in a weekend. The autofill catches fields I'd have mistyped.",
          who: "M. Chen",
          role: "Data Analyst",
        },
        {
          quote:
            "[Placeholder] The Gmail scan found two interview invites buried in promotions. Worth it for that alone.",
          who: "S. Alvarez",
          role: "Product Designer",
        },
      ],
      pricing: {
        title: "Simple pricing",
        sub: "Every new account starts with a free trial — no card required.",
      },
    },
    pricingBullets: [
      "Unlimited tracked applications",
      "All Valid Job filters",
    ],
  },
  scrapperninja: {
    id: "scrapperninja",
    name: "ScrapperNinja",
    description:
      "Capture local businesses from any directory, enrich and score them, " +
      "and export cold-email-ready CSVs from a shared Lead Directory.",
    tagline: "Find leads. Enrich them. Reach out.",
    supportEmail: "support@scrapperninja.com",
    marketing: {
      hero: {
        badge: "Lead generation for agencies and operators",
        headline: "Turn directory searches into cold-email-ready lead lists.",
        sub:
          "harvests businesses from Google Maps and any directory, " +
          "dedupes and enriches them, scores fit, and writes a personalized " +
          "opening line — then exports the filtered CSV your team can send.",
        cta: "Start free — no card required",
        secondaryCta: "See how it works",
        screenshotLabel:
          "[ Product screenshot — Lead Directory with enriched businesses ]",
        audience: [
          "Agencies",
          "Local SEO shops",
          "Sales teams",
          "Solo operators",
          "…anyone tired of copy-pasting from Maps",
        ],
      },
      howItWorks: [
        {
          title: "Capture from any directory",
          body: "Run the Chrome extension on Google Maps or any business directory. Fast mode grabs the list; Deep mode opens each card for phone, website, and hours.",
        },
        {
          title: "Land in your Lead Directory",
          body: "Every capture syncs to a shared org dashboard — filter, sort, hide columns, save views, and fix bad parses inline.",
        },
        {
          title: "Enrich, score, and personalize",
          body: "AI normalizes phones and addresses, crawls sites for emails and tech stack, scores each lead with reasoning, and drafts a cold-email opening line.",
        },
        {
          title: "Export the list you need",
          body: "Filter to the ready rows, pick the columns, and download a CSV. No CRM lock-in — the workflow stops at export.",
        },
      ],
      testimonialsHeading: "What operators say",
      testimonials: [
        {
          quote:
            "[Placeholder] Captured 200 local contractors from Maps in an afternoon. The export was ready for outreach the same day.",
          who: "J. Ortiz",
          role: "Agency founder",
        },
        {
          quote:
            "[Placeholder] The enrichment pass found emails we'd have spent hours hunting. Score + reason makes prioritization obvious.",
          who: "R. Patel",
          role: "SDR lead",
        },
        {
          quote:
            "[Placeholder] Finally a scraper that doesn't dump junk into a spreadsheet. The review queue keeps the list clean.",
          who: "L. Nguyen",
          role: "Local SEO consultant",
        },
      ],
      pricing: {
        title: "Simple pricing",
        sub: "Every new account starts with a free trial — no card required.",
      },
    },
    pricingBullets: [
      "Shared Lead Directory",
      "CSV import and export",
    ],
  },
};

function resolveProductId(): ProductId {
  const raw = process.env.NEXT_PUBLIC_PRODUCT;
  if (raw && (PRODUCT_IDS as readonly string[]).includes(raw)) {
    return raw as ProductId;
  }
  const valid = PRODUCT_IDS.join(", ");
  throw new Error(
    `NEXT_PUBLIC_PRODUCT must be one of: ${valid}. ` +
      (raw
        ? `Got "${raw}".`
        : "It is missing — set it in .env.local (e.g. NEXT_PUBLIC_PRODUCT=scrapperninja)."),
  );
}

let cachedProduct: ProductDefinition | null = null;

/**
 * The product this deployment is. Resolved lazily on first access so importing
 * `PRODUCT_IDS` (e.g. from env.schema) does not force a product pick.
 * Unknown/absent NEXT_PUBLIC_PRODUCT throws — never a silent default.
 */
export const activeProduct: ProductDefinition = new Proxy(
  {} as ProductDefinition,
  {
    get(_target, prop, receiver) {
      if (!cachedProduct) {
        cachedProduct = PRODUCTS[resolveProductId()];
      }
      return Reflect.get(cachedProduct, prop, receiver);
    },
  },
);
