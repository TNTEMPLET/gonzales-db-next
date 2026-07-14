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
  const fromOrg = (getSiteConfigForOrg(org).assignrLeagueId ?? "").trim();
  if (fromOrg) return fromOrg;
  // Fall Ball must not inherit a shared ASSIGNR_LEAGUE_ID from spring deploys.
  if (org === "fallball") return "";
  return (process.env.ASSIGNR_LEAGUE_ID ?? "").trim();
}

export function getAssignrSiteIdForCurrentDeployment() {
  return getSiteConfig().assignrSiteId || process.env.ASSIGNR_SITE_ID || "";
}
