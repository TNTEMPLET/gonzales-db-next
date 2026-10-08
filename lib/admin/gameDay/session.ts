import "server-only";

import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import type { AdminRole } from "@/lib/auth/adminRoles";
import {
  CONTENT_ORGS,
  getDefaultContentOrg,
  isMasterDeployment,
  type ContentOrgId,
} from "@/lib/siteConfig";

import { mayLoadLeagueGameDay } from "@/lib/admin/gameDay/parks";
import {
  directorGameDayOrg,
  gameDayHomePath,
  isDefaultAdminHome,
  landsOnGameDay,
  orgFromAdminNext,
  pathAfterAdminLogin,
} from "@/lib/admin/gameDay/landing";

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

/** Content orgs where this user has Game Day. Masters are not listed here. */
export async function gameDayMembershipOrgs(adminUserId: string): Promise<ContentOrgId[]> {
  const orgs: ContentOrgId[] = isMasterDeployment() ? [...CONTENT_ORGS] : [getDefaultContentOrg()];
  const membership: ContentOrgId[] = [];
  for (const orgId of orgs) {
    const role = await getEffectiveAdminRoleForOrg(adminUserId, false, orgId);
    if (mayLoadLeagueGameDay(role)) membership.push(orgId);
  }
  return membership;
}

export async function redirectPathAfterAdminLogin(input: {
  adminUserId: string;
  isMaster: boolean;
  nextPath: string;
}): Promise<string> {
  const lands = await viewerLandsOnGameDay({ id: input.adminUserId, isMaster: input.isMaster });
  if (!lands || !isDefaultAdminHome(input.nextPath)) return input.nextPath;
  const org = isMasterDeployment()
    ? directorGameDayOrg({
        requestedOrg: orgFromAdminNext(input.nextPath),
        membershipOrgs: await gameDayMembershipOrgs(input.adminUserId),
      })
    : getDefaultContentOrg();
  return pathAfterAdminLogin({ nextPath: input.nextPath, landsOnGameDay: true, org });
}

export { gameDayHomePath };
