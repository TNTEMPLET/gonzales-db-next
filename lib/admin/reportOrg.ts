import {
  getDefaultContentOrg,
  isMasterDeployment,
  type ContentOrgId,
} from "@/lib/siteConfig";

export function parseReportContentOrg(value: string | null | undefined): ContentOrgId | null {
  if (value === "gonzales" || value === "ascension" || value === "fallball") return value;
  return null;
}

/** Financial reports must name Gonzales, Ascension, or Fall Ball — never All Sites. */
export function requireReportContentOrg(value: string | null | undefined): ContentOrgId {
  const parsed = parseReportContentOrg(value);
  if (parsed) return parsed;
  if (!isMasterDeployment()) return getDefaultContentOrg();
  throw new Error("Pick Gonzales, Ascension, or Fall Ball for this report");
}

export function isAllSitesReportRequest(value: string | null | undefined): boolean {
  return isMasterDeployment() && value === "all";
}
