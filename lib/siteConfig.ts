export type OrgId = "gonzales" | "ascension" | "master";

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
    assignrLeagueId: "515712",
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
    // TODO: Replace with Ascension LL Assignr credentials once available
    assignrSiteId: process.env.ASCENSION_ASSIGNR_SITE_ID ?? "",
    assignrLeagueId: process.env.ASCENSION_ASSIGNR_LEAGUE_ID ?? "",
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

export function getSiteConfig(): SiteConfig {
  const orgId = (process.env.SITE_ORG ?? "gonzales") as OrgId;
  return configs[orgId] ?? configs.gonzales;
}

export function getOrgId(): OrgId {
  return getSiteConfig().orgId;
}

/** All org IDs except master — used by master admin to enumerate orgs */
export const CONTENT_ORGS: OrgId[] = ["gonzales", "ascension"];
