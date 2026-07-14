import type { ContentOrgId, OrgId } from "@/lib/siteConfig";

/** How families register players. */
export type RegistrationMode = "sportsconnect" | "internal" | "none";

/** Public schedule data source. */
export type ScheduleSource = "assignr" | "none";

/** Homepage shell variant. */
export type HomepageMode = "league-hero" | "news-rotator" | "compact-ops";

export type TeamNameMode = "mlb" | "standard";

/**
 * Per-content-org product capabilities.
 * Prefer this over scattered `org === "fallball"` checks for feature gating.
 */
export type OrgCapabilities = {
  registration: RegistrationMode;
  schedule: ScheduleSource;
  liveScores: "gamechanger" | "none";
  dugout: boolean;
  coachCorner: boolean;
  coachingInterest: boolean;
  allStar: boolean;
  tournaments: boolean;
  sponsors: boolean;
  homepage: HomepageMode;
  teamNameMode: TeamNameMode;
  /** Admin modules hidden for this org (AdminModule string keys). */
  disabledAdminModules: readonly string[];
  /** Public nav keys hidden for this org. */
  disabledPublicNav: readonly string[];
};

const SPRING_LEAGUE_DEFAULTS: OrgCapabilities = {
  registration: "internal",
  schedule: "assignr",
  liveScores: "gamechanger",
  dugout: true,
  coachCorner: true,
  coachingInterest: false,
  allStar: true,
  tournaments: true,
  sponsors: true,
  homepage: "league-hero",
  teamNameMode: "standard",
  disabledAdminModules: [],
  disabledPublicNav: [],
};

const CAPABILITIES: Record<ContentOrgId, OrgCapabilities> = {
  gonzales: { ...SPRING_LEAGUE_DEFAULTS },
  ascension: { ...SPRING_LEAGUE_DEFAULTS },
  fallball: {
    registration: "sportsconnect",
    // Product: Assignr undecided — treat as none until IDs are configured.
    schedule: "none",
    liveScores: "none",
    dugout: true,
    coachCorner: true,
    coachingInterest: true,
    allStar: false,
    tournaments: false,
    sponsors: false,
    homepage: "compact-ops",
    teamNameMode: "mlb",
    disabledAdminModules: [
      "ALL_STAR_VAULT",
      "ALL_STAR_PAYMENTS",
      "SPONSORS",
      "TOURNAMENT_BRACKETS",
    ],
    disabledPublicNav: ["all-stars", "tournaments"],
  },
};

export function getOrgCapabilities(org: ContentOrgId): OrgCapabilities {
  return CAPABILITIES[org] ?? CAPABILITIES.gonzales;
}

export function isContentOrgCapabilities(
  org: string | null | undefined,
): org is ContentOrgId {
  return org === "gonzales" || org === "ascension" || org === "fallball";
}

/** True when this org should never invent a default Assignr league id. */
export function requiresExplicitAssignrLeague(org: ContentOrgId | OrgId): boolean {
  return org === "fallball";
}

/** Coach pipeline public form + admin queue (Fall Ball today; capability-gated). */
export function isCoachingInterestEnabled(
  org: ContentOrgId | OrgId | string | null | undefined,
): boolean {
  if (!isContentOrgCapabilities(org)) return false;
  return getOrgCapabilities(org).coachingInterest;
}

export function isAdminModuleEnabledInCapabilities(
  org: ContentOrgId | null | undefined,
  module: string,
): boolean {
  if (!org) return true;
  const caps = getOrgCapabilities(org);
  return !caps.disabledAdminModules.includes(module);
}

export function isPublicNavEnabledInCapabilities(
  org: OrgId | string | null | undefined,
  navKey: string,
): boolean {
  if (!isContentOrgCapabilities(org)) return true;
  const caps = getOrgCapabilities(org);
  return !caps.disabledPublicNav.includes(navKey);
}
