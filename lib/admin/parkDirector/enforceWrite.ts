import type { AdminRole } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import prisma from "@/lib/prisma";
import { isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";

import {
  allowedScheduleGameIds,
  decideParkDirectorGameWrite,
  PARK_DIRECTOR_WRITE_DENIED,
  leagueScoreWriteHttpError,
  postedLeagueScoreTarget,
} from "@/lib/admin/parkDirector/writeAccess";

export { PARK_DIRECTOR_WRITE_DENIED };

const MAX_GAME_IDS = 2000;

/** Active venue ids, or "unrestricted" when the venue check does not apply. */
export async function parkDirectorActiveVenueIds(input: {
  adminUserId: string;
  isMaster: boolean;
  role: AdminRole | null;
}): Promise<readonly string[] | "unrestricted"> {
  if (input.isMaster || input.role !== "PARK_DIRECTOR") return "unrestricted";
  const assignments = await prisma.parkDirectorAssignment.findMany({
    where: { adminUserId: input.adminUserId, active: true },
    select: { venueId: true },
  });
  if (assignments.length === 0) return "unrestricted";
  return assignments.map((row) => row.venueId);
}

/**
 * Schedule games this caller may write.
 * "unrestricted" means the venue check does not apply: the caller is not a
 * park director, or the director has no active park assignments yet.
 * Games missing from the returned set are not at an assigned venue.
 * A park with a null venueId is included when the role is on the game's own league.
 */
export async function parkDirectorAllowedScheduleGameIds(input: {
  adminUserId: string;
  isMaster: boolean;
  role: AdminRole | null;
  scheduleDraftGameIds: readonly string[];
}): Promise<ReadonlySet<string> | "unrestricted"> {
  const activeVenueIds = await parkDirectorActiveVenueIds(input);
  if (activeVenueIds === "unrestricted") return "unrestricted";

  const ids = [...new Set(input.scheduleDraftGameIds.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    MAX_GAME_IDS,
  );
  if (ids.length === 0) return new Set();

  const games = await prisma.scheduleDraftGame.findMany({
    where: { id: { in: ids } },
    select: { id: true, park: { select: { venueId: true } } },
  });
  return allowedScheduleGameIds({
    isMaster: false,
    role: "PARK_DIRECTOR",
    activeVenueIds,
    games: games.map((game) => ({ id: game.id, venueId: game.park?.venueId ?? null })),
  });
}

/** Null when the write may proceed. A sentence when it must stop. */
export async function parkDirectorScheduleGameWriteError(input: {
  adminUserId: string;
  isMaster: boolean;
  role: AdminRole | null;
  scheduleDraftGameId: string;
  /**
   * False when the caller has no Game Day role on the game's own league.
   * That path allows a write only when the park venue is an active assignment.
   */
  roleOnGameLeague?: boolean;
}): Promise<string | null> {
  if (input.roleOnGameLeague === false) {
    const id = input.scheduleDraftGameId.trim();
    const [game, assignments] = await Promise.all([
      id
        ? prisma.scheduleDraftGame.findUnique({
            where: { id },
            select: { park: { select: { venueId: true } } },
          })
        : Promise.resolve(null),
      prisma.parkDirectorAssignment.findMany({
        where: { adminUserId: input.adminUserId, active: true },
        select: { venueId: true },
      }),
    ]);
    const decision = decideParkDirectorGameWrite({
      isMaster: false,
      role: "PARK_DIRECTOR",
      activeVenueIds: assignments.map((row) => row.venueId),
      park: game ? { venueId: game.park?.venueId ?? null } : null,
      roleOnGameLeague: false,
    });
    return decision.allowed ? null : PARK_DIRECTOR_WRITE_DENIED;
  }
  const allowed = await parkDirectorAllowedScheduleGameIds({
    adminUserId: input.adminUserId,
    isMaster: input.isMaster,
    role: input.role,
    scheduleDraftGameIds: [input.scheduleDraftGameId],
  });
  if (allowed === "unrestricted" || allowed.has(input.scheduleDraftGameId)) return null;
  return PARK_DIRECTOR_WRITE_DENIED;
}

/**
 * Load one posted schedule game and decide whether this caller may score it.
 * GameScore.organizationId comes from the row, never from the client body.
 * A park that does not take scores is refused for every caller, including a master admin.
 */
export async function resolvePostedLeagueScoreWrite(input: {
  adminUserId: string;
  isMaster: boolean;
  matchId: string;
}): Promise<{ ok: true; organizationId: ContentOrgId } | { ok: false; status: number; error: string }> {
  const id = input.matchId.trim();
  const game = id
    ? await prisma.scheduleDraftGame.findUnique({
        where: { id },
        select: {
          organizationId: true,
          status: true,
          park: { select: { venueId: true, name: true } },
        },
      })
    : null;
  const gameOrg = game && isContentOrgId(game.organizationId) ? game.organizationId : null;
  const roleOnGameOrg = gameOrg
    ? await getEffectiveAdminRoleForOrg(input.adminUserId, input.isMaster, gameOrg)
    : null;
  const assignments = await prisma.parkDirectorAssignment.findMany({
    where: { adminUserId: input.adminUserId, active: true },
    select: { venueId: true },
  });
  const target = postedLeagueScoreTarget({
    isMaster: input.isMaster,
    roleOnGameOrg,
    activeVenueIds: assignments.map((row) => row.venueId),
    game: game
      ? {
          organizationId: game.organizationId,
          status: game.status,
          venueId: game.park?.venueId ?? null,
          parkName: game.park?.name ?? null,
        }
      : null,
  });
  if (!target.ok) return { ok: false, ...leagueScoreWriteHttpError(target.error) };
  return target;
}
