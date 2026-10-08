import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";
import { isScoreEntryPark } from "@/lib/schedule/scoreableGames";
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
  /** Schedule park name. Null when the game has no park row. */
  parkName: string | null;
};

export type PostedLeagueScoreWrite =
  | { ok: true; organizationId: ContentOrgId }
  | { ok: false; error: "not_found" | "not_posted" | "denied" | "not_score_park" };

const LEAGUE_SCORE_WRITE_HTTP = {
  not_found: { status: 404, error: "Posted game not found." },
  not_posted: { status: 403, error: "Only posted games can be scored." },
  denied: { status: 403, error: PARK_DIRECTOR_WRITE_DENIED },
  not_score_park: { status: 403, error: "Scores aren't entered for this park." },
} as const;

/** Status and message for a refused league score write. */
export function leagueScoreWriteHttpError(
  error: Exclude<PostedLeagueScoreWrite, { ok: true }>["error"],
): { status: number; error: string } {
  return LEAGUE_SCORE_WRITE_HTTP[error];
}

/**
 * League score writes use the schedule row's organization.
 * Same-league Game Day roles keep the unlinked-park and no-assignment rules.
 * Anyone without Game Day on the game's league must match an assigned venue.
 * A park that does not take scores is refused for every caller, including a master admin.
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
  if (!isScoreEntryPark(input.game.parkName)) {
    return { ok: false, error: "not_score_park" };
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
