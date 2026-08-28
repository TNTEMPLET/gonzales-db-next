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
