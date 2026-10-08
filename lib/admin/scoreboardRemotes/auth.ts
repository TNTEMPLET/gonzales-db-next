import "server-only";

import type { NextRequest } from "next/server";

import { fieldDeskAuthRole } from "@/lib/admin/gameDay/authRole";
import { landsOnGameDay } from "@/lib/admin/gameDay/landing";
import { rolesOnThisSite } from "@/lib/admin/gameDay/session";
import { parkDirectorScheduleGameWriteError } from "@/lib/admin/parkDirector/enforceWrite";
import {
  remoteInventoryScope,
  type RemoteInventoryScope,
} from "@/lib/admin/scoreboardRemotes/access";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
  getAdminUserFromRequest,
  type AdminSessionUser,
} from "@/lib/auth/adminSession";
import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { resolveAuthOrganizationId } from "@/lib/auth/orgAdminContext";
import prisma from "@/lib/prisma";
import { getDefaultContentOrg, isContentOrgId, isMasterDeployment, type ContentOrgId } from "@/lib/siteConfig";
import { cookies } from "next/headers";

export type RemoteActor = {
  admin: AdminSessionUser;
  orgId: ContentOrgId;
  role: AdminRole | null;
  scope: RemoteInventoryScope;
  leagueVenueIds: string[];
  assignedVenueIds: string[];
};

export async function remoteActorFromCookies(orgId: ContentOrgId): Promise<RemoteActor | null> {
  const admin = await getAdminUserFromCookieToken((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
  if (!admin) return null;
  return loadRemoteActor(admin, orgId);
}

export async function remoteActorFromRequest(
  request: NextRequest,
): Promise<{ ok: true; actor: RemoteActor } | { ok: false; status: number; error: string }> {
  const admin = await getAdminUserFromRequest(request);
  if (!admin) return { ok: false, status: 401, error: "Unauthorized" };
  const orgId = resolveAuthOrganizationId(request);
  const actor = await loadRemoteActor(admin, orgId);
  if (!actor) return { ok: false, status: 403, error: "You cannot manage remotes for this league." };
  return { ok: true, actor };
}

export async function loadRemoteActor(
  admin: AdminSessionUser,
  orgId: ContentOrgId,
): Promise<RemoteActor | null> {
  const role = await getEffectiveAdminRoleForOrg(admin.id, admin.isMaster, orgId);
  if (!admin.isMaster && (!role || !canAccessAdminModule(role, "GAME_DAY"))) return null;
  const [parks, assignments] = await Promise.all([
    prisma.schedulePark.findMany({
      where: { organizationId: orgId, venueId: { not: null } },
      select: { venueId: true },
    }),
    prisma.parkDirectorAssignment.findMany({
      where: { adminUserId: admin.id, active: true },
      select: { venueId: true },
    }),
  ]);
  const leagueVenueIds = [
    ...new Set(parks.map((park) => park.venueId).filter((id): id is string => Boolean(id))),
  ];
  const assignedVenueIds = assignments.map((row) => row.venueId);
  const scope = remoteInventoryScope({
    isMaster: admin.isMaster,
    role,
    leagueVenueIds,
    assignedVenueIds,
  });
  if (!scope) return null;
  return { admin, orgId, role, scope, leagueVenueIds, assignedVenueIds };
}

/**
 * Same write gate as scores and the old field desk.
 * Same-league Game Day role, or a park director whose assigned venue matches.
 */
export async function authorizeRemoteGameWrite(
  admin: AdminSessionUser,
  gameId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const id = gameId.trim();
  const game = id
    ? await prisma.scheduleDraftGame.findUnique({
        where: { id },
        select: { id: true, organizationId: true, status: true },
      })
    : null;
  if (!game || !isContentOrgId(game.organizationId)) {
    return { ok: false, status: 404, error: "Posted game not found." };
  }
  if (game.status !== "LOCKED" && game.status !== "EXPORTED") {
    return { ok: false, status: 403, error: "Only posted games can take a remote." };
  }

  const roleOnGameOrg = await getEffectiveAdminRoleForOrg(admin.id, admin.isMaster, game.organizationId);
  const onLeague = Boolean(roleOnGameOrg && canAccessAdminModule(roleOnGameOrg, "GAME_DAY"));
  let role: AdminRole | null = onLeague ? roleOnGameOrg : null;
  let roleOnGameLeague = onLeague;

  if (!onLeague && !admin.isMaster) {
    let siteRole: AdminRole | null = null;
    if (isMasterDeployment()) {
      const roles = await rolesOnThisSite(admin.id, false);
      siteRole = landsOnGameDay({ isMaster: false, rolesOnSite: roles }) ? "PARK_DIRECTOR" : null;
    } else {
      siteRole = await getEffectiveAdminRoleForOrg(admin.id, false, getDefaultContentOrg());
    }
    const assignmentCount =
      siteRole === "PARK_DIRECTOR"
        ? await prisma.parkDirectorAssignment.count({
            where: { adminUserId: admin.id, active: true },
          })
        : 0;
    role = fieldDeskAuthRole({
      roleOnGameOrg,
      siteRole,
      hasActiveAssignments: assignmentCount > 0,
    });
    roleOnGameLeague = false;
  }

  if (!admin.isMaster && !role) {
    return { ok: false, status: 403, error: "You cannot change remotes for this league." };
  }

  const error = await parkDirectorScheduleGameWriteError({
    adminUserId: admin.id,
    isMaster: admin.isMaster,
    role: admin.isMaster ? "MASTER_ADMIN" : role,
    scheduleDraftGameId: game.id,
    roleOnGameLeague: admin.isMaster ? true : roleOnGameLeague,
  });
  if (error) return { ok: false, status: 403, error };
  return { ok: true };
}
