/**
 * lib/applications/platform.ts — hostname → job-board name.
 *
 * Pure string work with no dependencies, so both the Next app and the
 * extension bundle can use it. Deliberately a small lookup rather than a
 * fetched list: it only exists to label a tracked application, and an
 * unrecognised host is a perfectly good "Company site" rather than an error.
 */

/** Matched against the registrable part of the hostname, longest first. */
const PLATFORMS: Array<[pattern: string, name: string]> = [
  ["linkedin.", "LinkedIn"],
  ["indeed.", "Indeed"],
  ["greenhouse.io", "Greenhouse"],
  ["lever.co", "Lever"],
  ["myworkdayjobs.com", "Workday"],
  ["workday.com", "Workday"],
  ["ashbyhq.com", "Ashby"],
  ["smartrecruiters.com", "SmartRecruiters"],
  ["icims.com", "iCIMS"],
  ["taleo.net", "Taleo"],
  ["successfactors.com", "SuccessFactors"],
  ["bamboohr.com", "BambooHR"],
  ["workable.com", "Workable"],
  ["jobvite.com", "Jobvite"],
  ["breezy.hr", "Breezy"],
  ["recruitee.com", "Recruitee"],
  ["teamtailor.com", "Teamtailor"],
  ["glassdoor.", "Glassdoor"],
  ["monster.", "Monster"],
  ["ziprecruiter.", "ZipRecruiter"],
  ["dice.com", "Dice"],
  ["wellfound.com", "Wellfound"],
  ["angel.co", "Wellfound"],
  ["builtin.com", "Built In"],
  ["otta.com", "Otta"],
  ["hired.com", "Hired"],
  ["simplyhired.", "SimplyHired"],
  ["careerbuilder.", "CareerBuilder"],
  ["seek.com", "Seek"],
  ["naukri.com", "Naukri"],
];

export const OTHER_PLATFORM = "Company site";

/**
 * Best-effort platform label for a hostname or full URL. Returns
 * "Company site" for anything unrecognised, and null only when there's no
 * usable host at all — a job posted directly by an employer is the common
 * case, not a failure.
 */
export function detectPlatform(urlOrHost: string | null | undefined): string | null {
  if (!urlOrHost) return null;
  let host = urlOrHost.trim().toLowerCase();
  if (!host) return null;
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  host = host.replace(/^www\./, "");
  if (!host) return null;
  for (const [pattern, name] of PLATFORMS) {
    if (host === pattern || host.includes(pattern)) return name;
  }
  return OTHER_PLATFORM;
}

/** Hostname for a URL, or null when it isn't parseable. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
