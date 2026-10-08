import { isPlacedPublicGame } from "@/lib/schedule/publicSchedule";
import { dateKey as utcDateKey } from "@/lib/scheduler/validation";
import {
  getContentOrgBrandColors,
  getOrgDisplayName,
  isContentOrgId,
  type ContentOrgId,
} from "@/lib/siteConfig";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type GamesAtMyParksRange = {
  /** Inclusive calendar dates, YYYY-MM-DD, compared on the UTC date of gameDate. */
  startDate: string;
  endDate: string;
};

/** One posted game at a venue this director is assigned to. Slice 8 renders this row. */
export type ParkDirectorParkGame = {
  id: string;
  organizationId: ContentOrgId;
  organizationLabel: string;
  leaguePrimaryHex: string;
  leagueAccentHex: string;
  status: "LOCKED" | "EXPORTED";
  gameDate: string;
  startTime: string;
  division: string;
  ageGroup: string | null;
  homeTeamName: string;
  awayTeamName: string;
  venueId: string;
  venueName: string;
  parkId: string;
  parkName: string;
  fieldId: string | null;
  fieldName: string | null;
};

export type ParkDirectorAssignmentRow = {
  venueId: string;
  active: boolean;
};

/** Schedule draft game plus the league park's venue, as the loader reads it. */
export type ParkDirectorGameSource = {
  id: string;
  organizationId: string;
  status: string;
  gameDate: Date | null;
  startTime: string | null;
  division: string;
  ageGroup: string | null;
  homeTeamName: string;
  awayTeamName: string;
  park: {
    id: string;
    name: string;
    venueId: string | null;
    venue: { id: string; name: string } | null;
  } | null;
  field: { id: string; name: string } | null;
};

export function isGamesAtMyParksRange(range: GamesAtMyParksRange): boolean {
  return ISO_DATE.test(range.startDate) && ISO_DATE.test(range.endDate) && range.startDate <= range.endDate;
}

function sortTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value.trim();
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/**
 * Posted games (LOCKED or EXPORTED) whose league park points at one of the
 * director's active venues, across every content league, sorted by time.
 * A park with no venueId is not included: it is not "at my park" yet.
 */
export function selectGamesAtMyParks(
  assignments: readonly ParkDirectorAssignmentRow[],
  games: readonly ParkDirectorGameSource[],
  range: GamesAtMyParksRange,
): ParkDirectorParkGame[] {
  if (!isGamesAtMyParksRange(range)) return [];
  const venueIds = new Set(
    assignments.filter((row) => row.active && row.venueId).map((row) => row.venueId),
  );
  if (venueIds.size === 0) return [];

  const selected: ParkDirectorParkGame[] = [];
  for (const game of games) {
    if (!isContentOrgId(game.organizationId)) continue;
    if (!isPlacedPublicGame(game)) continue;
    const venueId = game.park?.venueId;
    if (!venueId || !venueIds.has(venueId) || !game.park) continue;
    const gameDate = utcDateKey(game.gameDate as Date);
    if (gameDate < range.startDate || gameDate > range.endDate) continue;
    const brand = getContentOrgBrandColors(game.organizationId);
    const status = game.status === "EXPORTED" ? "EXPORTED" : "LOCKED";
    selected.push({
      id: game.id,
      organizationId: game.organizationId,
      organizationLabel: getOrgDisplayName(game.organizationId),
      leaguePrimaryHex: brand.primaryHex,
      leagueAccentHex: brand.accentHex,
      status,
      gameDate,
      startTime: game.startTime!.trim(),
      division: game.division,
      ageGroup: game.ageGroup,
      homeTeamName: game.homeTeamName,
      awayTeamName: game.awayTeamName,
      venueId,
      venueName: game.park.venue?.name || game.park.name,
      parkId: game.park.id,
      parkName: game.park.name,
      fieldId: game.field?.id ?? null,
      fieldName: game.field?.name ?? null,
    });
  }

  selected.sort((a, b) => {
    if (a.gameDate !== b.gameDate) return a.gameDate < b.gameDate ? -1 : 1;
    const time = sortTime(a.startTime).localeCompare(sortTime(b.startTime));
    if (time !== 0) return time;
    if (a.organizationId !== b.organizationId) {
      return a.organizationId < b.organizationId ? -1 : 1;
    }
    return a.id < b.id ? -1 : 1;
  });
  return selected;
}

/**
 * Games at the user's active venues for a date range, from every content league.
 * Returns an empty list when the user has no active assignments.
 * Slice 8 (the mobile Game Day page) should call this and not query parks itself.
 */
export async function gamesAtMyParks(
  adminUserId: string,
  range: GamesAtMyParksRange,
): Promise<ParkDirectorParkGame[]> {
  if (!adminUserId.trim() || !isGamesAtMyParksRange(range)) return [];
  const { default: prisma } = await import("@/lib/prisma");
  const assignments = await prisma.parkDirectorAssignment.findMany({
    where: { adminUserId, active: true },
    select: { venueId: true, active: true },
  });
  if (assignments.length === 0) return [];
  const rows = await prisma.scheduleDraftGame.findMany({
    where: {
      status: { in: ["LOCKED", "EXPORTED"] },
      gameDate: {
        gte: new Date(`${range.startDate}T00:00:00.000Z`),
        lte: new Date(`${range.endDate}T23:59:59.999Z`),
      },
      park: { venueId: { in: assignments.map((row) => row.venueId) } },
    },
    select: {
      id: true,
      organizationId: true,
      status: true,
      gameDate: true,
      startTime: true,
      division: true,
      ageGroup: true,
      homeTeamName: true,
      awayTeamName: true,
      park: {
        select: {
          id: true,
          name: true,
          venueId: true,
          venue: { select: { id: true, name: true } },
        },
      },
      field: { select: { id: true, name: true } },
    },
  });
  return selectGamesAtMyParks(assignments, rows, range);
}
