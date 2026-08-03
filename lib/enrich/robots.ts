/**
 * lib/enrich/robots.ts — a minimal, PURE robots.txt parser + `canFetch` check
 * (Phase 3 enrichment). No network here — the crawler fetches `/robots.txt`
 * once and hands the text in. Good-citizen crawling respects it (execution
 * plan §4).
 *
 * Scope: enough of the standard to be polite — `User-agent` grouping, `Allow`,
 * `Disallow`, and longest-match precedence (Allow wins ties). We do not
 * implement `Crawl-delay`, wildcards beyond `*`, or `$` anchoring exhaustively,
 * but `*` and `$` in paths are honored, which covers the common cases.
 */

export interface RobotsRule {
  allow: boolean;
  path: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
}

/** Parse robots.txt text into user-agent groups with their allow/disallow rules. */
export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  // A run of consecutive `User-agent` lines shares the next rule block.
  let expectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      if (!expectingAgents || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
        expectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (field === "allow" || field === "disallow") {
      if (!current) {
        current = { agents: ["*"], rules: [] };
        groups.push(current);
      }
      expectingAgents = false;
      // An empty Disallow means "allow everything" — skip adding a rule.
      if (field === "disallow" && value === "") continue;
      current.rules.push({ allow: field === "allow", path: value });
    }
  }

  return { groups };
}

/** Turn a robots path pattern (with `*` and optional `$`) into a RegExp. */
function patternToRegExp(pattern: string): RegExp {
  const anchoredEnd = pattern.endsWith("$");
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${anchoredEnd ? "$" : ""}`);
}

/** The group whose agent list best matches `userAgent` (exact token > `*`). */
function selectGroup(
  parsed: ParsedRobots,
  userAgent: string,
): RobotsGroup | null {
  const ua = userAgent.toLowerCase();
  let star: RobotsGroup | null = null;
  for (const group of parsed.groups) {
    for (const agent of group.agents) {
      if (agent === "*") star ??= group;
      else if (ua.includes(agent)) return group;
    }
  }
  return star;
}

/**
 * Whether `userAgent` may fetch `url` under `robotsTxt`. Empty/malformed robots
 * text means "allowed" (fail-open the way real crawlers do). Longest matching
 * rule wins; an `Allow` beats a `Disallow` of equal length.
 */
export function canFetch(
  url: string,
  robotsTxt: string,
  userAgent: string,
): boolean {
  if (!robotsTxt.trim()) return true;
  let path: string;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    path = url.startsWith("/") ? url : `/${url}`;
  }

  const parsed = parseRobots(robotsTxt);
  const group = selectGroup(parsed, userAgent);
  if (!group || group.rules.length === 0) return true;

  let best: { allow: boolean; length: number } | null = null;
  for (const rule of group.rules) {
    if (rule.path === "") continue;
    if (patternToRegExp(rule.path).test(path)) {
      const length = rule.path.length;
      if (
        !best ||
        length > best.length ||
        (length === best.length && rule.allow)
      ) {
        best = { allow: rule.allow, length };
      }
    }
  }
  return best ? best.allow : true;
}
