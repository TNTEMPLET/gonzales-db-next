import type { AdminRole } from "@/lib/auth/adminRoles";

/**
 * Who may change remote inventory.
 *
 * Master admin: every park.
 * League admin: venues linked from the current league's parks, not every park.
 * Park director: active assignments only. No assignment means no inventory edits.
 * Board member: look only. Game Day checkout still follows the slice 7 write rules.
 */
export type RemoteInventoryScope =
  | { kind: "all"; canWrite: true }
  | { kind: "venues"; venueIds: readonly string[]; canWrite: boolean };

export type RemoteInventoryWriteReason =
  | "all"
  | "league"
  | "assigned"
  | "read_only"
  | "other_venue"
  | "unassigned_director"
  | "no_role";

export function remoteInventoryScope(input: {
  isMaster: boolean;
  role: AdminRole | null;
  leagueVenueIds: readonly string[];
  assignedVenueIds: readonly string[];
}): RemoteInventoryScope | null {
  if (input.isMaster || input.role === "MASTER_ADMIN") {
    return { kind: "all", canWrite: true };
  }
  if (input.role === "ADMIN") {
    return { kind: "venues", venueIds: input.leagueVenueIds, canWrite: true };
  }
  if (input.role === "PARK_DIRECTOR") {
    return { kind: "venues", venueIds: input.assignedVenueIds, canWrite: true };
  }
  if (input.role === "BOARD_MEMBER") {
    return { kind: "venues", venueIds: input.leagueVenueIds, canWrite: false };
  }
  return null;
}

export function decideRemoteInventoryWrite(input: {
  isMaster: boolean;
  role: AdminRole | null;
  venueId: string;
  leagueVenueIds: readonly string[];
  assignedVenueIds: readonly string[];
}): { allowed: boolean; reason: RemoteInventoryWriteReason } {
  const scope = remoteInventoryScope(input);
  if (!scope) return { allowed: false, reason: "no_role" };
  if (!scope.canWrite) return { allowed: false, reason: "read_only" };
  if (scope.kind === "all") return { allowed: true, reason: "all" };
  if (scope.venueIds.includes(input.venueId)) {
    return { allowed: true, reason: input.role === "PARK_DIRECTOR" ? "assigned" : "league" };
  }
  if (input.role === "PARK_DIRECTOR" && input.assignedVenueIds.length === 0) {
    return { allowed: false, reason: "unassigned_director" };
  }
  return { allowed: false, reason: "other_venue" };
}

export function venueVisible(scope: RemoteInventoryScope, venueId: string): boolean {
  if (scope.kind === "all") return true;
  return scope.venueIds.includes(venueId);
}
