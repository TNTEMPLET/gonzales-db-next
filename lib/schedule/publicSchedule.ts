import { formatNotifyClock, NOTIFY_DAY_NAMES } from "@/lib/scheduler/coachScheduleEmail";
import { compareFieldNames } from "@/lib/scheduler/directorScheduleEmail";
import { parseRotationNote } from "@/lib/scheduler/practiceBoard";

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
  sharedFieldGroupId?: string | null;
  notes?: string | null;
  rotationWeek?: number | null;
  dateKey?: string | null;
  dateLabel?: string | null;
};

export type PublicDateGameGroup = {
  dateKey: string;
  dateLabel: string;
  weekdayIndex: number;
  weekdayName: string;
  games: PublicScheduleGame[];
};

export type PublicParkGameGroup = {
  parkName: string;
  dates: PublicDateGameGroup[];
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

export type PublicDatePracticeGroup = {
  dateKey: string;
  dateLabel: string;
  slots: PublicPracticeSlot[];
};

export type PublicParkPracticeGroup = {
  parkName: string;
  fields: PublicFieldPracticeGroup[];
  dates: PublicDatePracticeGroup[];
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

export const PUBLIC_POSTED_GAME_STATUSES = ["LOCKED", "EXPORTED"] as const;

export function isPostedPublicGameStatus(status: string): boolean {
  return (PUBLIC_POSTED_GAME_STATUSES as readonly string[]).includes(status);
}

export function isPlacedPublicGame(row: {
  gameDate: Date | string | null;
  startTime: string | null | undefined;
  homeTeamName: string | null | undefined;
  awayTeamName: string | null | undefined;
  status: string;
}): boolean {
  if (!isPostedPublicGameStatus(row.status)) return false;
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
    a.dateKey.localeCompare(b.dateKey) ||
    compareWeekday(a.weekdayIndex, b.weekdayIndex) ||
    a.parkName.localeCompare(b.parkName) ||
    compareFieldNames(a.fieldName, b.fieldName) ||
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
      park = { parkName: game.parkName, dates: [] };
      parks.push(park);
    }
    let dateGroup = park.dates.find((item) => item.dateKey === game.dateKey);
    if (!dateGroup) {
      dateGroup = {
        dateKey: game.dateKey,
        dateLabel: game.dateLabel,
        weekdayIndex: game.weekdayIndex,
        weekdayName: game.weekdayName,
        games: [],
      };
      park.dates.push(dateGroup);
    }
    dateGroup.games.push(game);
  }
  return parks;
}

export function comparePublicPractices(a: PublicPracticeSlot, b: PublicPracticeSlot): number {
  const park = a.parkName.localeCompare(b.parkName);
  if (park) return park;
  const aDated = Boolean(a.dateKey);
  const bDated = Boolean(b.dateKey);
  if (aDated && bDated) {
    return (
      a.dateKey!.localeCompare(b.dateKey!) ||
      a.startTime.localeCompare(b.startTime) ||
      compareFieldNames(a.fieldName, b.fieldName) ||
      compareAgeGroupLabel(a.ageGroup, b.ageGroup) ||
      a.teamName.localeCompare(b.teamName)
    );
  }
  if (aDated !== bDated) return aDated ? 1 : -1;
  return (
    compareFieldNames(a.fieldName, b.fieldName) ||
    compareWeekday(a.weekdayIndex, b.weekdayIndex) ||
    a.startTime.localeCompare(b.startTime) ||
    compareAgeGroupLabel(a.ageGroup, b.ageGroup) ||
    a.teamName.localeCompare(b.teamName)
  );
}

function utcNoon(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** First Monday on or after a UTC date-only key. */
export function firstMondayOnOrAfter(dateKey: string): string {
  const date = utcNoon(dateKey);
  const add = (8 - date.getUTCDay()) % 7;
  date.setUTCDate(date.getUTCDate() + add);
  return toDateKey(date);
}

function mondayOnOrBefore(dateKey: string): string {
  const date = utcNoon(dateKey);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return toDateKey(date);
}

function datesOnWeekday(startDate: string, endDate: string, weekdayIndex: number): string[] {
  const dates: string[] = [];
  const cursor = utcNoon(startDate);
  const end = utcNoon(endDate);
  while (cursor.getTime() <= end.getTime()) {
    if (cursor.getUTCDay() === weekdayIndex) dates.push(toDateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function rotationWeekOf(slot: PublicPracticeSlot): number {
  return parseRotationNote(slot.notes)?.week || slot.rotationWeek || 0;
}

/**
 * Turn Week 1/2/3 practice rows into dated occurrences across a season window.
 * Week 1 starts the first Monday on or after `startDate`. Standing weekly
 * slots (no Week N note) are left unchanged.
 */
export function expandRotationPracticeSlots(
  slots: PublicPracticeSlot[],
  window: { startDate: string; endDate: string; cycleWeeks?: number },
): PublicPracticeSlot[] {
  const cycleWeeksByAge = new Map<string, number>();
  for (const slot of slots) {
    const parsed = parseRotationNote(slot.notes);
    const week = parsed?.week || slot.rotationWeek || 0;
    const total = parsed?.total || 0;
    if (week > 0) {
      cycleWeeksByAge.set(
        slot.ageGroup,
        Math.max(cycleWeeksByAge.get(slot.ageGroup) ?? 0, week, total, window.cycleWeeks ?? 0),
      );
    }
  }
  const cycleStartMonday = firstMondayOnOrAfter(window.startDate);
  const cycleStartMs = utcNoon(cycleStartMonday).getTime();
  const expanded: PublicPracticeSlot[] = [];
  for (const slot of slots) {
    const week = rotationWeekOf(slot);
    const cycleWeeks = window.cycleWeeks || cycleWeeksByAge.get(slot.ageGroup) || 0;
    if (week < 1 || cycleWeeks <= 1) {
      expanded.push(slot);
      continue;
    }
    for (const dateKey of datesOnWeekday(window.startDate, window.endDate, slot.weekdayIndex)) {
      const weeksFromStart = Math.round(
        (utcNoon(mondayOnOrBefore(dateKey)).getTime() - cycleStartMs) / (7 * 24 * 60 * 60 * 1000),
      );
      if (weeksFromStart < 0) continue;
      if ((weeksFromStart % cycleWeeks) + 1 !== week) continue;
      expanded.push({
        ...slot,
        id: `${slot.id}:${dateKey}`,
        dateKey,
        dateLabel: formatPublicDateLabel(dateKey),
        rotationWeek: week,
      });
    }
  }
  return expanded.sort(comparePublicPractices);
}

function practiceTeamNames(slot: PublicPracticeSlot): string[] {
  const names = [slot.teamName];
  if (slot.pairTeamName) names.push(slot.pairTeamName);
  return names;
}

/** One public row per shared field group (two team rows → one time slot). */
export function collapseSharedPracticeSlots(slots: PublicPracticeSlot[]): PublicPracticeSlot[] {
  const ungrouped: PublicPracticeSlot[] = [];
  const byGroup = new Map<string, PublicPracticeSlot[]>();
  for (const slot of slots) {
    const groupId = slot.sharedFieldGroupId?.trim();
    if (!groupId) {
      ungrouped.push(slot);
      continue;
    }
    const key = slot.dateKey ? `${groupId}::${slot.dateKey}` : groupId;
    const list = byGroup.get(key) ?? [];
    list.push(slot);
    byGroup.set(key, list);
  }

  const collapsed = [...ungrouped];
  for (const members of byGroup.values()) {
    if (members.length === 1) {
      collapsed.push(members[0]!);
      continue;
    }
    const sorted = [...members].sort(
      (a, b) => a.startTime.localeCompare(b.startTime) || a.teamName.localeCompare(b.teamName),
    );
    const primary = sorted[0]!;
    const partners = sorted.slice(1).map((slot) => slot.teamName);
    collapsed.push({
      ...primary,
      pairTeamName: partners.join(", ") || null,
    });
  }
  return collapsed.sort(comparePublicPractices);
}

function orientPracticeSlotForTeams(
  slot: PublicPracticeSlot,
  teams: string[],
): PublicPracticeSlot {
  if (teams.length !== 1) return slot;
  const selected = teams[0]!;
  if (slot.teamName === selected || !slot.pairTeamName) return slot;
  if (slot.pairTeamName !== selected) return slot;
  return {
    ...slot,
    teamName: selected,
    pairTeamName: slot.teamName,
  };
}

export function groupPublicPractices(slots: PublicPracticeSlot[]): PublicParkPracticeGroup[] {
  const sorted = [...slots].sort(comparePublicPractices);
  const parks: PublicParkPracticeGroup[] = [];
  for (const slot of sorted) {
    let park = parks.find((item) => item.parkName === slot.parkName);
    if (!park) {
      park = { parkName: slot.parkName, fields: [], dates: [] };
      parks.push(park);
    }
    if (slot.dateKey) {
      let dateGroup = park.dates.find((item) => item.dateKey === slot.dateKey);
      if (!dateGroup) {
        dateGroup = {
          dateKey: slot.dateKey,
          dateLabel: slot.dateLabel || slot.dateKey,
          slots: [],
        };
        park.dates.push(dateGroup);
      }
      dateGroup.slots.push(slot);
      continue;
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
  return games
    .filter((game) => {
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
    })
    .sort(comparePublicGames);
}

export function filterPublicPractices(
  slots: PublicPracticeSlot[],
  filters: { ageGroups?: string[]; teams?: string[]; parks?: string[] },
): PublicPracticeSlot[] {
  const ages = filters.ageGroups ?? [];
  const teams = filters.teams ?? [];
  const parks = filters.parks ?? [];
  return collapseSharedPracticeSlots(slots)
    .filter((slot) => {
      if (ages.length && !ages.includes(slot.ageGroup)) return false;
      if (parks.length && !parks.includes(slot.parkName)) return false;
      if (teams.length && !practiceTeamNames(slot).some((name) => teams.includes(name))) {
        return false;
      }
      return true;
    })
    .map((slot) => orientPracticeSlotForTeams(slot, teams))
    .sort(comparePublicPractices);
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
