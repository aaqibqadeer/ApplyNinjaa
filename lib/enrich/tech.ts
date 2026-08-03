/**
 * lib/enrich/tech.ts — PURE tech-stack detection from a page's HTML + response
 * headers (Phase 3 enrichment). No DB, no network — a signature map applied to
 * fetched markup, fully unit-tested.
 *
 * Each signature is a substring/regex probe against the lowercased HTML (or a
 * header value). A page can legitimately match several (e.g. WordPress +
 * jQuery + Google Analytics), so results are a deduped, catalog-ordered list.
 */

/** One detectable technology and how to recognize it in HTML. */
interface TechSignature {
  name: string;
  /** Matches against the raw HTML (case-insensitive). */
  html?: RegExp;
}

/** Ordered so the returned list reads platform → analytics → libs. */
const HTML_SIGNATURES: readonly TechSignature[] = [
  { name: "WordPress", html: /wp-content|wp-includes|\/wp-json/ },
  { name: "Next.js", html: /\/_next\/|__next_f|id="__next"/ },
  { name: "Shopify", html: /cdn\.shopify\.com|shopify\.theme|x-shopify/ },
  { name: "Wix", html: /static\.wixstatic\.com|wix\.com|_wix|X-Wix/ },
  { name: "Squarespace", html: /squarespace\.com|static1\.squarespace|sqs-/ },
  { name: "Webflow", html: /assets\.website-files\.com|webflow\.js|data-wf-/ },
  { name: "Google Tag Manager", html: /googletagmanager\.com\/gtm\.js|gtm-[a-z0-9]+/i },
  { name: "Google Analytics", html: /google-analytics\.com\/analytics\.js|gtag\/js\?id=g|googletagmanager\.com\/gtag/i },
  { name: "Meta Pixel", html: /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(/ },
  { name: "HubSpot", html: /js\.hs-scripts\.com|hsubspot|hs-analytics/ },
  { name: "jQuery", html: /jquery[.-]|jquery\.min\.js|ajax\.googleapis\.com\/ajax\/libs\/jquery/ },
  { name: "React", html: /data-reactroot|react\.production\.min\.js|react-dom/ },
  { name: "Bootstrap", html: /bootstrap(\.min)?\.css|bootstrap(\.min)?\.js/ },
  { name: "Font Awesome", html: /font-?awesome|fontawesome/ },
];

/**
 * Detect technologies from a page's HTML and (optionally) its response headers.
 * Header signals that only appear in headers — Cloudflare (`server`/`cf-ray`)
 * and Shopify (`x-shopify-stage`) — are checked separately so a body-less probe
 * still works. Returns a deduped list in a stable catalog order.
 */
export function detectTechStack(
  html: string,
  headers?: Record<string, string> | Headers,
): string[] {
  const found = new Set<string>();
  const lower = html.toLowerCase();

  for (const sig of HTML_SIGNATURES) {
    if (sig.html && sig.html.test(lower)) found.add(sig.name);
  }

  const get = (name: string): string => {
    if (!headers) return "";
    if (headers instanceof Headers) return headers.get(name) ?? "";
    // Header keys arrive with varied casing — normalize the lookup.
    const target = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === target) return value ?? "";
    }
    return "";
  };

  const server = get("server").toLowerCase();
  const cfRay = get("cf-ray");
  if (server.includes("cloudflare") || cfRay) found.add("Cloudflare");
  if (get("x-shopify-stage") || get("x-shopid")) found.add("Shopify");
  if (get("x-powered-by").toLowerCase().includes("wp engine")) {
    found.add("WordPress");
  }
  const poweredBy = get("x-powered-by").toLowerCase();
  if (poweredBy.includes("next.js")) found.add("Next.js");

  // Return in catalog order, then any header-only extras.
  const ordered = HTML_SIGNATURES.map((s) => s.name).filter((n) =>
    found.has(n),
  );
  for (const extra of ["Cloudflare"]) {
    if (found.has(extra) && !ordered.includes(extra)) ordered.push(extra);
  }
  return ordered;
}
