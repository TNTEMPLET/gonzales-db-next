import { venueMatchesPark } from "@/lib/admin/parkDirectorPark";
import type { Game } from "@/lib/fetchGames";

export type CrewTarget = {
  dateKey: string;
  startTime: string;
  homeTeam: string;
  awayTeam: string;
  parkNames: readonly string[];
};

function teamKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function teamsMatch(left: string, right: string): boolean {
  const a = teamKey(left);
  const b = teamKey(right);
  return Boolean(a) && a === b;
}

/** 24-hour HH:MM from "18:00", "6:00 PM", or an ISO timestamp. */
export function clockKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = /T(\d{2}):(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}:${iso[2]}`;
  const match = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/.exec(trimmed);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = match[3]?.toLowerCase();
  if (suffix === "pm" && hours < 12) hours += 12;
  if (suffix === "am" && hours === 12) hours = 0;
  if (!Number.isFinite(hours) || hours > 23) return null;
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

export function assignrDateKey(game: Game): string {
  const raw = String(game.localized_date || "").trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const start = String(game.start_time || "");
  const fromStart = start.match(/^(\d{4}-\d{2}-\d{2})/);
  return fromStart?.[1] ?? "";
}

function assignrVenue(game: Game): string {
  const embedded = game._embedded as { venue?: { name?: string } } | undefined;
  return (embedded?.venue?.name || (game.venue as string | undefined) || "").trim();
}

function crewNames(game: Game): string[] {
  const embedded = game._embedded as
    | {
        assignments?: Array<{
          _embedded?: { official?: { id?: string | number; first_name?: string; last_name?: string } };
        }>;
      }
    | undefined;
  const names: string[] = [];
  for (const entry of embedded?.assignments ?? []) {
    const official = entry?._embedded?.official;
    if (!official) continue;
    const name = `${official.first_name || ""} ${official.last_name || ""}`.trim().replace(/\s+/g, " ");
    if (!name || name.toLowerCase() === "unknown umpire") continue;
    names.push(name);
  }
  return names;
}

function parkMatches(game: Game, parkNames: readonly string[]): boolean {
  const venue = assignrVenue(game);
  if (!venue) return false;
  return parkNames.some((name) => venueMatchesPark(venue, name));
}

/** Umpire names for one posted game. Empty when Assignr has no matching crew. */
export function crewForGame(target: CrewTarget, games: readonly Game[]): string[] {
  let best: { score: number; names: string[] } | null = null;
  const targetClock = clockKey(target.startTime);
  for (const game of games) {
    if (assignrDateKey(game) !== target.dateKey) continue;
    if (!teamsMatch(String(game.home_team || ""), target.homeTeam)) continue;
    if (!teamsMatch(String(game.away_team || ""), target.awayTeam)) continue;
    if (!parkMatches(game, target.parkNames)) continue;
    const sameTime =
      targetClock != null &&
      (clockKey(String(game.localized_time || "")) === targetClock ||
        clockKey(String(game.start_time || "")) === targetClock);
    const score = sameTime ? 2 : 1;
    if (!best || score > best.score) best = { score, names: crewNames(game) };
  }
  return best?.names ?? [];
}
