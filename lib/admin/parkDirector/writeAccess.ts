import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";
import { isContentOrgId, type ContentOrgId } from "@/lib/siteConfig";

export const PARK_DIRECTOR_WRITE_DENIED = "That game is not at one of your parks.";

/**
 * Why a game-day write was allowed or refused.
 *
 * Higher roles (board member, admin, master admin) are never limited by park
 * assignment when that role is on the game's own league. A park director with
 * no active assignments keeps today's access on that same league. A posted game
 * whose league park has no Venue yet also keeps today's access on that league.
 *
 * A caller with no Game Day role on the game's league may write only when the
 * park's venue id is one of their active assignments. An unlinked park
 * (null venueId) is refused on that path.
 */
export type ParkDirectorWriteReason =
  | "not_park_director"
  | "no_assignments"
  | "park_unlinked"
  | "assigned_venue"
  | "other_venue"
  | "game_not_found";

export type ParkDirectorWriteDecision = {
  allowed: boolean;
  reason: ParkDirectorWriteReason;
};

export function decideParkDirectorGameWrite(input: {
  isMaster: boolean;
  role: AdminRole | null;
  /** Active assignment venue ids only. An empty list means no assignments yet. */
  activeVenueIds: readonly string[];
  /**
   * null when the schedule game row does not exist.
   * venueId null when the game has no park, or the park is not linked to a Venue.
   */
  park: { venueId: string | null } | null;
  /**
   * False when this caller has no Game Day role on the game's own league.
   * Defaults to the same-league rules.
   */
  roleOnGameLeague?: boolean;
}): ParkDirectorWriteDecision {
  if (input.roleOnGameLeague === false) {
    if (!input.park) return { allowed: false, reason: "game_not_found" };
    if (!input.park.venueId) return { allowed: false, reason: "park_unlinked" };
    if (input.activeVenueIds.includes(input.park.venueId)) {
      return { allowed: true, reason: "assigned_venue" };
    }
    return { allowed: false, reason: "other_venue" };
  }
  if (input.isMaster || input.role !== "PARK_DIRECTOR") {
    return { allowed: true, reason: "not_park_director" };
  }
  if (input.activeVenueIds.length === 0) {
    return { allowed: true, reason: "no_assignments" };
  }
  if (!input.park) {
    return { allowed: false, reason: "game_not_found" };
  }
  if (!input.park.venueId) {
    return { allowed: true, reason: "park_unlinked" };
  }
  if (input.activeVenueIds.includes(input.park.venueId)) {
    return { allowed: true, reason: "assigned_venue" };
  }
  return { allowed: false, reason: "other_venue" };
}

/** Ids the director may write, or "unrestricted" when the venue check does not apply. */
export function allowedScheduleGameIds(input: {
  isMaster: boolean;
  role: AdminRole | null;
  activeVenueIds: readonly string[];
  games: readonly { id: string; venueId: string | null; roleOnGameLeague?: boolean }[];
}): ReadonlySet<string> | "unrestricted" {
  const crossesLeague = input.games.some((game) => game.roleOnGameLeague === false);
  if (
    !crossesLeague &&
    (input.isMaster || input.role !== "PARK_DIRECTOR" || input.activeVenueIds.length === 0)
  ) {
    return "unrestricted";
  }
  const allowed = new Set<string>();
  for (const game of input.games) {
    const decision = decideParkDirectorGameWrite({
      isMaster: input.isMaster,
      role: input.role,
      activeVenueIds: input.activeVenueIds,
      park: { venueId: game.venueId },
      roleOnGameLeague: game.roleOnGameLeague,
    });
    if (decision.allowed) allowed.add(game.id);
  }
  return allowed;
}

export type PostedLeagueScoreGame = {
  organizationId: string;
  status: string;
  venueId: string | null;
};

export type PostedLeagueScoreWrite =
  | { ok: true; organizationId: ContentOrgId }
  | { ok: false; error: "not_found" | "not_posted" | "denied" };

/**
 * League score writes use the schedule row's organization.
 * Same-league Game Day roles keep the unlinked-park and no-assignment rules.
 * Anyone without Game Day on the game's league must match an assigned venue.
 */
export function postedLeagueScoreTarget(input: {
  isMaster: boolean;
  roleOnGameOrg: AdminRole | null;
  activeVenueIds: readonly string[];
  game: PostedLeagueScoreGame | null;
}): PostedLeagueScoreWrite {
  if (!input.game || !isContentOrgId(input.game.organizationId)) {
    return { ok: false, error: "not_found" };
  }
  if (input.game.status !== "LOCKED" && input.game.status !== "EXPORTED") {
    return { ok: false, error: "not_posted" };
  }
  const onLeague =
    input.isMaster ||
    Boolean(input.roleOnGameOrg && canAccessAdminModule(input.roleOnGameOrg, "GAME_DAY"));
  if (
    onLeague &&
    (input.isMaster || input.roleOnGameOrg !== "PARK_DIRECTOR" || input.activeVenueIds.length === 0)
  ) {
    return { ok: true, organizationId: input.game.organizationId };
  }
  const decision = decideParkDirectorGameWrite({
    isMaster: false,
    role: "PARK_DIRECTOR",
    activeVenueIds: input.activeVenueIds,
    park: { venueId: input.game.venueId },
    roleOnGameLeague: onLeague,
  });
  if (!decision.allowed) return { ok: false, error: "denied" };
  return { ok: true, organizationId: input.game.organizationId };
}
