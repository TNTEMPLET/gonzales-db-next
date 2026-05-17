export type OrgId = "gonzales" | "ascension" | "master";
export type ContentOrgId = "gonzales" | "ascension";

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
};

function isContentOrgId(
  value: string | null | undefined,
): value is ContentOrgId {
  return value === "gonzales" || value === "ascension";
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

export function getDefaultContentOrg(): ContentOrgId {
  return getOrgId() === "ascension" ? "ascension" : "gonzales";
}

/** Primary / accent hex for this content org (tournament bracket LLBWS-style theme defaults). */
export function getContentOrgBrandColors(org: ContentOrgId): { primaryHex: string; accentHex: string } {
  const c = configs[org];
  return { primaryHex: c.colorPrimary, accentHex: c.colorAccent };
}

/** Org bucket for `RegisteredUser` rows on this deployment (matches Dugout local auth). */
export function getDugoutRegisteredUserOrgId(): ContentOrgId {
  const org = getOrgId();
  return org === "master" ? getDefaultContentOrg() : (org as ContentOrgId);
}

export function resolveAdminTargetOrg(
  requestedOrg?: string | null,
): ContentOrgId {
  if (isMasterDeployment() && isContentOrgId(requestedOrg)) {
    return requestedOrg;
  }
  return getDefaultContentOrg();
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

export function getSiteConfigForOrg(org: ContentOrgId): SiteConfig {
  return configs[org];
}

export function getTournamentBracketBrandingForOrg(org: ContentOrgId): {
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
  if (org === "gonzales") {
    return { month: 4, day: 30 }; // DYB
  }
  return { month: 8, day: 31 }; // LLB
}

export function getOrgDisplayName(org: ContentOrgId): string {
  return getSiteConfigForOrg(org).shortName;
}

/**
 * Friendly label for raw org ids across UI surfaces.
 * Falls back to uppercase for unknown values so we never expose lowercase ids.
 */
export function formatOrganizationIdDisplay(org: string | null | undefined): string {
  if (!org) return "Global";
  if (org === "gonzales" || org === "ascension") {
    return getOrgDisplayName(org);
  }
  if (org === "master") return "AP Baseball Master";
  return org.trim().toUpperCase();
}

export function getAssignrLeagueId(org?: ContentOrgId): string {
  if (org) {
    return getSiteConfigForOrg(org).assignrLeagueId || "515712";
  }
  return getSiteConfig().assignrLeagueId || "515712";
}

/** All org IDs except master — used by master admin to enumerate orgs */
export const CONTENT_ORGS: ContentOrgId[] = ["gonzales", "ascension"];

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
  return stripTrailingSlash(configs.master.siteUrl);
}

/** Skip cross-domain ballot redirect (local dev / Vercel preview). */
export function shouldSkipBallotCanonicalHostRedirect(hostname: string): boolean {
  const h = hostname.toLowerCase().split(":")[0] ?? "";
  if (h === "localhost" || h.startsWith("127.")) return true;
  if (h.endsWith(".vercel.app")) return true;
  return false;
}
