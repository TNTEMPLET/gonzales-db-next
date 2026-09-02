import type { ContentOrgId } from "@/lib/siteConfig";

export type SeasonConfig = {
  label: string;
  year: number;
  /** ISO date YYYY-MM-DD */
  startDate: string;
  /** ISO date YYYY-MM-DD */
  endDate: string;
};

const SEASONS: Record<ContentOrgId, SeasonConfig> = {
  gonzales: {
    label: "Spring 2026",
    year: 2026,
    startDate: "2026-03-01",
    endDate: "2026-06-30",
  },
  ascension: {
    label: "Spring 2026",
    year: 2026,
    startDate: "2026-03-01",
    endDate: "2026-06-30",
  },
  fallball: {
    label: "Fall Ball 2026",
    year: 2026,
    startDate: "2026-08-01",
    endDate: "2026-11-30",
  },
};

/** Insertion order of SEASONS: gonzales, ascension, fallball. */
const CONTENT_ORG_IDS = Object.keys(SEASONS) as ContentOrgId[];

const LEAGUE_TZ = "America/Chicago";

/** Calendar date in league time (Central), YYYY-MM-DD. */
export function leagueCalendarDate(asOf: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LEAGUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(asOf);
}

export function isSeasonLiveForOrg(org: ContentOrgId, asOf: Date = new Date()): boolean {
  const season = getSeasonConfigForOrg(org);
  const day = leagueCalendarDate(asOf);
  return day >= season.startDate && day <= season.endDate;
}

/**
 * Orgs whose configured season window includes `asOf`.
 *
 * Spring 2026: Gonzales and Ascension overlap (both 2026-03-01..2026-06-30).
 * Master admin still lands on a single org today; a dual-live workspace
 * (work Gonzales and Ascension in parallel from admin.apbaseball.com) is
 * deferred — use the org switcher until that picker exists.
 */
export function getLiveContentOrgs(asOf: Date = new Date()): ContentOrgId[] {
  return CONTENT_ORG_IDS.filter((org) => isSeasonLiveForOrg(org, asOf));
}

/**
 * Single org to open on master admin when the URL has no `?org=`.
 * Prefer the unique live org; if several are live, the first in
 * CONTENT_ORGS order (gonzales, then ascension, then fallball); if none
 * are live, the next upcoming window, else the most recently ended.
 */
export function getPrimaryLiveContentOrg(asOf: Date = new Date()): ContentOrgId {
  const live = getLiveContentOrgs(asOf);
  if (live.length > 0) return live[0];

  const day = leagueCalendarDate(asOf);
  const upcoming = CONTENT_ORG_IDS
    .map((org) => ({ org, start: getSeasonConfigForOrg(org).startDate }))
    .filter((row) => row.start > day)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (upcoming[0]) return upcoming[0].org;

  const ended = CONTENT_ORG_IDS
    .map((org) => ({ org, end: getSeasonConfigForOrg(org).endDate }))
    .sort((a, b) => b.end.localeCompare(a.end));
  return ended[0]?.org ?? "gonzales";
}

/** Resolve content org from SITE_ORG without importing getSiteConfig (avoids cycles). */
function contentOrgFromEnv(): ContentOrgId {
  const raw = (process.env.SITE_ORG ?? "gonzales").toLowerCase();
  if (raw === "fallball") return "fallball";
  if (raw === "ascension") return "ascension";
  return "gonzales";
}

export function getSeasonConfigForOrg(org: ContentOrgId): SeasonConfig {
  return SEASONS[org] ?? SEASONS.gonzales;
}

/** Season for this deployment's content org (fallball/ascension/gonzales). */
export function getSeasonConfig(org?: ContentOrgId): SeasonConfig {
  return getSeasonConfigForOrg(org ?? contentOrgFromEnv());
}

const deploySeason = getSeasonConfig();

/**
 * Deployment-scoped season constants.
 * Each SITE_ORG process (Vercel project / dev:fallball) gets the correct values at load.
 * For master admin targeting another org, call getSeasonConfigForOrg(targetOrg).
 */
export const CURRENT_SEASON_LABEL = deploySeason.label;
export const CURRENT_SEASON_YEAR = deploySeason.year;
export const SEASON_START_DATE = deploySeason.startDate;
export const SEASON_END_DATE = deploySeason.endDate;
