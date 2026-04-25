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

export function getOrgDisplayName(org: ContentOrgId): string {
  return getSiteConfigForOrg(org).shortName;
}

function parseMasterAdminAllowlist(): Set<string> {
  const raw = process.env.MASTER_ADMIN_ALLOWLIST ?? "";
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isMasterAdminEmailAllowed(email: string): boolean {
  if (!isMasterDeployment()) return true;

  const normalized = email.trim().toLowerCase();
  const allowlist = parseMasterAdminAllowlist();

  // Fail closed on master if no allowlist is configured.
  if (allowlist.size === 0) return false;
  return allowlist.has(normalized);
}

export function getAssignrLeagueId(org?: ContentOrgId): string {
  if (org) {
    return getSiteConfigForOrg(org).assignrLeagueId || "515712";
  }
  return getSiteConfig().assignrLeagueId || "515712";
}

/** All org IDs except master — used by master admin to enumerate orgs */
export const CONTENT_ORGS: ContentOrgId[] = ["gonzales", "ascension"];
