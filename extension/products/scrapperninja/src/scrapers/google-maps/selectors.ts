/**
 * BUNDLED FALLBACK selectors for Google Maps.
 *
 * Last-resort selectors used when the server-pushed pack
 * (GET /api/scrape/selectors, sourceId "google-maps") is unavailable. Google
 * Maps ships obfuscated, frequently-churning class names, so these WILL rot —
 * that is exactly why the server pack exists (fix the DOM without shipping a new
 * build).
 *
 * KEYS MATCH THE SERVER PACK (scripts/seed.ts `seedSourcePacks`), so a pack
 * transparently overrides the corresponding fallback:
 *   resultItem · link · name · category · rating · reviewCount   (card level)
 *   address · phone · website · hours · plusCode                 (detail panel)
 * The remaining keys (feed, detailPanel, detailName, backButton, cardInfo) are
 * bundled-only helpers the pack does not carry. Each value may be a
 * comma-separated list; the adapter tries them in order.
 */

export const GOOGLE_MAPS_SELECTORS: Record<string, string> = {
  // -- card level (mirrors the seeded pack keys) --------------------------
  resultItem: 'div[role="feed"] > div > div[jsaction], a.hfpxzc',
  link: "a.hfpxzc, a[href*='/maps/place/']",
  name: "div.fontHeadlineSmall, .qBF1Pd, [role='heading']",
  category: "div.fontBodyMedium > div:nth-of-type(1) > span:nth-of-type(1), .W4Efsd",
  rating: ".MW4etd, span[role='img'][aria-label*='star']",
  reviewCount: ".UY7F9, span[aria-label*='review']",
  // -- detail panel (mirrors the seeded pack keys) ------------------------
  address: "button[data-item-id='address'], [data-tooltip='Copy address']",
  phone: "button[data-item-id^='phone'], [data-tooltip='Copy phone number']",
  website: "a[data-item-id='authority'], a[data-tooltip='Open website']",
  hours: "div[jsaction*='openhours'], [data-item-id='oh'], .t39EBf",
  plusCode: "button[data-item-id='oloc'], [data-tooltip='Copy plus code']",
  // -- bundled-only helpers (not in the server pack) ----------------------
  feed: 'div[role="feed"]',
  cardInfo: ".W4Efsd",
  detailPanel: 'div[role="main"]',
  detailName: "h1.DUwDvf, h1.fontHeadlineLarge",
  detailRating: "div.F7nice span[aria-hidden='true']",
  detailReviewCount: "div.F7nice span[aria-label*='review']",
  backButton: "button[aria-label='Back'], button[jsaction*='back']",
};
