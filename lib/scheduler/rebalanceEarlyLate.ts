import { isEarlyStart } from "./earlyLate";
import { jsonStringArray } from "./validation";
import type { GeneratedDraftGame, SchedulerField } from "./types";

const MAX_SWAPS = 100;

function dayKey(game: GeneratedDraftGame): string {
  if (!game.gameDate) return "";
  return game.gameDate instanceof Date ? game.gameDate.toISOString().slice(0, 10) : String(game.gameDate).slice(0, 10);
}

function fieldSupports(field: SchedulerField | undefined, division: string, ageGroup: string): boolean {
  if (!field) return false;
  const divisions = jsonStringArray(field.supportedDivisions);
  const ages = jsonStringArray(field.supportedAgeGroups);
  if (!divisions.length && !ages.length) return true;
  return divisions.includes(division) || ages.includes(ageGroup) || ages.includes(division);
}

function timesByDivision(games: GeneratedDraftGame[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const game of games) {
    if (!game.startTime) continue;
    const list = map.get(game.division) ?? [];
    list.push(game.startTime);
    map.set(game.division, list);
  }
  return map;
}

type TeamSkew = { early: number; late: number };

function teamSkews(games: GeneratedDraftGame[]): Map<string, TeamSkew> {
  const times = timesByDivision(games);
  const stats = new Map<string, TeamSkew>();
  const bump = (teamId: string, early: boolean) => {
    if (!teamId) return;
    const current = stats.get(teamId) ?? { early: 0, late: 0 };
    if (early) current.early += 1;
    else current.late += 1;
    stats.set(teamId, current);
  };
  for (const game of games) {
    if (!game.gameDate || !game.startTime) continue;
    const early = isEarlyStart(game.startTime, times.get(game.division) ?? []);
    bump(game.homeTeamId, early);
    bump(game.awayTeamId, early);
  }
  return stats;
}

export function earlyLateSkewScore(games: GeneratedDraftGame[]): { sum: number; max: number; even: number } {
  const stats = teamSkews(games);
  let sum = 0;
  let max = 0;
  let even = 0;
  for (const row of stats.values()) {
    const skew = Math.abs(row.early - row.late);
    sum += skew;
    if (skew > max) max = skew;
    if (skew === 0) even += 1;
  }
  return { sum, max, even };
}

function occupancy(games: GeneratedDraftGame[]): Set<string> {
  const keys = new Set<string>();
  for (const game of games) {
    if (!game.fieldId || !game.startTime || !dayKey(game)) continue;
    keys.add(`${dayKey(game)}|${game.fieldId}|${game.startTime}`);
  }
  return keys;
}

function teamBusy(games: GeneratedDraftGame[]): Map<string, Set<string>> {
  const busy = new Map<string, Set<string>>();
  const add = (teamId: string, key: string) => {
    if (!teamId) return;
    const set = busy.get(teamId) ?? new Set<string>();
    set.add(key);
    busy.set(teamId, set);
  };
  for (const game of games) {
    const day = dayKey(game);
    if (!day || !game.startTime) continue;
    const key = `${day}|${game.startTime}`;
    add(game.homeTeamId, key);
    add(game.awayTeamId, key);
  }
  return busy;
}

function swapSlots(a: GeneratedDraftGame, b: GeneratedDraftGame) {
  const start = a.startTime;
  const end = a.endTime;
  const fieldId = a.fieldId;
  const parkId = a.parkId;
  a.startTime = b.startTime;
  a.endTime = b.endTime;
  a.fieldId = b.fieldId;
  a.parkId = b.parkId;
  b.startTime = start;
  b.endTime = end;
  b.fieldId = fieldId;
  b.parkId = parkId;
}

function canSwap(
  games: GeneratedDraftGame[],
  occupancyGames: GeneratedDraftGame[],
  fieldsById: Map<string, SchedulerField>,
  a: GeneratedDraftGame,
  b: GeneratedDraftGame,
): boolean {
  if (a === b) return false;
  if (dayKey(a) !== dayKey(b) || !dayKey(a)) return false;
  if (!a.startTime || !b.startTime || a.startTime === b.startTime) return false;
  if (!a.fieldId || !b.fieldId) return false;
  if (!fieldSupports(fieldsById.get(b.fieldId), a.division, a.ageGroup)) return false;
  if (!fieldSupports(fieldsById.get(a.fieldId), b.division, b.ageGroup)) return false;

  const keys = occupancy(occupancyGames);
  const day = dayKey(a);
  keys.delete(`${day}|${a.fieldId}|${a.startTime}`);
  keys.delete(`${day}|${b.fieldId}|${b.startTime}`);
  if (keys.has(`${day}|${b.fieldId}|${b.startTime}`)) return false;
  if (keys.has(`${day}|${a.fieldId}|${a.startTime}`)) return false;

  const busy = teamBusy(occupancyGames);
  const drop = (teamId: string, start: string) => {
    busy.get(teamId)?.delete(`${day}|${start}`);
  };
  drop(a.homeTeamId, a.startTime);
  drop(a.awayTeamId, a.startTime);
  drop(b.homeTeamId, b.startTime);
  drop(b.awayTeamId, b.startTime);
  const taken = (teamId: string, start: string) => Boolean(teamId && busy.get(teamId)?.has(`${day}|${start}`));
  if (taken(a.homeTeamId, b.startTime) || taken(a.awayTeamId, b.startTime)) return false;
  if (taken(b.homeTeamId, a.startTime) || taken(b.awayTeamId, a.startTime)) return false;
  return true;
}

function scoreKey(games: GeneratedDraftGame[]): [number, number, number] {
  const s = earlyLateSkewScore(games);
  return [s.sum, s.max, -s.even];
}

export function rebalanceEarlyLateSlots(params: {
  games: GeneratedDraftGame[];
  fields: SchedulerField[];
  occupancyGames?: GeneratedDraftGame[];
}): { games: GeneratedDraftGame[]; swaps: number } {
  const games = params.games.map((game) => ({ ...game }));
  const fieldsById = new Map(params.fields.map((field) => [field.id, field]));
  let swaps = 0;
  for (let step = 0; step < MAX_SWAPS; step += 1) {
    const pool = [...games, ...(params.occupancyGames ?? [])];
    const current = scoreKey(games);
    let best: { a: GeneratedDraftGame; b: GeneratedDraftGame; score: [number, number, number] } | null = null;
    for (let i = 0; i < games.length; i += 1) {
      for (let j = i + 1; j < games.length; j += 1) {
        const a = games[i]!;
        const b = games[j]!;
        if (!canSwap(games, pool, fieldsById, a, b)) continue;
        swapSlots(a, b);
        const next = scoreKey(games);
        swapSlots(a, b);
        if (
          next[0] < current[0] ||
          (next[0] === current[0] && next[1] < current[1]) ||
          (next[0] === current[0] && next[1] === current[1] && next[2] < current[2])
        ) {
          if (
            !best ||
            next[0] < best.score[0] ||
            (next[0] === best.score[0] && next[1] < best.score[1]) ||
            (next[0] === best.score[0] && next[1] === best.score[1] && next[2] < best.score[2])
          ) {
            best = { a, b, score: next };
          }
        }
      }
    }
    if (!best) break;
    swapSlots(best.a, best.b);
    swaps += 1;
  }
  return { games, swaps };
}
