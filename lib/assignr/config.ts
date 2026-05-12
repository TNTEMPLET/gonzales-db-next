import {
  getSiteConfig,
  getSiteConfigForOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

export function getAssignrTokenBaseUrl() {
  return process.env.ASSIGNR_TOKEN_BASE || "https://app.assignr.com";
}

export function getAssignrApiBaseUrl() {
  return process.env.ASSIGNR_API_BASE || "https://api.assignr.com";
}

export function getAssignrOAuthScope() {
  return process.env.ASSIGNR_OAUTH_SCOPE || "read write";
}

export function getAssignrSiteId(org?: ContentOrgId) {
  const fromOrg = org ? getSiteConfigForOrg(org).assignrSiteId : "";
  return fromOrg || process.env.ASSIGNR_SITE_ID || "";
}

export function getAssignrLeagueIdForOrg(org: ContentOrgId) {
  return getSiteConfigForOrg(org).assignrLeagueId || process.env.ASSIGNR_LEAGUE_ID || "";
}

export function getAssignrSiteIdForCurrentDeployment() {
  return getSiteConfig().assignrSiteId || process.env.ASSIGNR_SITE_ID || "";
}
