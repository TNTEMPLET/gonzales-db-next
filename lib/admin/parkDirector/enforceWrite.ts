import type { AdminRole } from "@/lib/auth/adminRoles";
import prisma from "@/lib/prisma";

import { allowedScheduleGameIds } from "@/lib/admin/parkDirector/writeAccess";

export const PARK_DIRECTOR_WRITE_DENIED = "That game is not at one of your parks.";

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
 * A park with a null venueId is included (unlinked-park fallback).
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
}): Promise<string | null> {
  const allowed = await parkDirectorAllowedScheduleGameIds({
    adminUserId: input.adminUserId,
    isMaster: input.isMaster,
    role: input.role,
    scheduleDraftGameIds: [input.scheduleDraftGameId],
  });
  if (allowed === "unrestricted" || allowed.has(input.scheduleDraftGameId)) return null;
  return PARK_DIRECTOR_WRITE_DENIED;
}
