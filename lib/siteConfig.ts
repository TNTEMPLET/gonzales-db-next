export type OrgId =
  | "gonzales"
  | "ascension"
  | "fallball"
  | "master"
  | "ladistrict2"
  | "ladistrict6";
export type ContentOrgId = "gonzales" | "ascension" | "fallball";
/** ContentOrgId plus tournament-only orgs that only use the bracket system */
export type BracketOrgId = ContentOrgId | "ladistrict2" | "ladistrict6";

/** Official DYB mark from dybusa.org (Louisiana District 6 site + bracket flyers). */
export const DYB_DISTRICT6_LOGO_URL =
  "https://dybusa.org/mediacontent/2026/01/26/11/u_New_DYB_Logo_copy_1769454568974_1_88301504_249670.png";

/** Brand colors sampled from the official DYB logo (navy square + red diamond). */
export const DYB_DISTRICT6_BRAND = {
  primaryHex: "#051140",
  primaryDarkHex: "#030B2E",
  accentHex: "#B60813",
} as const;

export interface SiteConfig {
  orgId: OrgId;
  name: string;
  shortName: string;
  displayNameLine1: string;
  displayNameLine2: string;
  description: string;
  siteUrl: string;
  logoPath: string;
  faviconPath: string;
  /** Tailwind/CSS: maps to --org-primary */
  colorPrimary: string;
  /** Tailwind/CSS: maps to --org-primary-dark */
  colorPrimaryDark: string;
  /** Tailwind/CSS: maps to --org-accent */
  colorAccent: string;
  /** Assignr site ID */
  assignrSiteId: string;
  /** Assignr league ID used to filter games */
  assignrLeagueId: string;
  /** Tournament-only sites hide league nav links and redirect home to /tournaments */
  tournamentOnly?: boolean;
}

const configs: Record<OrgId, SiteConfig> = {
  gonzales: {
    orgId: "gonzales",
    name: "Gonzales Diamond Baseball",
    shortName: "Gonzales DYB",
    displayNameLine1: "Gonzales",
    displayNameLine2: "DIAMOND BASEBALL",
    description:
      "Official home of Gonzales Diamond Baseball (DYB) in Ascension Parish.",
    siteUrl: "https://dyb.apbaseball.com",
    logoPath: "/images/dyb-logo.png",
    faviconPath: "/images/dyb-logo.png",
    colorPrimary: "#590275",
    colorPrimaryDark: "#4a0163",
    colorAccent: "#ffcb29",
    assignrSiteId: process.env.ASSIGNR_SITE_ID ?? "",
    assignrLeagueId: process.env.ASSIGNR_LEAGUE_ID ?? "515712",
  },
  ascension: {
    orgId: "ascension",
    name: "Ascension Little League",
    shortName: "Ascension LL",
    displayNameLine1: "Ascension",
    displayNameLine2: "LITTLE LEAGUE",
    description:
      "Official home of Ascension Little League Baseball in Ascension Parish.",
    siteUrl: "https://llb.apbaseball.com",
    logoPath: "/images/llb-logo.png",
    faviconPath: "/images/llb-logo.png",
    colorPrimary: "#09306a",
    colorPrimaryDark: "#072550",
    colorAccent: "#b10807",
    assignrSiteId: process.env.ASSIGNR_SITE_ID ?? "",
    assignrLeagueId: process.env.ASSIGNR_LEAGUE_ID ?? "430676",
  },
  fallball: {
    orgId: "fallball",
    name: "AP Baseball Fall Ball",
    shortName: "AP Fall Ball",
    displayNameLine1: "AP Baseball",
    displayNameLine2: "FALL BALL",
    description:
      "Fall Ball registration, teams, schedules, and league operations managed by AP Baseball.",
    siteUrl: "https://fallball.apbaseball.com",
    logoPath: "/images/fallball-ap-baseball-logo.png",
    faviconPath: "/images/ap-logo.png",
    colorPrimary: "#cc0000",
    colorPrimaryDark: "#9b0000",
    colorAccent: "#f5f5f5",
    assignrSiteId: "",
    assignrLeagueId: "",
  },
  master: {
    orgId: "master",
    name: "AP Baseball — Master Admin",
    shortName: "AP Baseball",
    displayNameLine1: "AP Baseball",
    displayNameLine2: "MASTER ADMIN",
    description: "Master admin dashboard for all AP Baseball organizations.",
    siteUrl: "https://admin.apbaseball.com",
    logoPath: "/images/ap-logo.webp",
    faviconPath: "/images/ap-logo.png",
    colorPrimary: "#cc0000",
    colorPrimaryDark: "#9b0000",
    colorAccent: "#f5f5f5",
    assignrSiteId: "",
    assignrLeagueId: "",
  },
  ladistrict2: {
    orgId: "ladistrict2",
    name: "Louisiana District 2 Little League",
    shortName: "District 2 LL",
    displayNameLine1: "District 2",
    displayNameLine2: "LITTLE LEAGUE",
    description:
      "Official tournament brackets and schedule for Louisiana District 2 Little League.",
    siteUrl: "https://district2.apbaseball.com",
    logoPath: "/images/ll-logo.png",
    faviconPath: "/images/ll-logo.png",
    colorPrimary: "#002D6D",
    colorPrimaryDark: "#001f4d",
    colorAccent: "#CC0000",
    assignrSiteId: "",
    assignrLeagueId: "",
    tournamentOnly: true,
  },
  ladistrict6: {
    orgId: "ladistrict6",
    name: "Louisiana DYB District 6",
    shortName: "District 6 DYB",
    displayNameLine1: "District 6",
    displayNameLine2: "DYB",
    description:
      "Official tournament brackets and schedule for Louisiana DYB District 6.",
    siteUrl: "https://district6.apbaseball.com",
    logoPath: "/images/dyb-district6-logo.png",
    faviconPath: "/images/dyb-district6-logo.png",
    colorPrimary: DYB_DISTRICT6_BRAND.primaryHex,
    colorPrimaryDark: DYB_DISTRICT6_BRAND.primaryDarkHex,
    colorAccent: DYB_DISTRICT6_BRAND.accentHex,
    assignrSiteId: "",
    assignrLeagueId: "",
    tournamentOnly: true,
  },
};

function isContentOrgId(
  value: string | null | undefined,
): value is ContentOrgId {
  return value === "gonzales" || value === "ascension" || value === "fallball";
}

export function isBracketOrgId(
  value: string | null | undefined,
): value is BracketOrgId {
  return (
    value === "gonzales" ||
    value === "ascension" ||
    value === "ladistrict2" ||
    value === "ladistrict6"
  );
}

export { isContentOrgId };

export function getSiteConfig(): SiteConfig {
  const orgId = (process.env.SITE_ORG ?? "gonzales") as OrgId;
  return configs[orgId] ?? configs.gonzales;
}

export function getOrgId(): OrgId {
  return getSiteConfig().orgId;
}

export function isMasterDeployment(): boolean {
  return getOrgId() === "master";
}

export function isTournamentOnlyDeployment(): boolean {
  return getSiteConfig().tournamentOnly === true;
}

export function getDefaultContentOrg(): ContentOrgId {
  const orgId = getOrgId();
  if (isContentOrgId(orgId)) return orgId;
  return "gonzales";
}

/** Returns the bracket org for this deployment, including tournament-only orgs. */
export function getBracketOrgForDeployment(): BracketOrgId {
  const orgId = getOrgId();
  if (isBracketOrgId(orgId)) return orgId;
  return "gonzales";
}

/** Primary / accent hex for this content org (tournament bracket LLBWS-style theme defaults). */
export function getContentOrgBrandColors(org: BracketOrgId): { primaryHex: string; accentHex: string } {
  const c = configs[org];
  return { primaryHex: c.colorPrimary, accentHex: c.colorAccent };
}

/** Org bucket for `RegisteredUser` rows on this deployment (matches Dugout local auth). */
export function getDugoutRegisteredUserOrgId(): ContentOrgId {
  const org = getOrgId();
  if (org === "master" || org === "ladistrict2" || org === "ladistrict6") return getDefaultContentOrg();
  return isContentOrgId(org) ? org : "gonzales";
}

export function resolveAdminTargetOrg(
  requestedOrg?: string | null,
): ContentOrgId {
  if (isMasterDeployment() && isContentOrgId(requestedOrg)) {
    return requestedOrg;
  }
  return getDefaultContentOrg();
}

/** Like resolveAdminTargetOrg but also accepts tournament-only orgs for the bracket admin. */
export function resolveBracketAdminTargetOrg(
  requestedOrg?: string | null,
): BracketOrgId {
  if (isMasterDeployment() && isBracketOrgId(requestedOrg)) {
    return requestedOrg;
  }
  return getBracketOrgForDeployment();
}

/**
 * Returns the org bucket to use for Board Room (master Dugout) posts.
 * On the master deployment this is "master"; on other deployments it
 * falls back to the site's default content org.
 */
export function resolveBoardRoomOrg(): string {
  return isMasterDeployment() ? "master" : getDefaultContentOrg();
}

/**
 * Resolves the org for dugout API routes that serve both the site Dugout
 * and the master Board Room. If the caller explicitly passes "master" as
 * the org param (sent by DugoutTimeline on the Board Room), return "master".
 * Otherwise fall back to resolveAdminTargetOrg for the content-org switcher.
 */
export function resolveDugoutApiOrg(requestedOrg?: string | null): string {
  if (requestedOrg === "master") return "master";
  return resolveAdminTargetOrg(requestedOrg);
}

export function getSiteConfigForOrg(org: OrgId): SiteConfig {
  return configs[org] ?? configs.gonzales;
}

export function getTournamentBracketBrandingForOrg(org: BracketOrgId): {
  targetLogoPath: string;
  parentLogoPath: string;
  parentName: string;
} {
  return {
    targetLogoPath: configs[org].logoPath,
    parentLogoPath: configs.master.logoPath,
    parentName: configs.master.shortName,
  };
}

/**
 * Default month/day cutoff used to derive All-Star ages by org.
 * Month is 1-based (January = 1).
 */
export function getDefaultAllStarCutoffMonthDayForOrg(
  org: ContentOrgId,
): { month: number; day: number } {
  if (org === "gonzales" || org === "fallball") {
    return { month: 4, day: 30 }; // DYB
  }
  return { month: 8, day: 31 }; // LLB
}

export function getOrgDisplayName(org: ContentOrgId): string {
  return getSiteConfigForOrg(org).shortName;
}

export function getBracketOrgDisplayName(org: BracketOrgId): string {
  return configs[org].shortName;
}

/**
 * Friendly label for raw org ids across UI surfaces.
 * Falls back to uppercase for unknown values so we never expose lowercase ids.
 */
export function formatOrganizationIdDisplay(org: string | null | undefined): string {
  if (!org) return "Global";
  if (org === "gonzales" || org === "ascension" || org === "fallball") {
    return getOrgDisplayName(org);
  }
  if (org === "ladistrict2") return configs.ladistrict2.shortName;
  if (org === "ladistrict6") return configs.ladistrict6.shortName;
  if (org === "master") return "AP Baseball Master";
  return org.trim().toUpperCase();
}

export function getAssignrLeagueId(org?: ContentOrgId): string {
  if (org) {
    return getSiteConfigForOrg(org).assignrLeagueId || "515712";
  }
  return getSiteConfig().assignrLeagueId || "515712";
}

/** Full league orgs — used by master admin for all-star, news, registration, scores, etc. */
export const CONTENT_ORGS: ContentOrgId[] = ["gonzales", "ascension", "fallball"];

/** All bracket-eligible orgs including tournament-only deployments. */
export const BRACKET_ORGS: BracketOrgId[] = [
  "gonzales",
  "ascension",
  "ladistrict2",
  "ladistrict6",
];

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

/**
 * Public origin for All-Star ballot links and redirects: league site for each
 * content org; master (admin) for anything else.
 */
export function getCanonicalBallotOriginForOrganizationId(organizationId: string): string {
  if (organizationId === "gonzales") {
    return stripTrailingSlash(configs.gonzales.siteUrl);
  }
  if (organizationId === "ascension") {
    return stripTrailingSlash(configs.ascension.siteUrl);
  }
  if (organizationId === "fallball") {
    return stripTrailingSlash(configs.fallball.siteUrl);
  }
  return stripTrailingSlash(configs.master.siteUrl);
}

const FALLBALL_DISABLED_ADMIN_MODULES = new Set([
  "ALL_STAR_VAULT",
  "ALL_STAR_PAYMENTS",
  "SPONSORS",
  "TOURNAMENT_BRACKETS",
]);

const FALLBALL_DISABLED_PUBLIC_NAV = new Set(["all-stars", "tournaments"]);

export function isAdminModuleEnabledForOrg(
  org: ContentOrgId | null | undefined,
  module: string,
): boolean {
  if (org === "fallball" && FALLBALL_DISABLED_ADMIN_MODULES.has(module)) {
    return false;
  }
  return true;
}

export function isPublicNavEnabledForOrg(
  org: OrgId | string | null | undefined,
  navKey: string,
): boolean {
  if (org === "fallball" && FALLBALL_DISABLED_PUBLIC_NAV.has(navKey)) {
    return false;
  }
  return true;
}

/** Skip cross-domain ballot redirect (local dev / Vercel preview). */
export function shouldSkipBallotCanonicalHostRedirect(hostname: string): boolean {
  const h = hostname.toLowerCase().split(":")[0] ?? "";
  if (h === "localhost" || h.startsWith("127.")) return true;
  if (h.endsWith(".vercel.app")) return true;
  return false;
}
