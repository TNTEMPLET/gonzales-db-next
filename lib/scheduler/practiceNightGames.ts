import { parseSeasonDateWindows, parseUtcDateOnly } from "./seasonWindows";
import { addMinutes, dateKey } from "./validation";
import { checkDraftGameConflicts, packOneFactorSchedule, summarizeFairness } from "./generator";
import type {
  SchedulerDivisionRule,
  SchedulerField,
  SchedulerGenerationResult,
  SchedulerSeason,
  SchedulerSlot,
  SchedulerTeam,
} from "./types";

export type PracticeNightSlot = {
  ageGroup: string;
  team: SchedulerTeam;
  dayOfWeek: number;
  startTime: string;
  parkId: string | null;
  fieldId: string | null;
};

function enumerateDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor <= last) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function cohortKey(days: number[]): "MW" | "TTh" | null {
  const set = new Set(days);
  const mw = set.has(1) || set.has(3);
  const tth = set.has(2) || set.has(4);
  if (mw && !tth) return "MW";
  if (tth && !mw) return "TTh";
  return null;
}

export function generateGamesFromPracticeNights(params: {
  organizationId: string;
  season: SchedulerSeason;
  teams: SchedulerTeam[];
  fields: SchedulerField[];
  rules: SchedulerDivisionRule[];
  slots: PracticeNightSlot[];
  divisions: string[];
}): SchedulerGenerationResult {
  const windows = parseSeasonDateWindows(
    params.season.settings,
    params.season.startsOn ? dateKey(params.season.startsOn) : "",
    params.season.endsOn ? dateKey(params.season.endsOn) : "",
  );
  const start = parseUtcDateOnly(windows.gamesStartsOn);
  const end = parseUtcDateOnly(windows.gamesEndsOn);
  const dates = start && end ? enumerateDates(start, end) : [];
  const firstWeek = new Set(dates.slice(0, 4).map((date) => dateKey(date)));
  const games = [];
  const errors: SchedulerGenerationResult["errors"] = [];

  for (const division of params.divisions) {
    const rule = params.rules.find((entry) => entry.division === division);
    const divisionSlots = params.slots.filter((slot) => slot.ageGroup === division);
    const byTeam = new Map<string, PracticeNightSlot[]>();
    for (const slot of divisionSlots) {
      const list = byTeam.get(slot.team.id) ?? [];
      list.push(slot);
      byTeam.set(slot.team.id, list);
    }
    const cohorts: Record<"MW" | "TTh", PracticeNightSlot[]> = { MW: [], TTh: [] };
    for (const teamSlots of byTeam.values()) {
      const key = cohortKey(teamSlots.map((slot) => slot.dayOfWeek));
      if (!key) continue;
      cohorts[key].push(teamSlots[0]!);
    }
    for (const [key, members] of Object.entries(cohorts) as Array<["MW" | "TTh", PracticeNightSlot[]]>) {
      const weekdays = key === "MW" ? [1, 3] : [2, 4];
      const fieldIds = [...new Set(members.map((slot) => slot.fieldId).filter((id): id is string => Boolean(id)))];
      const startTime = members[0]?.startTime ?? "17:45";
      const syntheticSlots: SchedulerSlot[] = [];
      for (const date of dates.filter((item) => weekdays.includes(item.getUTCDay()))) {
        for (const fieldId of fieldIds) {
          const field = params.fields.find((item) => item.id === fieldId);
          if (!field) continue;
          syntheticSlots.push({
            id: `${dateKey(date)}:${fieldId}:${startTime}`,
            date,
            gameDate: dateKey(date),
            startTime,
            endTime: addMinutes(startTime, 90),
            parkId: field.parkId,
            fieldId: field.id,
            parkName: field.park?.name,
            fieldName: field.name,
            supportedAgeGroups: [division],
            supportedDivisions: [division],
          });
        }
      }
      if (members.length < 2 || !syntheticSlots.length) continue;
      const teamsByDivision = new Map<string, SchedulerTeam[]>([[division, members.map((slot) => slot.team)]]);
      const packed = packOneFactorSchedule({
        slots: syntheticSlots,
        teamsByDivision,
        rules: rule ? [rule] : [],
        gamesPerTeam: dates.filter((item) => weekdays.includes(item.getUTCDay())).length,
      });
      games.push(
        ...packed.map((game) => ({
          ...game,
          roundLabel: game.gameDate && firstWeek.has(dateKey(game.gameDate)) ? "Scrimmage" : game.roundLabel,
        })),
      );
    }
    if (!games.some((game) => game.division === division)) {
      errors.push({ code: "MISSING_TEAMS", message: `${division} needs practice nights (Mon/Wed or Tue/Thu) before games can be built` });
    }
  }

  const checked = checkDraftGameConflicts(games);
  return {
    seasonId: params.season.id,
    organizationId: params.organizationId,
    requestedDivisions: params.divisions,
    slots: [],
    games: checked,
    fairness: summarizeFairness(checked, params.teams),
    errors,
  };
}


