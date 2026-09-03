import type { Prisma } from "@prisma/client";

import { playableSchedulerTeams } from "@/lib/scheduler/realTeams";
import { addMinutes, dateKey, jsonStringArray, timeToMinutes } from "./validation";
import type {
  GeneratedDraftGame,
  RoundRobinMatchup,
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

function availabilityDates(season: SchedulerSeason, availability: SchedulerAvailability): Date[] {
  if (availability.date) return [availability.date];
  if (availability.dayOfWeek === null) return [];
  return enumerateDates(season.startsOn, season.endsOn).filter((date) => availability.dayOfWeek === dayOfWeekUtc(date));
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
            supportedAgeGroups: jsonStringArray(field.supportedAgeGroups),
            supportedDivisions: jsonStringArray(field.supportedDivisions),
          });
        }
      }
    }
  }

  return slots.sort((a, b) => `${a.gameDate} ${a.startTime} ${a.fieldName || ""}`.localeCompare(`${b.gameDate} ${b.startTime} ${b.fieldName || ""}`));
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

    const slotTime = `${dateKey(slot.date)}:${slot.startTime}`;
    if (
      params.teamSlotTimes.has(`${params.matchup.homeTeamId}:${slotTime}`) ||
      params.teamSlotTimes.has(`${params.matchup.awayTeamId}:${slotTime}`)
    ) {
      reasons.add("team_already_scheduled_in_slot");
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

export function summarizeFairness(games: GeneratedDraftGame[], teams: SchedulerTeam[]): SchedulerFairnessSummary {
  const starts = games.map((game) => timeToMinutes(game.startTime)).filter((value): value is number => value !== null);
  const earliest = starts.length ? Math.min(...starts) : null;
  const latest = starts.length ? Math.max(...starts) : null;
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

    const start = timeToMinutes(game.startTime);
    for (const item of [
      { teamId: game.homeTeamId, side: "home" as const },
      { teamId: game.awayTeamId, side: "away" as const },
    ]) {
      const stat = teamStats.get(item.teamId);
      if (!stat) continue;
      stat.totalGames += 1;
      if (item.side === "home") stat.homeGames += 1;
      if (item.side === "away") stat.awayGames += 1;
      if (start !== null && earliest !== null && start === earliest) stat.earlyGames += 1;
      if (start !== null && latest !== null && start === latest) stat.lateGames += 1;
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
  const games: GeneratedDraftGame[] = [];

  for (const matchup of matchups) {
    const rule = params.rules.find((entry) => entry.division === matchup.division);
    const slot = slots.find((candidate) => {
      if (usedSlotIds.has(candidate.id)) return false;
      if (ruleAllowsSlot(rule, matchup, candidate).length > 0) return false;
      const slotTime = `${dateKey(candidate.date)}:${candidate.startTime}`;
      return !teamSlotTimes.has(`${matchup.homeTeamId}:${slotTime}`) && !teamSlotTimes.has(`${matchup.awayTeamId}:${slotTime}`);
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
        conflictFlags: unscheduledReasons({ matchup, rule, slots, usedSlotIds, teamSlotTimes }),
        fairnessMetadata: {},
        schedulerNotes: "No eligible slot was available for this generated matchup.",
      });
      continue;
    }

    usedSlotIds.add(slot.id);
    const slotTime = `${dateKey(slot.date)}:${slot.startTime}`;
    teamSlotTimes.add(`${matchup.homeTeamId}:${slotTime}`);
    teamSlotTimes.add(`${matchup.awayTeamId}:${slotTime}`);
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

  const checkedGames = checkDraftGameConflicts(games);
  const fairness = summarizeFairness(checkedGames, params.teams);
  if (fairness.unscheduledGames.length) {
    errors.push({
      code: "INSUFFICIENT_SLOTS",
      message: `${fairness.unscheduledGames.length} games could not be scheduled with the available slots`,
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
    errors,
  };
}
