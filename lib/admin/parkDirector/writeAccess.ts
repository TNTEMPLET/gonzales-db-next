import type { AdminRole } from "@/lib/auth/adminRoles";

/**
 * Why a game-day write was allowed or refused.
 *
 * Higher roles (board member, admin, master admin) are never limited by park
 * assignment. A park director with no active assignments keeps today's access.
 * A posted game whose league park has no Venue yet also keeps today's access,
 * so unlinked parks still work until Trent links them on the Parks screen.
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
}): ParkDirectorWriteDecision {
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
  games: readonly { id: string; venueId: string | null }[];
}): ReadonlySet<string> | "unrestricted" {
  if (input.isMaster || input.role !== "PARK_DIRECTOR" || input.activeVenueIds.length === 0) {
    return "unrestricted";
  }
  const allowed = new Set<string>();
  for (const game of input.games) {
    const decision = decideParkDirectorGameWrite({
      isMaster: false,
      role: "PARK_DIRECTOR",
      activeVenueIds: input.activeVenueIds,
      park: { venueId: game.venueId },
    });
    if (decision.allowed) allowed.add(game.id);
  }
  return allowed;
}
