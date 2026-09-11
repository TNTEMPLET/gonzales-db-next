import { parseScheduleMode } from "./scheduleMode";
import { parseSeasonDateWindows, parseUtcDateOnly } from "./seasonWindows";
import { playableSchedulerTeams } from "./realTeams";
import { packOneFactorSchedule, buildSchedulerSlots, checkDraftGameConflicts, summarizeFairness } from "./generator";
import { continueThreeTeamDoubleheaders, occupyingSlotKey } from "./threeTeamDoubleheaders";
import { dateKey } from "./validation";
import type {
  GeneratedDraftGame,
  SchedulerAvailability,
  SchedulerDivisionRule,
  SchedulerField,
  SchedulerGenerationResult,
  SchedulerSeason,
  SchedulerSlot,
  SchedulerTeam,
} from "./types";

export type FillExtraGamesParams = {
  organizationId: string;
  season: SchedulerSeason;
  teams: SchedulerTeam[];
  fields: SchedulerField[];
  availabilities: SchedulerAvailability[];
  rules: SchedulerDivisionRule[];
  divisions: string[];
  existingGames: GeneratedDraftGame[];
  fillStartsOn?: string | null;
  fillEndsOn?: string | null;
  extraGamesPerTeam?: number | null;
};

function isoDay(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim().slice(0, 10);
  return dateKey(value);
}

function addUtcDays(iso: string, days: number): string {
  const parsed = parseUtcDateOnly(iso);
  if (!parsed) return iso;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return dateKey(parsed);
}

export function resolveFillWindow(params: {
  season: SchedulerSeason;
  existingGames: GeneratedDraftGame[];
  fillStartsOn?: string | null;
  fillEndsOn?: string | null;
}): { fillStartsOn: string; fillEndsOn: string } {
  const windows = parseSeasonDateWindows(
    params.season.settings,
    params.season.startsOn ? dateKey(params.season.startsOn) : "",
    params.season.endsOn ? dateKey(params.season.endsOn) : "",
  );
  const lastExisting = params.existingGames
    .map((game) => isoDay(game.gameDate))
    .filter(Boolean)
    .sort()
    .at(-1);
  const fillStartsOn =
    params.fillStartsOn?.trim().slice(0, 10) ||
    (lastExisting ? addUtcDays(lastExisting, 1) : windows.gamesStartsOn);
  const fillEndsOn = params.fillEndsOn?.trim().slice(0, 10) || windows.gamesEndsOn;
  return { fillStartsOn, fillEndsOn };
}

function occupiedKeysFromGames(games: GeneratedDraftGame[]): Set<string> {
  const keys = new Set<string>();
  for (const game of games) {
    const key = occupyingSlotKey(game);
    if (key) keys.add(key);
  }
  return keys;
}

function remapGameNumbers(existing: GeneratedDraftGame[], added: GeneratedDraftGame[]): GeneratedDraftGame[] {
  let next = Math.max(0, ...existing.map((game) => game.gameNumber || 0));
  return added.map((game) => {
    next += 1;
    return { ...game, gameNumber: next, sortOrder: next };
  });
}

function fillOneFactorDivision(params: {
  slots: SchedulerSlot[];
  teams: SchedulerTeam[];
  rule: SchedulerDivisionRule;
  division: string;
  extraGamesPerTeam: number | null;
  fillStartsOn: string;
  fillEndsOn: string;
  occupied: Set<string>;
}): GeneratedDraftGame[] {
  const openSlots = params.slots.filter((slot) => {
    if (slot.gameDate < params.fillStartsOn || slot.gameDate > params.fillEndsOn) return false;
    return !params.occupied.has(`${slot.fieldId}|${slot.gameDate}|${slot.startTime}`);
  });
  const openNights = new Set(openSlots.map((slot) => slot.gameDate)).size;
  const gamesPerTeam = params.extraGamesPerTeam && params.extraGamesPerTeam > 0 ? params.extraGamesPerTeam : openNights;
  if (gamesPerTeam < 1 || params.teams.length < 2) return [];
  const packed = packOneFactorSchedule({
    slots: openSlots,
    teamsByDivision: new Map([[params.division, params.teams]]),
    rules: [params.rule],
    gamesPerTeam,
  });
  return packed.filter((game) => game.gameDate && game.startTime && game.fieldId);
}

export function fillExtraGames(params: FillExtraGamesParams): SchedulerGenerationResult {
  const extra =
    params.extraGamesPerTeam != null && Number.isInteger(params.extraGamesPerTeam) && params.extraGamesPerTeam > 0
      ? params.extraGamesPerTeam
      : null;
  const selectedExisting = params.existingGames.filter((game) => params.divisions.includes(game.division));
  const { fillStartsOn, fillEndsOn } = resolveFillWindow({
    season: params.season,
    existingGames: selectedExisting,
    fillStartsOn: params.fillStartsOn,
    fillEndsOn: params.fillEndsOn,
  });
  const errors: SchedulerGenerationResult["errors"] = [];
  if (!fillStartsOn || !fillEndsOn || fillStartsOn > fillEndsOn) {
    errors.push({
      code: "INVALID_INPUT",
      message: "Fill window needs a start date on or before the end date",
      details: { fillStartsOn, fillEndsOn },
    });
    return {
      seasonId: params.season.id,
      organizationId: params.organizationId,
      requestedDivisions: params.divisions,
      slots: [],
      games: [],
      fairness: { teams: [], unscheduledGames: [] },
      errors,
    };
  }

  const dhDivisions: string[] = [];
  const autoDivisions: string[] = [];
  for (const division of params.divisions) {
    const rule = params.rules.find((entry) => entry.division === division);
    const mode = parseScheduleMode(rule?.ruleMetadata, division);
    if (mode === "manual") dhDivisions.push(division);
    else if (mode === "auto") autoDivisions.push(division);
  }

  const occupied = occupiedKeysFromGames(params.existingGames);
  const added: GeneratedDraftGame[] = [];
  const slots = buildSchedulerSlots(params);

  if (dhDivisions.length) {
    const dh = continueThreeTeamDoubleheaders({
      organizationId: params.organizationId,
      season: params.season,
      teams: params.teams,
      fields: params.fields,
      availabilities: params.availabilities,
      rules: params.rules,
      divisions: dhDivisions,
      existingGames: params.existingGames,
      occupiedKeys: occupied,
      fillStartsOn,
      fillEndsOn,
      extraGamesPerTeam: extra,
    });
    added.push(...dh.games);
    errors.push(...dh.errors);
    for (const game of dh.games) {
      const key = occupyingSlotKey(game);
      if (key) occupied.add(key);
    }
  }

  for (const division of autoDivisions) {
    const rule = params.rules.find((entry) => entry.division === division);
    if (!rule) {
      errors.push({ code: "MISSING_MATRIX_RULES", message: `Missing matrix rule for ${division}` });
      continue;
    }
    const ageGroup = rule.ageGroup || division;
    const teams = playableSchedulerTeams(params.teams.filter((team) => team.ageGroup === ageGroup));
    if (teams.length < 2) {
      errors.push({
        code: "MISSING_TEAMS",
        message: `At least two teams are required for ${division}`,
        details: { division, teamCount: teams.length },
      });
      continue;
    }
    const packed = fillOneFactorDivision({
      slots,
      teams,
      rule,
      division,
      extraGamesPerTeam: extra,
      fillStartsOn,
      fillEndsOn,
      occupied,
    });
    if (!packed.length) {
      errors.push({
        code: "INSUFFICIENT_SLOTS",
        message: `${division} has no open 1-factor night in the fill window`,
        details: { division },
      });
      continue;
    }
    added.push(...packed);
    for (const game of packed) {
      const key = occupyingSlotKey(game);
      if (key) occupied.add(key);
    }
  }

  const numbered = remapGameNumbers(params.existingGames, added);
  const checked = checkDraftGameConflicts(numbered);
  return {
    seasonId: params.season.id,
    organizationId: params.organizationId,
    requestedDivisions: params.divisions,
    slots,
    games: checked,
    fairness: summarizeFairness(checked, params.teams),
    errors,
  };
}
