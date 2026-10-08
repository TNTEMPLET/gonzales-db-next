import "server-only";

import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import type { AdminRole } from "@/lib/auth/adminRoles";
import {
  CONTENT_ORGS,
  getDefaultContentOrg,
  isMasterDeployment,
  type ContentOrgId,
} from "@/lib/siteConfig";

import { gameDayHomePath, landsOnGameDay, orgFromAdminNext, pathAfterAdminLogin } from "@/lib/admin/gameDay/landing";

export async function rolesOnThisSite(
  adminUserId: string,
  isMaster: boolean,
): Promise<(AdminRole | null)[]> {
  if (isMaster) return ["MASTER_ADMIN"];
  const orgs: ContentOrgId[] = isMasterDeployment() ? [...CONTENT_ORGS] : [getDefaultContentOrg()];
  return Promise.all(orgs.map((orgId) => getEffectiveAdminRoleForOrg(adminUserId, false, orgId)));
}

export async function viewerLandsOnGameDay(user: { id: string; isMaster: boolean }): Promise<boolean> {
  const roles = await rolesOnThisSite(user.id, user.isMaster);
  return landsOnGameDay({ isMaster: user.isMaster, rolesOnSite: roles });
}

export async function redirectPathAfterAdminLogin(input: {
  adminUserId: string;
  isMaster: boolean;
  nextPath: string;
}): Promise<string> {
  const lands = await viewerLandsOnGameDay({ id: input.adminUserId, isMaster: input.isMaster });
  const org = orgFromAdminNext(input.nextPath) ?? (isMasterDeployment() ? null : getDefaultContentOrg());
  return pathAfterAdminLogin({ nextPath: input.nextPath, landsOnGameDay: lands, org });
}

export { gameDayHomePath };
