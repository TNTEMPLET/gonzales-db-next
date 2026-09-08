import { parseSeasonGamesPerTeam } from "./seasonWindows";
import { addMinutes, dateKey } from "./validation";
import { parseFieldPriorityIds } from "./fieldPriority";
import { buildSchedulerSlots, checkDraftGameConflicts, summarizeFairness } from "./generator";
import type {
  GeneratedDraftGame,
  SchedulerAvailability,
  SchedulerDivisionRule,
  SchedulerErrorCode,
  SchedulerField,
  SchedulerGenerationResult,
  SchedulerSeason,
  SchedulerSlot,
  SchedulerTeam,
} from "./types";
import { playableSchedulerTeams } from "./realTeams";

function slotMatchesDivision(slot: SchedulerSlot, division: string, ageGroup: string): boolean {
  const haystack = [...slot.supportedDivisions, ...slot.supportedAgeGroups];
  if (!haystack.length) return true;
  return haystack.includes(division) || haystack.includes(ageGroup);
}

function pickNightSlots(slots: SchedulerSlot[], priorityIds: string[]): SchedulerSlot[] | null {
  const byField = new Map<string, SchedulerSlot[]>();
  for (const slot of slots) {
    const list = byField.get(slot.fieldId) ?? [];
    list.push(slot);
    byField.set(slot.fieldId, list);
  }
  const ranked = [
    ...priorityIds.filter((id) => byField.has(id)),
    ...[...byField.keys()].filter((id) => !priorityIds.includes(id)),
  ];
  for (const fieldId of ranked) {
    const unique = [...(byField.get(fieldId) ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const times = [...new Set(unique.map((slot) => slot.startTime))];
    if (times.length >= 2) {
      const early = unique.find((slot) => slot.startTime === times[0]);
      const late = unique.find((slot) => slot.startTime === times[1]);
      if (early && late) return [early, late];
    }
  }
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.fieldId.localeCompare(b.fieldId));
  if (sorted.length < 2) return null;
  if (sorted[0]!.startTime === sorted[1]!.startTime) return null;
  return [sorted[0]!, sorted[1]!];
}

function toGame(params: {
  division: string;
  ageGroup: string;
  home: SchedulerTeam;
  away: SchedulerTeam;
  slot: SchedulerSlot;
  gameNumber: number;
  roundLabel: string;
}): GeneratedDraftGame {
  return {
    division: params.division,
    ageGroup: params.ageGroup,
    homeTeamId: params.home.id,
    awayTeamId: params.away.id,
    homeTeamName: params.home.teamName,
    awayTeamName: params.away.teamName,
    roundLabel: params.roundLabel,
    gameNumber: params.gameNumber,
    gameDate: params.slot.date,
    startTime: params.slot.startTime,
    endTime: params.slot.endTime || addMinutes(params.slot.startTime, 90),
    parkId: params.slot.parkId,
    fieldId: params.slot.fieldId,
    status: "DRAFT",
    sortOrder: params.gameNumber,
    conflictFlags: [],
    fairnessMetadata: { packer: "threeTeamDoubleheader" },
    schedulerNotes: null,
  };
}

export function generateThreeTeamDoubleheaders(params: {
  organizationId: string;
  season: SchedulerSeason;
  teams: SchedulerTeam[];
  fields: SchedulerField[];
  availabilities: SchedulerAvailability[];
  rules: SchedulerDivisionRule[];
  divisions: string[];
}): SchedulerGenerationResult {
  const errors: SchedulerGenerationResult["errors"] = [];
  const slots = buildSchedulerSlots(params);
  const games: GeneratedDraftGame[] = [];
  const gamesPerTeam = parseSeasonGamesPerTeam(params.season.settings);
  let gameNumber = 1;

  for (const division of params.divisions) {
    const rule = params.rules.find((entry) => entry.division === division);
    if (!rule) {
      errors.push({ code: "MISSING_MATRIX_RULES", message: `Missing matrix rule for ${division}` });
      continue;
    }
    const ageGroup = rule.ageGroup || division;
    const teams = playableSchedulerTeams(params.teams.filter((team) => team.ageGroup === ageGroup)).sort((a, b) =>
      a.teamName.localeCompare(b.teamName),
    );
    if (teams.length !== 3) {
      errors.push({
        code: "MISSING_TEAMS",
        message: `${division} doubleheaders need exactly 3 teams (found ${teams.length})`,
        details: { division, teamCount: teams.length },
      });
      continue;
    }
    const divisionSlots = slots.filter((slot) => slotMatchesDivision(slot, division, ageGroup));
    const byDate = new Map<string, SchedulerSlot[]>();
    for (const slot of divisionSlots) {
      const list = byDate.get(slot.gameDate) ?? [];
      list.push(slot);
      byDate.set(slot.gameDate, list);
    }
    const nights = [...byDate.keys()].sort();
    const totals = new Map(teams.map((team) => [team.id, 0]));
    const priorityIds = parseFieldPriorityIds(rule.ruleMetadata);
    let nightIndex = 0;
    for (const date of nights) {
      const pair = pickNightSlots(byDate.get(date) ?? [], priorityIds);
      if (!pair) continue;
      const dh = teams[nightIndex % 3]!;
      const others = teams.filter((team) => team.id !== dh.id);
      if ((totals.get(dh.id) ?? 0) + 2 > gamesPerTeam) break;
      const [early, late] = pair;
      games.push(
        toGame({
          division,
          ageGroup,
          home: dh,
          away: others[0]!,
          slot: early,
          gameNumber,
          roundLabel: `DH ${dateKey(early.date)} early`,
        }),
      );
      gameNumber += 1;
      games.push(
        toGame({
          division,
          ageGroup,
          home: others[1]!,
          away: dh,
          slot: late,
          gameNumber,
          roundLabel: `DH ${dateKey(late.date)} late`,
        }),
      );
      gameNumber += 1;
      totals.set(dh.id, (totals.get(dh.id) ?? 0) + 2);
      totals.set(others[0]!.id, (totals.get(others[0]!.id) ?? 0) + 1);
      totals.set(others[1]!.id, (totals.get(others[1]!.id) ?? 0) + 1);
      nightIndex += 1;
    }
    if (nightIndex === 0) {
      errors.push({
        code: "INSUFFICIENT_SLOTS" satisfies SchedulerErrorCode,
        message: `${division} needs two start times on a night to place a doubleheader`,
        details: { division },
      });
    }
  }

  const checked = checkDraftGameConflicts(games);
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
