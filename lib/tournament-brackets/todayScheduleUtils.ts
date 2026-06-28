import { TOURNAMENT_DISPLAY_TIME_ZONE } from "@/lib/tournament-monitor/formatDateTime";

export function parseBracketDateParts(
  dateLabel: string,
  _seasonYear?: number,
): { month: number; day: number } | null {
  const trimmed = dateLabel.trim().replace(/(\d{1,2})(st|nd|rd|th)/gi, "$1");
  const match = trimmed.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s|$)/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { month, day };
}

export function centralDateParts(now: Date = new Date()): { month: number; day: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TOURNAMENT_DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  return {
    month: Number(parts.find((part) => part.type === "month")?.value ?? "0"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "0"),
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
  };
}

export function isBracketDateToday(
  dateLabel: string | undefined,
  seasonYear: number,
  now: Date = new Date(),
): boolean {
  if (!dateLabel?.trim()) return false;
  const parsed = parseBracketDateParts(dateLabel, seasonYear);
  if (!parsed) return false;
  const today = centralDateParts(now);
  return parsed.month === today.month && parsed.day === today.day;
}

export function parseBracketTimeSortKey(time?: string): number {
  const trimmed = time?.trim();
  if (!trimmed) return Number.POSITIVE_INFINITY;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return Number.POSITIVE_INFINITY;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]!.toUpperCase();
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function normalizeScheduleField(field?: string, venue?: string): string {
  const trimmedField = field?.trim();
  if (trimmedField) return trimmedField;
  const trimmedVenue = venue?.trim();
  if (trimmedVenue) return trimmedVenue;
  return "TBD";
}

export function compareScheduleFields(left: string, right: string): number {
  const sortKey = (field: string): [number, string] => {
    const match = field.match(/^F(\d+)$/i);
    if (match) return [0, match[1]!.padStart(3, "0")];
    if (field.toUpperCase() === "TBD") return [2, ""];
    return [1, field.toLowerCase()];
  };
  const [leftRank, leftLabel] = sortKey(left);
  const [rightRank, rightLabel] = sortKey(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return leftLabel.localeCompare(rightLabel, "en-US");
}

export function formatTodayScheduleHeading(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TOURNAMENT_DISPLAY_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
}
