import {
  isMasterDeployment,
  resolveAdminTargetOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

/** Directory scope: a single org, or the master-only aggregate across every org. */
export type AdminUsersScope = ContentOrgId | "all";

/**
 * Resolves the Users directory scope for a request. "all" is only ever returned
 * for Master Admins on the master deployment with an explicit `?org=all` — every
 * other case (non-master, non-master-deployment, missing/invalid org) falls back
 * to the normal single-org resolution.
 */
export function resolveAdminUsersScope(
  requestedOrg: string | null | undefined,
  isMaster: boolean,
): AdminUsersScope {
  if (isMasterDeployment() && isMaster && requestedOrg === "all") {
    return "all";
  }
  return resolveAdminTargetOrg(requestedOrg);
}

export function isAllSitesUsersScope(
  scope: AdminUsersScope,
): scope is "all" {
  return scope === "all";
}
