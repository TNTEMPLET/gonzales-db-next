import type { Prisma } from "@prisma/client";

import { parseSeasonDateWindows, parseUtcDateOnly } from "./seasonWindows";
import { playableSchedulerTeams } from "./realTeams";
import { isEarlyStart } from "./earlyLate";
import { addMinutes, dateKey, jsonStringArray, timeToMinutes } from "./validation";
import type {
  GeneratedDraftGame,
  RoundRobinMatchup,
  ScheduleRepairSummary,
  SchedulerAvailability,
  SchedulerDivisionRule,
  SchedulerFairnessSummary,
  SchedulerField,
  SchedulerGenerationResult,
  SchedulerSeason,
  SchedulerSlot,
  SchedulerTeam,
} from "./types";

const DEFAULT_GAME_MINUTES = 90;
export const MAX_SCHEDULE_REPAIR_STEPS = 400;

function dayOfWeekUtc(date: Date): number {
  return date.getUTCDay();
}

function enumerateDates(start: Date | null, end: Date | null): Date[] {
  if (!start || !end || start > end) return [];
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor <= last) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function seasonGameTimes(season: SchedulerSeason): string[] {
  return jsonStringArray(season.defaultGameTimes);
}

function seasonGameDateRange(season: SchedulerSeason): { start: Date | null; end: Date | null } {
  const windows = parseSeasonDateWindows(
    season.settings,
    season.startsOn ? dateKey(season.startsOn) : "",
    season.endsOn ? dateKey(season.endsOn) : "",
  );
  return {
    start: parseUtcDateOnly(windows.gamesStartsOn) ?? season.startsOn,
    end: parseUtcDateOnly(windows.gamesEndsOn) ?? season.endsOn,
  };
}

function availabilityDates(season: SchedulerSeason, availability: SchedulerAvailability): Date[] {
  if (availability.date) return [availability.date];
  if (availability.dayOfWeek === null) return [];
  const { start, end } = seasonGameDateRange(season);
  return enumerateDates(start, end).filter((date) => availability.dayOfWeek === dayOfWeekUtc(date));
}

function slotTimesForAvailability(
  availability: SchedulerAvailability,
  seasonTimes: string[],
): string[] {
  if (!availability.startTime && !availability.endTime) return seasonTimes;
  if (availability.startTime && !availability.endTime) return [availability.startTime];
  const start = timeToMinutes(availability.startTime);
  const end = timeToMinutes(availability.endTime);
  return seasonTimes.filter((time) => {
    const minutes = timeToMinutes(time);
    if (minutes === null) return false;
    if (start !== null && minutes < start) return false;
    if (end !== null && minutes >= end) return false;
    return true;
  });
}

function eligibleFields(availability: SchedulerAvailability, fields: SchedulerField[]): SchedulerField[] {
  if (availability.fieldId) {
    return fields.filter((field) => field.id === availability.fieldId && field.isActive);
  }
  return fields.filter((field) => field.parkId === availability.parkId && field.isActive);
}

function blackoutKey(date: Date, fieldId: string, startTime: string | null): string {
  return `${dateKey(date)}:${fieldId}:${startTime || "*"}`;
}

function buildRoundRobinRounds(teams: SchedulerTeam[]): Array<Array<[SchedulerTeam, SchedulerTeam]>> {
  const participants: Array<SchedulerTeam | null> = [...teams];
  if (participants.length % 2 === 1) participants.push(null);

  const rounds: Array<Array<[SchedulerTeam, SchedulerTeam]>> = [];
  const roundCount = participants.length - 1;
  let rotation = [...participants];

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const pairs: Array<[SchedulerTeam, SchedulerTeam]> = [];
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const first = rotation[index];
      const second = rotation[rotation.length - 1 - index];
      if (first && second) pairs.push([first, second]);
    }
    rounds.push(pairs);

    const fixed = rotation[0];
    const rotating = rotation.slice(1);
    const last = rotating.pop();
    rotation = [fixed, last ?? null, ...rotating];
  }

  return rounds;
}

function chooseHomeAway(params: {
  first: SchedulerTeam;
  second: SchedulerTeam;
  homeCounts: Map<string, number>;
  roundIndex: number;
  cycleIndex: number;
  pairIndex: number;
}): { home: SchedulerTeam; away: SchedulerTeam } {
  const firstHomeCount = params.homeCounts.get(params.first.id) ?? 0;
  const secondHomeCount = params.homeCounts.get(params.second.id) ?? 0;
  if (firstHomeCount < secondHomeCount) return { home: params.first, away: params.second };
  if (secondHomeCount < firstHomeCount) return { home: params.second, away: params.first };

  const flipHome = (params.roundIndex + params.cycleIndex + params.pairIndex) % 2 === 1;
  return flipHome
    ? { home: params.second, away: params.first }
    : { home: params.first, away: params.second };
}

function defaultGamesPerTeam(teams: SchedulerTeam[]): number {
  return Math.max(0, teams.length - 1);
}

export function generateRoundRobinMatchups(params: {
  teamsByDivision: Map<string, SchedulerTeam[]>;
  gamesPerTeam?: number;
}): RoundRobinMatchup[] {
  const matchups: RoundRobinMatchup[] = [];
  let gameNumber = 1;

  for (const [division, teams] of params.teamsByDivision.entries()) {
    const sortedTeams = [...teams].sort((a, b) => a.teamName.localeCompare(b.teamName));
    const targetGamesPerTeam = params.gamesPerTeam ?? defaultGamesPerTeam(sortedTeams);
    const teamGameCounts = new Map(sortedTeams.map((team) => [team.id, 0]));
    const homeCounts = new Map(sortedTeams.map((team) => [team.id, 0]));
    const rounds = buildRoundRobinRounds(sortedTeams);
    const gamesNeeded = Math.floor((sortedTeams.length * targetGamesPerTeam) / 2);
    const maxCycles = Math.max(1, Math.ceil(targetGamesPerTeam / Math.max(1, sortedTeams.length - 1)) + 1);
    let divisionGames = 0;

    for (let cycleIndex = 0; cycleIndex < maxCycles && divisionGames < gamesNeeded; cycleIndex += 1) {
      let addedInCycle = 0;
      for (let roundIndex = 0; roundIndex < rounds.length && divisionGames < gamesNeeded; roundIndex += 1) {
        const round = rounds[roundIndex];
        for (let pairIndex = 0; pairIndex < round.length && divisionGames < gamesNeeded; pairIndex += 1) {
          const [first, second] = round[pairIndex];
          if ((teamGameCounts.get(first.id) ?? 0) >= targetGamesPerTeam) continue;
          if ((teamGameCounts.get(second.id) ?? 0) >= targetGamesPerTeam) continue;

          const { home, away } = chooseHomeAway({ first, second, homeCounts, roundIndex, cycleIndex, pairIndex });
          teamGameCounts.set(home.id, (teamGameCounts.get(home.id) ?? 0) + 1);
          teamGameCounts.set(away.id, (teamGameCounts.get(away.id) ?? 0) + 1);
          homeCounts.set(home.id, (homeCounts.get(home.id) ?? 0) + 1);
          matchups.push({
            division,
            ageGroup: first.ageGroup,
            homeTeamId: home.id,
            awayTeamId: away.id,
            homeTeamName: home.teamName,
            awayTeamName: away.teamName,
            roundLabel: `Round ${cycleIndex * rounds.length + roundIndex + 1}`,
            gameNumber,
          });
          addedInCycle += 1;
          divisionGames += 1;
          gameNumber += 1;
        }
      }
      if (addedInCycle === 0) break;
    }
  }

  return matchups;
}

export function buildSchedulerSlots(params: {
  season: SchedulerSeason;
  fields: SchedulerField[];
  availabilities: SchedulerAvailability[];
}): SchedulerSlot[] {
  const seasonTimes = seasonGameTimes(params.season);
  const blackouts = new Set<string>();
  const slots: SchedulerSlot[] = [];

  for (const availability of params.availabilities) {
    if (availability.availabilityType !== "BLACKOUT") continue;
    for (const date of availabilityDates(params.season, availability)) {
      for (const field of eligibleFields(availability, params.fields)) {
        blackouts.add(blackoutKey(date, field.id, availability.startTime));
      }
    }
  }

  for (const availability of params.availabilities) {
    if (availability.availabilityType !== "AVAILABLE") continue;
    const times = slotTimesForAvailability(availability, seasonTimes);
    for (const date of availabilityDates(params.season, availability)) {
      for (const field of eligibleFields(availability, params.fields)) {
        for (const startTime of times) {
          if (blackouts.has(blackoutKey(date, field.id, startTime)) || blackouts.has(blackoutKey(date, field.id, null))) {
            continue;
          }
          const noteDivisions = availability.notes
            ? availability.notes.split(",").map((part) => part.trim()).filter(Boolean)
            : [];
          slots.push({
            id: blackoutKey(date, field.id, startTime),
            date,
            gameDate: dateKey(date),
            startTime,
            endTime: addMinutes(startTime, DEFAULT_GAME_MINUTES),
            parkId: field.parkId,
            fieldId: field.id,
            parkName: field.park?.name,
            fieldName: field.name,
            supportedAgeGroups: noteDivisions.length ? noteDivisions : jsonStringArray(field.supportedAgeGroups),
            supportedDivisions: noteDivisions.length ? noteDivisions : jsonStringArray(field.supportedDivisions),
          });
        }
      }
    }
  }

  return slots.sort((a, b) => `${a.gameDate} ${a.startTime} ${a.fieldName || ""}`.localeCompare(`${b.gameDate} ${b.startTime} ${b.fieldName || ""}`));
}

function allowDoubleHeaders(rule?: SchedulerDivisionRule): boolean {
  const meta = rule?.ruleMetadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return (meta as { allowDoubleHeaders?: unknown }).allowDoubleHeaders === true;
}

function restDaysRequired(rule?: SchedulerDivisionRule): number {
  if (!rule) return 0;
  return Math.max(rule.minDaysBetweenGames ?? 0, rule.avoidBackToBack ? 2 : 0);
}

function mondayWeekKey(date: Date): string {
  const day = date.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  return dateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offset)));
}

function utcDayDiff(a: Date, b: Date): number {
  const first = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const second = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round(Math.abs(first - second) / 86_400_000);
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function teamRestConflict(teamId: string, slotDate: Date, restDays: number, teamDates: Set<string>): boolean {
  if (restDays <= 0) return false;
  const prefix = `${teamId}:`;
  for (const key of teamDates) {
    if (!key.startsWith(prefix)) continue;
    const diff = utcDayDiff(parseDateKey(key.slice(prefix.length)), slotDate);
    if (diff > 0 && diff < restDays) return true;
  }
  return false;
}

function divisionSlotTimes(slots: SchedulerSlot[], division: string): string[] {
  const times = new Set<string>();
  for (const slot of slots) {
    if (!slot.supportedDivisions.length || slot.supportedDivisions.includes(division)) {
      times.add(slot.startTime);
    }
  }
  return [...times];
}

function earlyLateScore(
  teamIds: string[],
  slotIsEarly: boolean,
  teamEarly: Map<string, number>,
  teamLate: Map<string, number>,
): number {
  let score = 0;
  for (const teamId of teamIds) {
    const early = (teamEarly.get(teamId) ?? 0) + (slotIsEarly ? 1 : 0);
    const late = (teamLate.get(teamId) ?? 0) + (slotIsEarly ? 0 : 1);
    score += Math.abs(early - late);
  }
  return score;
}

function chooseEligibleSlot(params: {
  matchup: RoundRobinMatchup;
  rule?: SchedulerDivisionRule;
  slots: SchedulerSlot[];
  usedSlotIds: Set<string>;
  teamSlotTimes: Set<string>;
  teamDates: Set<string>;
  teamWeeks: Map<string, number>;
  teamEarly: Map<string, number>;
  teamLate: Map<string, number>;
}): SchedulerSlot | undefined {
  const times = divisionSlotTimes(params.slots, params.matchup.division);
  const teamIds = [params.matchup.homeTeamId, params.matchup.awayTeamId];
  let best: SchedulerSlot | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of params.slots) {
    if (params.usedSlotIds.has(candidate.id)) continue;
    if (ruleAllowsSlot(params.rule, params.matchup, candidate).length) continue;
    if (
      teamPlacementConflicts({
        matchup: params.matchup,
        rule: params.rule,
        slot: candidate,
        teamSlotTimes: params.teamSlotTimes,
        teamDates: params.teamDates,
        teamWeeks: params.teamWeeks,
      }).length
    ) {
      continue;
    }
    const score = earlyLateScore(teamIds, isEarlyStart(candidate.startTime, times), params.teamEarly, params.teamLate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function teamPlacementConflicts(params: {
  matchup: RoundRobinMatchup;
  rule?: SchedulerDivisionRule;
  slot: SchedulerSlot;
  teamSlotTimes: Set<string>;
  teamDates: Set<string>;
  teamWeeks: Map<string, number>;
}): string[] {
  const conflicts: string[] = [];
  const slotTime = `${dateKey(params.slot.date)}:${params.slot.startTime}`;
  const dayKey = dateKey(params.slot.date);
  const weekKey = mondayWeekKey(params.slot.date);
  const restDays = restDaysRequired(params.rule);
  const maxPerWeek = params.rule?.maxGamesPerWeek ?? null;

  for (const teamId of [params.matchup.homeTeamId, params.matchup.awayTeamId]) {
    if (params.teamSlotTimes.has(`${teamId}:${slotTime}`)) conflicts.push("team_already_scheduled_in_slot");
    if (!allowDoubleHeaders(params.rule) && params.teamDates.has(`${teamId}:${dayKey}`)) {
      conflicts.push("double_header_not_allowed");
    }
    if (teamRestConflict(teamId, params.slot.date, restDays, params.teamDates)) {
      conflicts.push(params.rule?.avoidBackToBack && restDays <= 2 ? "back_to_back_not_allowed" : "min_days_between_games");
    }
    if (maxPerWeek != null && (params.teamWeeks.get(`${teamId}:${weekKey}`) ?? 0) >= maxPerWeek) {
      conflicts.push("max_games_per_week");
    }
  }
  return conflicts;
}

function ruleAllowsSlot(rule: SchedulerDivisionRule | undefined, matchup: RoundRobinMatchup, slot: SchedulerSlot): string[] {
  const conflicts: string[] = [];
  if (!rule) return ["missing_matrix_rule"];

  const allowedParkIds = jsonStringArray(rule.allowedParkIds);
  const allowedFieldIds = jsonStringArray(rule.allowedFieldIds);
  const allowedGameTimes = jsonStringArray(rule.allowedGameTimes);
  if (allowedParkIds.length && !allowedParkIds.includes(slot.parkId)) conflicts.push("park_not_allowed");
  if (allowedFieldIds.length && !allowedFieldIds.includes(slot.fieldId)) conflicts.push("field_not_allowed");
  if (allowedGameTimes.length && !allowedGameTimes.includes(slot.startTime)) conflicts.push("time_not_allowed");
  if (slot.supportedAgeGroups.length && !slot.supportedAgeGroups.includes(matchup.ageGroup)) {
    conflicts.push("unsupported_field_age_group");
  }
  if (slot.supportedDivisions.length && !slot.supportedDivisions.includes(matchup.division)) {
    conflicts.push("unsupported_field_division");
  }
  return conflicts;
}


function unscheduledReasons(params: {
  matchup: RoundRobinMatchup;
  rule: SchedulerDivisionRule | undefined;
  slots: SchedulerSlot[];
  usedSlotIds: Set<string>;
  teamSlotTimes: Set<string>;
  teamDates: Set<string>;
  teamWeeks: Map<string, number>;
}): string[] {
  if (!params.slots.length) return ["no_available_slots_defined"];

  const reasons = new Set<string>();
  for (const slot of params.slots) {
    if (params.usedSlotIds.has(slot.id)) {
      reasons.add("slot_already_used");
      continue;
    }

    const ruleConflicts = ruleAllowsSlot(params.rule, params.matchup, slot);
    if (ruleConflicts.length) {
      ruleConflicts.forEach((reason) => reasons.add(reason));
      continue;
    }

    const teamConflicts = teamPlacementConflicts({
      matchup: params.matchup,
      rule: params.rule,
      slot,
      teamSlotTimes: params.teamSlotTimes,
      teamDates: params.teamDates,
      teamWeeks: params.teamWeeks,
    });
    if (teamConflicts.length) {
      teamConflicts.forEach((reason) => reasons.add(reason));
    }
  }

  return reasons.size ? [...reasons] : ["no_available_slot"];
}

export function checkDraftGameConflicts(games: GeneratedDraftGame[]): GeneratedDraftGame[] {
  const teamAtTime = new Set<string>();
  const fieldAtTime = new Set<string>();

  return games.map((game) => {
    const flags = new Set(game.conflictFlags);
    if (game.gameDate && game.startTime) {
      for (const teamId of [game.homeTeamId, game.awayTeamId]) {
        const teamKey = `${teamId}:${dateKey(game.gameDate)}:${game.startTime}`;
        if (teamAtTime.has(teamKey)) flags.add("team_double_booked");
        teamAtTime.add(teamKey);
      }
      if (game.fieldId) {
        const fieldKey = `${game.fieldId}:${dateKey(game.gameDate)}:${game.startTime}`;
        if (fieldAtTime.has(fieldKey)) flags.add("field_time_double_booked");
        fieldAtTime.add(fieldKey);
      }
    }
    return { ...game, status: flags.size ? "CONFLICT" : game.status, conflictFlags: [...flags] };
  });
}

function gameIdentity(game: { division: string; gameNumber: number }): string {
  return `${game.division}:${game.gameNumber}`;
}

function slotIdForGame(game: GeneratedDraftGame): string | null {
  if (!game.gameDate || !game.fieldId || !game.startTime) return null;
  return blackoutKey(game.gameDate, game.fieldId, game.startTime);
}

function placementStateKey(games: GeneratedDraftGame[]): string {
  return games
    .map((game) => `${gameIdentity(game)}=${slotIdForGame(game) ?? ""}`)
    .sort()
    .join("|");
}

function applySlotToGame(game: GeneratedDraftGame, slot: SchedulerSlot): GeneratedDraftGame {
  const meta = game.fairnessMetadata && typeof game.fairnessMetadata === "object" ? { ...game.fairnessMetadata } : {};
  return {
    ...game,
    gameDate: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    parkId: slot.parkId,
    fieldId: slot.fieldId,
    status: "DRAFT",
    conflictFlags: [],
    fairnessMetadata: { ...meta, slotId: slot.id, repaired: true },
    schedulerNotes: null,
  };
}

function occupancyFromGames(games: GeneratedDraftGame[], slots: SchedulerSlot[]) {
  const usedSlotIds = new Set<string>();
  const teamSlotTimes = new Set<string>();
  const teamDates = new Set<string>();
  const teamWeeks = new Map<string, number>();
  const teamEarly = new Map<string, number>();
  const teamLate = new Map<string, number>();

  for (const game of games) {
    const slotId = slotIdForGame(game);
    if (!slotId || !game.gameDate || !game.startTime) continue;
    usedSlotIds.add(slotId);
    const slotTime = `${dateKey(game.gameDate)}:${game.startTime}`;
    const dayKey = dateKey(game.gameDate);
    const weekKey = mondayWeekKey(game.gameDate);
    const early = isEarlyStart(game.startTime, divisionSlotTimes(slots, game.division));
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      if (!teamId) continue;
      teamSlotTimes.add(`${teamId}:${slotTime}`);
      teamDates.add(`${teamId}:${dayKey}`);
      teamWeeks.set(`${teamId}:${weekKey}`, (teamWeeks.get(`${teamId}:${weekKey}`) ?? 0) + 1);
      if (early) teamEarly.set(teamId, (teamEarly.get(teamId) ?? 0) + 1);
      else teamLate.set(teamId, (teamLate.get(teamId) ?? 0) + 1);
    }
  }

  return { usedSlotIds, teamSlotTimes, teamDates, teamWeeks, teamEarly, teamLate };
}

function matchupFromGame(game: GeneratedDraftGame): RoundRobinMatchup {
  return {
    division: game.division,
    ageGroup: game.ageGroup,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeTeamName: game.homeTeamName,
    awayTeamName: game.awayTeamName,
    roundLabel: game.roundLabel,
    gameNumber: game.gameNumber,
  };
}

function annotateUnplaced(
  games: GeneratedDraftGame[],
  slots: SchedulerSlot[],
  rules: SchedulerDivisionRule[],
): GeneratedDraftGame[] {
  const occupancy = occupancyFromGames(games, slots);
  return games.map((game) => {
    if (game.gameDate && game.startTime && game.fieldId) return game;
    const rule = rules.find((entry) => entry.division === game.division);
    return {
      ...game,
      gameDate: null,
      startTime: null,
      endTime: null,
      parkId: null,
      fieldId: null,
      status: "CONFLICT",
      conflictFlags: unscheduledReasons({
        matchup: matchupFromGame(game),
        rule,
        slots,
        ...occupancy,
      }),
      schedulerNotes: "No eligible slot was available for this generated matchup.",
    };
  });
}

function tryDirectPlace(params: {
  games: GeneratedDraftGame[];
  slots: SchedulerSlot[];
  rules: SchedulerDivisionRule[];
  lockedIds: Set<string>;
}): { games: GeneratedDraftGame[]; placed: number } {
  let placed = 0;
  let next = params.games;
  for (const game of params.games) {
    if (game.gameDate || params.lockedIds.has(gameIdentity(game))) continue;
    const occupancy = occupancyFromGames(next, params.slots);
    const slot = chooseEligibleSlot({
      matchup: matchupFromGame(game),
      rule: params.rules.find((entry) => entry.division === game.division),
      slots: params.slots,
      ...occupancy,
    });
    if (!slot) continue;
    next = next.map((entry) => (gameIdentity(entry) === gameIdentity(game) ? applySlotToGame(entry, slot) : entry));
    placed += 1;
  }
  return { games: next, placed };
}

function blockersForTarget(params: {
  games: GeneratedDraftGame[];
  leftover: GeneratedDraftGame;
  target: SchedulerSlot;
  lockedIds: Set<string>;
}): GeneratedDraftGame[] {
  const weekKey = mondayWeekKey(params.target.date);
  const dayKey = dateKey(params.target.date);
  return params.games.filter((candidate) => {
    if (!candidate.gameDate || !candidate.startTime) return false;
    if (params.lockedIds.has(gameIdentity(candidate))) return false;
    if (candidate.division !== params.leftover.division) return false;
    const involves =
      candidate.homeTeamId === params.leftover.homeTeamId ||
      candidate.homeTeamId === params.leftover.awayTeamId ||
      candidate.awayTeamId === params.leftover.homeTeamId ||
      candidate.awayTeamId === params.leftover.awayTeamId;
    if (!involves) return false;
    return mondayWeekKey(candidate.gameDate) === weekKey || dateKey(candidate.gameDate) === dayKey;
  });
}

function moveBlockerOffSlot(params: {
  games: GeneratedDraftGame[];
  blocker: GeneratedDraftGame;
  slots: SchedulerSlot[];
  rules: SchedulerDivisionRule[];
  reservedSlotIds: Set<string>;
}): GeneratedDraftGame[] | null {
  const originalSlotId = slotIdForGame(params.blocker);
  const withoutBlocker = params.games.map((entry) =>
    gameIdentity(entry) === gameIdentity(params.blocker)
      ? {
          ...entry,
          gameDate: null,
          startTime: null,
          endTime: null,
          parkId: null,
          fieldId: null,
          status: "CONFLICT" as const,
          conflictFlags: [],
        }
      : entry,
  );
  const occupancyWithout = occupancyFromGames(withoutBlocker, params.slots);
  for (const reserved of params.reservedSlotIds) occupancyWithout.usedSlotIds.add(reserved);
  if (originalSlotId) occupancyWithout.usedSlotIds.add(originalSlotId);
  const alt = chooseEligibleSlot({
    matchup: matchupFromGame(params.blocker),
    rule: params.rules.find((entry) => entry.division === params.blocker.division),
    slots: params.slots,
    ...occupancyWithout,
  });
  if (!alt || params.reservedSlotIds.has(alt.id) || alt.id === originalSlotId) return null;
  return withoutBlocker.map((entry) =>
    gameIdentity(entry) === gameIdentity(params.blocker) ? applySlotToGame(entry, alt) : entry,
  );
}

function tryPlaceWithHops(params: {
  games: GeneratedDraftGame[];
  leftover: GeneratedDraftGame;
  target: SchedulerSlot;
  slots: SchedulerSlot[];
  rules: SchedulerDivisionRule[];
  lockedIds: Set<string>;
  hopsLeft: number;
  reservedSlotIds: Set<string>;
}): GeneratedDraftGame[] | null {
  const rule = params.rules.find((entry) => entry.division === params.leftover.division);
  const occupancy = occupancyFromGames(params.games, params.slots);
  if (
    !occupancy.usedSlotIds.has(params.target.id) &&
    teamPlacementConflicts({
      matchup: matchupFromGame(params.leftover),
      rule,
      slot: params.target,
      teamSlotTimes: occupancy.teamSlotTimes,
      teamDates: occupancy.teamDates,
      teamWeeks: occupancy.teamWeeks,
    }).length === 0
  ) {
    return params.games.map((entry) =>
      gameIdentity(entry) === gameIdentity(params.leftover) ? applySlotToGame(entry, params.target) : entry,
    );
  }
  if (params.hopsLeft <= 0) return null;

  const reserved = new Set(params.reservedSlotIds);
  reserved.add(params.target.id);
  for (const blocker of blockersForTarget({
    games: params.games,
    leftover: params.leftover,
    target: params.target,
    lockedIds: params.lockedIds,
  })) {
    const moved = moveBlockerOffSlot({
      games: params.games,
      blocker,
      slots: params.slots,
      rules: params.rules,
      reservedSlotIds: reserved,
    });
    if (!moved) continue;
    const placed = tryPlaceWithHops({
      ...params,
      games: moved,
      hopsLeft: params.hopsLeft - 1,
      reservedSlotIds: reserved,
    });
    if (placed) return placed;
  }
  return null;
}

function tryDisplaceOne(params: {
  games: GeneratedDraftGame[];
  slots: SchedulerSlot[];
  rules: SchedulerDivisionRule[];
  lockedIds: Set<string>;
}): { games: GeneratedDraftGame[]; moved: boolean } {
  const unplaced = params.games.filter((game) => !game.gameDate && !params.lockedIds.has(gameIdentity(game)));
  for (const game of unplaced) {
    const rule = params.rules.find((entry) => entry.division === game.division);
    const occupancy = occupancyFromGames(params.games, params.slots);
    const fieldLegalEmpty = params.slots.filter(
      (slot) => !occupancy.usedSlotIds.has(slot.id) && ruleAllowsSlot(rule, matchupFromGame(game), slot).length === 0,
    );
    for (const target of fieldLegalEmpty) {
      const placed = tryPlaceWithHops({
        games: params.games,
        leftover: game,
        target,
        slots: params.slots,
        rules: params.rules,
        lockedIds: params.lockedIds,
        hopsLeft: 2,
        reservedSlotIds: new Set([target.id]),
      });
      if (placed) return { games: placed, moved: true };
    }
  }
  return { games: params.games, moved: false };
}

export function repairUnplacedGames(params: {
  games: GeneratedDraftGame[];
  slots: SchedulerSlot[];
  rules: SchedulerDivisionRule[];
  lockedIds?: Iterable<string>;
  maxSteps?: number;
}): { games: GeneratedDraftGame[]; summary: ScheduleRepairSummary } {
  const maxSteps = Math.max(1, Math.min(params.maxSteps ?? MAX_SCHEDULE_REPAIR_STEPS, MAX_SCHEDULE_REPAIR_STEPS));
  const lockedIds = new Set(params.lockedIds ?? []);
  const unplacedAtStart = params.games.filter((game) => !game.gameDate && !lockedIds.has(gameIdentity(game))).length;
  if (!unplacedAtStart) {
    return {
      games: params.games,
      summary: { steps: 0, maxSteps, placed: 0, moved: 0, remaining: 0, stopped: "complete" },
    };
  }
  let games = params.games;
  let moved = 0;
  const seen = new Set<string>();

  let steps = 0;
  let stopped: ScheduleRepairSummary["stopped"] = "complete";
  for (steps = 1; steps <= maxSteps; steps += 1) {
    if (!games.some((game) => !game.gameDate && !lockedIds.has(gameIdentity(game)))) {
      stopped = "complete";
      break;
    }
    const key = placementStateKey(games);
    if (seen.has(key)) {
      stopped = "cycle";
      break;
    }
    seen.add(key);

    const direct = tryDirectPlace({ games, slots: params.slots, rules: params.rules, lockedIds });
    if (direct.placed > 0) {
      games = direct.games;
      continue;
    }
    const displaced = tryDisplaceOne({ games, slots: params.slots, rules: params.rules, lockedIds });
    if (displaced.moved) {
      games = displaced.games;
      moved += 1;
      continue;
    }
    stopped = "no_progress";
    break;
  }
  if (steps > maxSteps) {
    stopped = "max_steps";
    steps = maxSteps;
  } else if (stopped === "complete" && games.some((game) => !game.gameDate && !lockedIds.has(gameIdentity(game)))) {
    stopped = "no_progress";
  }

  const annotated = annotateUnplaced(games, params.slots, params.rules);
  const remaining = annotated.filter((game) => !game.gameDate).length;
  if (remaining === 0) stopped = "complete";
  return {
    games: annotated,
    summary: {
      steps: Math.min(steps, maxSteps),
      maxSteps,
      placed: Math.max(0, unplacedAtStart - remaining),
      moved,
      remaining,
      stopped,
    },
  };
}

export function summarizeFairness(games: GeneratedDraftGame[], teams: SchedulerTeam[]): SchedulerFairnessSummary {
  const timesByDivision = new Map<string, string[]>();
  for (const game of games) {
    if (!game.startTime) continue;
    const times = timesByDivision.get(game.division) ?? [];
    times.push(game.startTime);
    timesByDivision.set(game.division, times);
  }
  const teamStats = new Map<string, SchedulerFairnessSummary["teams"][number]>();

  for (const team of teams) {
    teamStats.set(team.id, {
      teamId: team.id,
      teamName: team.teamName,
      division: team.ageGroup,
      ageGroup: team.ageGroup,
      earlyGames: 0,
      lateGames: 0,
      homeGames: 0,
      awayGames: 0,
      totalGames: 0,
    });
  }

  const unscheduledGames: SchedulerFairnessSummary["unscheduledGames"] = [];
  for (const game of games) {
    if (!game.gameDate || !game.startTime || !game.fieldId) {
      unscheduledGames.push({
        gameNumber: game.gameNumber,
        division: game.division,
        ageGroup: game.ageGroup,
        homeTeamName: game.homeTeamName,
        awayTeamName: game.awayTeamName,
        reasons: game.conflictFlags.length ? game.conflictFlags : ["no_available_slot"],
      });
      continue;
    }

    const early = isEarlyStart(game.startTime, timesByDivision.get(game.division) ?? []);
    for (const item of [
      { teamId: game.homeTeamId, side: "home" as const },
      { teamId: game.awayTeamId, side: "away" as const },
    ]) {
      const stat = teamStats.get(item.teamId);
      if (!stat) continue;
      stat.totalGames += 1;
      if (item.side === "home") stat.homeGames += 1;
      if (item.side === "away") stat.awayGames += 1;
      if (early) stat.earlyGames += 1;
      else stat.lateGames += 1;
    }
  }

  return { teams: [...teamStats.values()], unscheduledGames };
}

export function generateSchedule(params: {
  organizationId: string;
  season: SchedulerSeason;
  teams: SchedulerTeam[];
  fields: SchedulerField[];
  availabilities: SchedulerAvailability[];
  rules: SchedulerDivisionRule[];
  divisions?: string[];
  gamesPerTeam?: number;
}): SchedulerGenerationResult {
  const requestedDivisions = params.divisions?.length ? params.divisions : [...new Set(params.rules.map((rule) => rule.division))];
  const errors: SchedulerGenerationResult["errors"] = [];
  const teamsByDivision = new Map<string, SchedulerTeam[]>();

  for (const division of requestedDivisions) {
    const rule = params.rules.find((entry) => entry.division === division);
    if (!rule) {
      errors.push({ code: "MISSING_MATRIX_RULES", message: `Missing matrix rule for ${division}` });
      continue;
    }
    const ageGroup = rule.ageGroup || division;
    const teams = playableSchedulerTeams(params.teams.filter((team) => team.ageGroup === ageGroup));
    if (teams.length < 2) {
      errors.push({ code: "MISSING_TEAMS", message: `At least two teams are required for ${division}`, details: { division, ageGroup, teamCount: teams.length } });
      continue;
    }
    teamsByDivision.set(division, teams);
  }

  const slots = buildSchedulerSlots(params);
  const matchups = generateRoundRobinMatchups({ teamsByDivision, gamesPerTeam: params.gamesPerTeam });
  const usedSlotIds = new Set<string>();
  const teamSlotTimes = new Set<string>();
  const teamDates = new Set<string>();
  const teamWeeks = new Map<string, number>();
  const teamEarly = new Map<string, number>();
  const teamLate = new Map<string, number>();
  const games: GeneratedDraftGame[] = [];

  for (const matchup of matchups) {
    const rule = params.rules.find((entry) => entry.division === matchup.division);
    const slot = chooseEligibleSlot({
      matchup,
      rule,
      slots,
      usedSlotIds,
      teamSlotTimes,
      teamDates,
      teamWeeks,
      teamEarly,
      teamLate,
    });
    if (!slot) {
      games.push({
        ...matchup,
        gameDate: null,
        startTime: null,
        endTime: null,
        parkId: null,
        fieldId: null,
        status: "CONFLICT",
        sortOrder: matchup.gameNumber,
        conflictFlags: unscheduledReasons({ matchup, rule, slots, usedSlotIds, teamSlotTimes, teamDates, teamWeeks }),
        fairnessMetadata: {},
        schedulerNotes: "No eligible slot was available for this generated matchup.",
      });
      continue;
    }

    usedSlotIds.add(slot.id);
    const slotTime = `${dateKey(slot.date)}:${slot.startTime}`;
    const dayKey = dateKey(slot.date);
    const weekKey = mondayWeekKey(slot.date);
    teamSlotTimes.add(`${matchup.homeTeamId}:${slotTime}`);
    teamSlotTimes.add(`${matchup.awayTeamId}:${slotTime}`);
    teamDates.add(`${matchup.homeTeamId}:${dayKey}`);
    teamDates.add(`${matchup.awayTeamId}:${dayKey}`);
    teamWeeks.set(`${matchup.homeTeamId}:${weekKey}`, (teamWeeks.get(`${matchup.homeTeamId}:${weekKey}`) ?? 0) + 1);
    teamWeeks.set(`${matchup.awayTeamId}:${weekKey}`, (teamWeeks.get(`${matchup.awayTeamId}:${weekKey}`) ?? 0) + 1);
    const early = isEarlyStart(slot.startTime, divisionSlotTimes(slots, matchup.division));
    for (const teamId of [matchup.homeTeamId, matchup.awayTeamId]) {
      if (early) teamEarly.set(teamId, (teamEarly.get(teamId) ?? 0) + 1);
      else teamLate.set(teamId, (teamLate.get(teamId) ?? 0) + 1);
    }
    games.push({
      ...matchup,
      gameDate: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      parkId: slot.parkId,
      fieldId: slot.fieldId,
      status: "DRAFT",
      sortOrder: matchup.gameNumber,
      conflictFlags: [],
      fairnessMetadata: { slotId: slot.id } satisfies Prisma.JsonObject,
      schedulerNotes: null,
    });
  }

  const repaired = repairUnplacedGames({ games, slots, rules: params.rules });
  const checkedGames = checkDraftGameConflicts(repaired.games);
  const fairness = summarizeFairness(checkedGames, params.teams);
  if (fairness.unscheduledGames.length) {
    errors.push({
      code: "INSUFFICIENT_SLOTS",
      message: `${fairness.unscheduledGames.length} games could not be placed. No open field time fit Limits for those matchups.`,
      details: fairness.unscheduledGames,
    });
  }

  return {
    seasonId: params.season.id,
    organizationId: params.organizationId,
    requestedDivisions,
    slots,
    games: checkedGames,
    fairness,
    repair: repaired.summary,
    errors,
  };
}
