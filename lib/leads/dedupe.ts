/**
 * lib/leads/dedupe.ts — PURE dedupe key generation + grouping (Phase 3).
 *
 * No DB, no AI — safe to import anywhere and fully unit-tested. The `dedupe`
 * job stores `dedupeKeys(lead)` on each lead, groups leads that share a key,
 * and writes `duplicate_candidates` rows for the pairs (NOTHING auto-merges —
 * locked decision #8). Keys are stable strings so the same pair is found again
 * on a re-run.
 *
 * Key shapes (locked in the execution plan):
 *   phone:<e164>
 *   domain:<domain>
 *   name:<slug>|zip:<postal>
 */

/** The lead fields dedupe reads (a subset of `Lead`, kept loose for testing). */
export interface DedupeLead {
  phoneE164?: string | null;
  phone?: string | null;
  websiteDomain?: string | null;
  businessName?: string | null;
  address?: { postalCode?: string | null } | null;
}

/** Lowercase, collapse to alphanumerics — a stable slug for name matching. */
export function nameSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "");
}

/** Digits-only form of a phone (fallback key when no E.164 is available). */
function phoneDigits(phone: string): string {
  return phone.replace(/\D+/g, "");
}

/**
 * The set of dedupe keys for one lead. A key is only emitted when its inputs
 * are present, so a lead with no phone/domain/postal simply yields fewer keys
 * (and matches nothing on that dimension).
 */
export function dedupeKeys(lead: DedupeLead): string[] {
  const keys: string[] = [];

  const e164 = lead.phoneE164?.trim();
  if (e164) {
    keys.push(`phone:${e164}`);
  } else if (lead.phone) {
    const digits = phoneDigits(lead.phone);
    if (digits.length >= 7) keys.push(`phone:${digits}`);
  }

  const domain = lead.websiteDomain?.trim().toLowerCase();
  if (domain) keys.push(`domain:${domain}`);

  const name = lead.businessName?.trim();
  const postal = lead.address?.postalCode?.trim();
  if (name) {
    const slug = nameSlug(name);
    if (slug) keys.push(`name:${slug}|zip:${postal ?? ""}`);
  }

  return keys;
}

/** The dimension a key matches on (`phone` | `domain` | `name`). */
export function keyKind(key: string): string {
  const colon = key.indexOf(":");
  return colon === -1 ? key : key.slice(0, colon);
}

/** How strongly a shared set of key-kinds implies a duplicate, in [0, 1]. */
const KIND_WEIGHT: Record<string, number> = {
  phone: 0.9,
  domain: 0.85,
  name: 0.5,
};

/**
 * Confidence for a pair from the kinds they share: take the strongest signal,
 * then nudge up for each additional corroborating kind, capped at 1.
 */
export function pairConfidence(matchedKinds: string[]): number {
  if (matchedKinds.length === 0) return 0;
  const weights = matchedKinds.map((k) => KIND_WEIGHT[k] ?? 0.4);
  const base = Math.max(...weights);
  const bonus = (matchedKinds.length - 1) * 0.05;
  return Math.min(1, Number((base + bonus).toFixed(2)));
}

/** One item to be deduped: an id plus its precomputed keys. */
export interface DedupeItem {
  id: string;
  keys: string[];
}

/** A connected group of items that transitively share keys. */
export interface DedupeGroup {
  ids: string[];
}

/**
 * Group items into connected components: two items are linked when they share
 * at least one key, and a group is the transitive closure of those links.
 * Singletons are dropped (a group has ≥ 2 members). Order within a group and
 * across groups follows first-seen input order, so the output is deterministic.
 */
export function groupBySharedKeys(items: DedupeItem[]): DedupeGroup[] {
  // Union-Find over item indices.
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const keyToFirstIndex = new Map<string, number>();
  items.forEach((item, index) => {
    for (const key of item.keys) {
      const seen = keyToFirstIndex.get(key);
      if (seen === undefined) keyToFirstIndex.set(key, index);
      else union(seen, index);
    }
  });

  const byRoot = new Map<number, string[]>();
  items.forEach((item, index) => {
    const root = find(index);
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(item.id);
    else byRoot.set(root, [item.id]);
  });

  return [...byRoot.values()]
    .filter((ids) => ids.length >= 2)
    .map((ids) => ({ ids }));
}

/** A flagged pair for the review queue. */
export interface DuplicatePair {
  aId: string;
  bId: string;
  /** The key-kinds both leads share (`["phone","domain"]`). */
  matchedOn: string[];
  confidence: number;
}

/**
 * The candidate pairs to write to `duplicate_candidates`: every unordered pair
 * of items that share ≥ 1 key, annotated with the shared kinds and a
 * confidence. Deterministic (input order); each pair appears once.
 */
export function findDuplicatePairs(items: DedupeItem[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const a = items[i];
    const aKeys = new Set(a.keys);
    for (let j = i + 1; j < items.length; j += 1) {
      const b = items[j];
      const sharedKinds = new Set<string>();
      for (const key of b.keys) {
        if (aKeys.has(key)) sharedKinds.add(keyKind(key));
      }
      if (sharedKinds.size === 0) continue;
      const matchedOn = [...sharedKinds];
      pairs.push({
        aId: a.id,
        bId: b.id,
        matchedOn,
        confidence: pairConfidence(matchedOn),
      });
    }
  }
  return pairs;
}
