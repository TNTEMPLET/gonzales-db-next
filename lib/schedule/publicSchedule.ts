import { formatNotifyClock, NOTIFY_DAY_NAMES } from "@/lib/scheduler/coachScheduleEmail";
import { compareFieldNames } from "@/lib/scheduler/directorScheduleEmail";

export const PUBLIC_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type PublicScheduleGame = {
  id: string;
  dateKey: string;
  weekdayIndex: number;
  weekdayName: string;
  dateLabel: string;
  timeLabel: string;
  startTime: string;
  ageGroup: string;
  homeTeam: string;
  awayTeam: string;
  parkName: string;
  fieldName: string;
  status: "A" | "C";
  homeTeamId: string | null;
  awayTeamId: string | null;
};

export type PublicPracticeSlot = {
  id: string;
  weekdayIndex: number;
  weekdayName: string;
  timeLabel: string;
  startTime: string;
  ageGroup: string;
  teamName: string;
  teamId: string;
  parkName: string;
  fieldName: string;
  pairTeamName: string | null;
};

export type PublicWeekdayGameGroup = {
  weekdayIndex: number;
  weekdayName: string;
  games: PublicScheduleGame[];
};

export type PublicFieldGameGroup = {
  fieldName: string;
  weekdays: PublicWeekdayGameGroup[];
};

export type PublicParkGameGroup = {
  parkName: string;
  fields: PublicFieldGameGroup[];
};

export type PublicWeekdayPracticeGroup = {
  weekdayIndex: number;
  weekdayName: string;
  slots: PublicPracticeSlot[];
};

export type PublicFieldPracticeGroup = {
  fieldName: string;
  weekdays: PublicWeekdayPracticeGroup[];
};

export type PublicParkPracticeGroup = {
  parkName: string;
  fields: PublicFieldPracticeGroup[];
};

export function weekdayIndexFromDateKey(dateKey: string): number {
  const day = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
  return Number.isFinite(day) ? day : 0;
}

export function weekdayName(index: number): string {
  return NOTIFY_DAY_NAMES[index] ?? "Unknown";
}

export function formatPublicDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return dateKey;
  const utc = new Date(`${dateKey}T12:00:00.000Z`);
  return utc.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isPlacedPublicGame(row: {
  gameDate: Date | string | null;
  startTime: string | null | undefined;
  homeTeamName: string | null | undefined;
  awayTeamName: string | null | undefined;
  status: string;
}): boolean {
  if (row.status === "CANCELED") return false;
  if (!row.gameDate || !row.startTime?.trim()) return false;
  if (!row.homeTeamName?.trim() || !row.awayTeamName?.trim()) return false;
  return true;
}

function compareWeekday(a: number, b: number): number {
  return PUBLIC_WEEKDAY_ORDER.indexOf(a as (typeof PUBLIC_WEEKDAY_ORDER)[number])
    - PUBLIC_WEEKDAY_ORDER.indexOf(b as (typeof PUBLIC_WEEKDAY_ORDER)[number]);
}

function compareAgeGroupLabel(a: string, b: string): number {
  const num = (value: string) => {
    const match = value.match(/(\d{1,2})/);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  };
  const left = num(a);
  const right = num(b);
  if (left !== right) return left - right;
  return a.localeCompare(b);
}

export function comparePublicGames(a: PublicScheduleGame, b: PublicScheduleGame): number {
  return (
    a.parkName.localeCompare(b.parkName) ||
    compareFieldNames(a.fieldName, b.fieldName) ||
    compareWeekday(a.weekdayIndex, b.weekdayIndex) ||
    a.dateKey.localeCompare(b.dateKey) ||
    a.startTime.localeCompare(b.startTime) ||
    compareAgeGroupLabel(a.ageGroup, b.ageGroup) ||
    a.homeTeam.localeCompare(b.homeTeam)
  );
}

export function groupPublicGames(games: PublicScheduleGame[]): PublicParkGameGroup[] {
  const sorted = [...games].sort(comparePublicGames);
  const parks: PublicParkGameGroup[] = [];
  for (const game of sorted) {
    let park = parks.find((item) => item.parkName === game.parkName);
    if (!park) {
      park = { parkName: game.parkName, fields: [] };
      parks.push(park);
    }
    let field = park.fields.find((item) => item.fieldName === game.fieldName);
    if (!field) {
      field = { fieldName: game.fieldName, weekdays: [] };
      park.fields.push(field);
    }
    let weekday = field.weekdays.find((item) => item.weekdayIndex === game.weekdayIndex);
    if (!weekday) {
      weekday = {
        weekdayIndex: game.weekdayIndex,
        weekdayName: game.weekdayName,
        games: [],
      };
      field.weekdays.push(weekday);
    }
    weekday.games.push(game);
  }
  return parks;
}

export function comparePublicPractices(a: PublicPracticeSlot, b: PublicPracticeSlot): number {
  return (
    a.parkName.localeCompare(b.parkName) ||
    compareFieldNames(a.fieldName, b.fieldName) ||
    compareWeekday(a.weekdayIndex, b.weekdayIndex) ||
    a.startTime.localeCompare(b.startTime) ||
    compareAgeGroupLabel(a.ageGroup, b.ageGroup) ||
    a.teamName.localeCompare(b.teamName)
  );
}

export function groupPublicPractices(slots: PublicPracticeSlot[]): PublicParkPracticeGroup[] {
  const sorted = [...slots].sort(comparePublicPractices);
  const parks: PublicParkPracticeGroup[] = [];
  for (const slot of sorted) {
    let park = parks.find((item) => item.parkName === slot.parkName);
    if (!park) {
      park = { parkName: slot.parkName, fields: [] };
      parks.push(park);
    }
    let field = park.fields.find((item) => item.fieldName === slot.fieldName);
    if (!field) {
      field = { fieldName: slot.fieldName, weekdays: [] };
      park.fields.push(field);
    }
    let weekday = field.weekdays.find((item) => item.weekdayIndex === slot.weekdayIndex);
    if (!weekday) {
      weekday = {
        weekdayIndex: slot.weekdayIndex,
        weekdayName: slot.weekdayName,
        slots: [],
      };
      field.weekdays.push(weekday);
    }
    weekday.slots.push(slot);
  }
  return parks;
}

export function filterPublicGames(
  games: PublicScheduleGame[],
  filters: { ageGroups?: string[]; teams?: string[]; parks?: string[] },
): PublicScheduleGame[] {
  const ages = filters.ageGroups ?? [];
  const teams = filters.teams ?? [];
  const parks = filters.parks ?? [];
  return games.filter((game) => {
    if (ages.length && !ages.includes(game.ageGroup)) return false;
    if (parks.length && !parks.includes(game.parkName)) return false;
    if (
      teams.length &&
      !teams.includes(game.homeTeam) &&
      !teams.includes(game.awayTeam)
    ) {
      return false;
    }
    return true;
  });
}

export function filterPublicPractices(
  slots: PublicPracticeSlot[],
  filters: { ageGroups?: string[]; teams?: string[]; parks?: string[] },
): PublicPracticeSlot[] {
  const ages = filters.ageGroups ?? [];
  const teams = filters.teams ?? [];
  const parks = filters.parks ?? [];
  return slots.filter((slot) => {
    if (ages.length && !ages.includes(slot.ageGroup)) return false;
    if (parks.length && !parks.includes(slot.parkName)) return false;
    if (
      teams.length &&
      !teams.includes(slot.teamName) &&
      !(slot.pairTeamName && teams.includes(slot.pairTeamName))
    ) {
      return false;
    }
    return true;
  });
}

export function uniqueAgeGroupsFromGames(games: PublicScheduleGame[]): string[] {
  return Array.from(new Set(games.map((game) => game.ageGroup).filter(Boolean))).sort(
    compareAgeGroupLabel,
  );
}

export function uniqueTeamsFromGames(
  games: PublicScheduleGame[],
  ageGroups: string[],
  parks: string[] = [],
): string[] {
  const names = new Set<string>();
  for (const game of games) {
    if (ageGroups.length && !ageGroups.includes(game.ageGroup)) continue;
    if (parks.length && !parks.includes(game.parkName)) continue;
    names.add(game.homeTeam);
    names.add(game.awayTeam);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function uniqueParksFromGames(
  games: PublicScheduleGame[],
  ageGroups: string[] = [],
): string[] {
  const names = new Set<string>();
  for (const game of games) {
    if (ageGroups.length && !ageGroups.includes(game.ageGroup)) continue;
    if (game.parkName) names.add(game.parkName);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function uniqueAgeGroupsFromPractices(slots: PublicPracticeSlot[]): string[] {
  return Array.from(new Set(slots.map((slot) => slot.ageGroup).filter(Boolean))).sort(
    compareAgeGroupLabel,
  );
}

export function uniqueTeamsFromPractices(
  slots: PublicPracticeSlot[],
  ageGroups: string[],
  parks: string[] = [],
): string[] {
  const names = new Set<string>();
  for (const slot of slots) {
    if (ageGroups.length && !ageGroups.includes(slot.ageGroup)) continue;
    if (parks.length && !parks.includes(slot.parkName)) continue;
    names.add(slot.teamName);
    if (slot.pairTeamName) names.add(slot.pairTeamName);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function uniqueParksFromPractices(
  slots: PublicPracticeSlot[],
  ageGroups: string[] = [],
): string[] {
  const names = new Set<string>();
  for (const slot of slots) {
    if (ageGroups.length && !ageGroups.includes(slot.ageGroup)) continue;
    if (slot.parkName) names.add(slot.parkName);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export function formatPublicClock(startTime: string): string {
  return formatNotifyClock(startTime) || startTime;
}

/** Shape Dugout / Coach Corner already render. */
export function toLegacyScheduleGame(game: PublicScheduleGame) {
  return {
    id: game.id,
    start_time: `${game.dateKey}T${game.startTime}:00`,
    localized_date: game.dateLabel,
    localized_time: game.timeLabel,
    age_group: game.ageGroup,
    home_team: game.homeTeam,
    away_team: game.awayTeam,
    status: game.status,
    subvenue: game.fieldName,
    _embedded: { venue: { name: game.parkName } },
  };
}
