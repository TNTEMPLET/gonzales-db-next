import type { Game } from "@/lib/fetchGames";
import type { AdminAssignrScope } from "@/lib/admin/assignrScopeShared";
import { leagueCalendarDate, leagueClockHm } from "@/lib/seasonConfig";
import {
  CONTENT_ORGS,
  getAssignrLeagueId,
  isContentOrgId,
  type ContentOrgId,
} from "@/lib/siteConfig";

import type { PublicScheduleGame } from "./publicSchedule";

export type ScoreableGame = PublicScheduleGame & {
  organizationId: ContentOrgId;
  seasonName: string;
  seasonYear: number;
};

export function leagueOrgsFromScope(scope: AdminAssignrScope): ContentOrgId[] {
  if (scope === "all") return [...CONTENT_ORGS];
  return isContentOrgId(scope) ? [scope] : [];
}

export function normalizeClockHm(startTime: string): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(startTime.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** True when the game's local kickoff (Central) is at or before `asOf`. */
export function isPastKickoff(
  dateKey: string,
  startTime: string,
  asOf: Date = new Date(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  const today = leagueCalendarDate(asOf);
  if (dateKey < today) return true;
  if (dateKey > today) return false;
  const kick = normalizeClockHm(startTime);
  if (!kick) return false;
  return kick <= leagueClockHm(asOf);
}

export function filterPastScoreableGames<T extends { dateKey: string; startTime: string }>(
  games: T[],
  asOf: Date = new Date(),
): T[] {
  return games.filter((game) => isPastKickoff(game.dateKey, game.startTime, asOf));
}

/** Parks whose games are never entered in Scores (Fall Ball Paula Park, etc.). */
const EXCLUDED_SCORE_PARK_NAMES = ["paula park"];

export function isScoreEntryPark(parkName: string | null | undefined): boolean {
  const normalized = parkName?.trim().toLowerCase() ?? "";
  if (!normalized) return true;
  return !EXCLUDED_SCORE_PARK_NAMES.some(
    (excluded) => normalized === excluded || normalized.startsWith(`${excluded} `),
  );
}

export function filterScoreEntryParks<T extends { parkName: string }>(games: T[]): T[] {
  return games.filter((game) => isScoreEntryPark(game.parkName));
}

/** Assignr-shaped row so scores import matching can reuse existing indexes. */
export function scoreableToImportGame(game: ScoreableGame): Game {
  const clock = normalizeClockHm(game.startTime) ?? "00:00";
  return {
    id: game.id,
    start_time: `${game.dateKey}T${clock}:00`,
    localized_date: game.dateLabel,
    localized_time: game.timeLabel,
    age_group: game.ageGroup,
    home_team: game.homeTeam,
    away_team: game.awayTeam,
    status: "A",
    subvenue: game.fieldName,
    organizationId: game.organizationId,
    league_id: getAssignrLeagueId(game.organizationId) || undefined,
    _embedded: { venue: { name: game.parkName } },
  };
}
