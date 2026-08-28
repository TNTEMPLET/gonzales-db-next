import {
  getSiteConfig,
  getSiteConfigForOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

/** Shared AP Baseball Assignr site. Programs are selected via league IDs. */
export const DEFAULT_ASSIGNR_SITE_ID = "18601";

export function getAssignrTokenBaseUrl() {
  return process.env.ASSIGNR_TOKEN_BASE || "https://app.assignr.com";
}

export function getAssignrApiBaseUrl() {
  return process.env.ASSIGNR_API_BASE || "https://api.assignr.com";
}

export function getAssignrOAuthScope() {
  return process.env.ASSIGNR_OAUTH_SCOPE || "read write";
}

/**
 * Resolve Assignr site id.
 * Prefer org/deployment config, then env, then the shared AP Baseball site (18601).
 * League IDs (not site ids) differentiate Fall Ball / DYB / LLB.
 */
export function getAssignrSiteId(org?: ContentOrgId) {
  const fromOrg = org
    ? getSiteConfigForOrg(org).assignrSiteId
    : getSiteConfig().assignrSiteId;
  return (fromOrg || process.env.ASSIGNR_SITE_ID || DEFAULT_ASSIGNR_SITE_ID).trim();
}

export function getAssignrLeagueIdForOrg(org: ContentOrgId) {
  const fromOrg = (getSiteConfigForOrg(org).assignrLeagueId ?? "").trim();
  if (fromOrg) return fromOrg;
  // Fall Ball must not inherit a shared ASSIGNR_LEAGUE_ID from spring deploys.
  if (org === "fallball") return "";
  return (process.env.ASSIGNR_LEAGUE_ID ?? "").trim();
}

export function getAssignrSiteIdForCurrentDeployment() {
  return getAssignrSiteId();
}
