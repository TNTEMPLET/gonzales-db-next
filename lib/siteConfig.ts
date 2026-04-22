export type OrgId = "gonzales" | "ascension" | "master";
export type ContentOrgId = "gonzales" | "ascension";

export interface SiteConfig {
  orgId: OrgId;
  name: string;
  shortName: string;
  description: string;
  siteUrl: string;
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
    description:
      "Official home of Gonzales Diamond Baseball (DYB) in Ascension Parish.",
    siteUrl: "https://dyb.apbaseball.com",
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
    description:
      "Official home of Ascension Little League Baseball in Ascension Parish.",
    siteUrl: "https://llb.apbaseball.com",
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
    description: "Master admin dashboard for all AP Baseball organizations.",
    siteUrl: "https://admin.apbaseball.com",
    colorPrimary: "#1a1a2e",
    colorPrimaryDark: "#12121f",
    colorAccent: "#ffcb29",
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

export function getSiteConfigForOrg(org: ContentOrgId): SiteConfig {
  return configs[org];
}

export function getAssignrLeagueId(org?: ContentOrgId): string {
  if (org) {
    return getSiteConfigForOrg(org).assignrLeagueId || "515712";
  }
  return getSiteConfig().assignrLeagueId || "515712";
}

/** All org IDs except master — used by master admin to enumerate orgs */
export const CONTENT_ORGS: ContentOrgId[] = ["gonzales", "ascension"];
