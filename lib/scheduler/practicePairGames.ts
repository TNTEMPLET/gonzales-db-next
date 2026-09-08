import { parseSeasonDateWindows, parseUtcDateOnly } from "./seasonWindows";
import { addMinutes, dateKey } from "./validation";
import { checkDraftGameConflicts, summarizeFairness } from "./generator";
import type {
  GeneratedDraftGame,
  SchedulerErrorCode,
  SchedulerField,
  SchedulerGenerationResult,
  SchedulerSeason,
  SchedulerTeam,
} from "./types";

export type PracticePairInput = {
  ageGroup: string;
  dayOfWeek: number;
  startTime: string;
  parkId: string | null;
  fieldId: string | null;
  home: SchedulerTeam;
  away: SchedulerTeam;
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

export function generateGamesFromPracticePairs(params: {
  organizationId: string;
  season: SchedulerSeason;
  teams: SchedulerTeam[];
  fields: SchedulerField[];
  pairs: PracticePairInput[];
  divisions: string[];
}): SchedulerGenerationResult {
  const errors: SchedulerGenerationResult["errors"] = [];
  const windows = parseSeasonDateWindows(
    params.season.settings,
    params.season.startsOn ? dateKey(params.season.startsOn) : "",
    params.season.endsOn ? dateKey(params.season.endsOn) : "",
  );
  const start = parseUtcDateOnly(windows.gamesStartsOn);
  const end = parseUtcDateOnly(windows.gamesEndsOn);
  if (!start || !end) {
    errors.push({
      code: "INVALID_INPUT" satisfies SchedulerErrorCode,
      message: "Games window is required to convert practice pairs",
    });
  }
  const dates = start && end ? enumerateDates(start, end) : [];
  const games: GeneratedDraftGame[] = [];
  let gameNumber = 1;

  for (const division of params.divisions) {
    const pairs = params.pairs.filter((pair) => pair.ageGroup === division);
    if (!pairs.length) {
      errors.push({
        code: "MISSING_TEAMS" satisfies SchedulerErrorCode,
        message: `${division} has no shared-field practice pairs to convert`,
        details: { division },
      });
      continue;
    }
    for (const pair of pairs) {
      const nights = dates.filter((date) => date.getUTCDay() === pair.dayOfWeek);
      if (!nights.length) {
        errors.push({
          code: "INSUFFICIENT_SLOTS" satisfies SchedulerErrorCode,
          message: `${division} practice pair ${pair.home.teamName} / ${pair.away.teamName} has no games-window ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][pair.dayOfWeek]} dates`,
        });
        continue;
      }
      const field = params.fields.find((item) => item.id === pair.fieldId) ?? null;
      for (const date of nights) {
        games.push({
          division,
          ageGroup: pair.ageGroup,
          homeTeamId: pair.home.id,
          awayTeamId: pair.away.id,
          homeTeamName: pair.home.teamName,
          awayTeamName: pair.away.teamName,
          roundLabel: `Practice pair · ${dateKey(date)}`,
          gameNumber,
          gameDate: date,
          startTime: pair.startTime,
          endTime: addMinutes(pair.startTime, 90),
          parkId: pair.parkId ?? field?.parkId ?? null,
          fieldId: pair.fieldId,
          status: "DRAFT",
          sortOrder: gameNumber,
          conflictFlags: [],
          fairnessMetadata: { packer: "practicePair" },
          schedulerNotes: null,
        });
        gameNumber += 1;
      }
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
