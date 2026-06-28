import type { GcBracketMatchRef } from "@/lib/gamechanger/types";

/** Tournament bracket schedules are America/Chicago; GC web form uses the same local labels. */
const BRACKET_TIME_ZONE = "America/Chicago";

/** CDT offset when converting Central wall clock → true UTC (scoreboard start_ts). */
const CENTRAL_TO_UTC_OFFSET_HOURS = 5;

type WallClock = {
  year: number;
  month: number;
  day: number;
  hours24: number;
  minutes: number;
};

function formatGcFormDateFromParts(year: number, month: number, day: number): string {
  const monthLabel = String(month).padStart(2, "0");
  const dayLabel = String(day).padStart(2, "0");
  const yearLabel = String(year).slice(-2);
  return `${monthLabel}/${dayLabel}/${yearLabel}`;
}

function formatGcFormTimeFrom24h(hours24: number, minutes: number): string {
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  let displayHours = hours24 % 12;
  if (displayHours === 0) displayHours = 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function parseBracketWallClock(
  dateLabel: string,
  time?: string,
  year = new Date().getFullYear(),
): WallClock | undefined {
  const trimmedDate = dateLabel?.trim();
  if (!trimmedDate) return undefined;
  const dateMatch = trimmedDate.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!dateMatch) return undefined;

  let hours24 = 18;
  let minutes = 0;
  const trimmedTime = time?.trim();
  if (trimmedTime) {
    const timeMatch = trimmedTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i);
    if (timeMatch) {
      hours24 = Number(timeMatch[1]);
      minutes = Number(timeMatch[2]);
      const meridiem = timeMatch[3]?.toUpperCase();
      if (meridiem === "PM" && hours24 !== 12) hours24 += 12;
      if (meridiem === "AM" && hours24 === 12) hours24 = 0;
    }
  }

  return {
    year,
    month: Number(dateMatch[1]),
    day: Number(dateMatch[2]),
    hours24,
    minutes,
  };
}

/** True UTC instant for a Central wall-clock bracket time (CDT → UTC). */
function wallClockToTrueCentralUtc(wall: WallClock): Date {
  const shifted = new Date(
    Date.UTC(wall.year, wall.month - 1, wall.day, wall.hours24 + CENTRAL_TO_UTC_OFFSET_HOURS, wall.minutes, 0),
  );
  return shifted;
}

function normalizeBracketDateForGcForm(dateLabel: string, year: number): string {
  const match = dateLabel.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return dateLabel.trim();
  const month = match[1]!.padStart(2, "0");
  const day = match[2]!.padStart(2, "0");
  return `${month}/${day}/${String(year).slice(-2)}`;
}

function normalizeBracketTimeForGcForm(time: string | undefined): string {
  const trimmed = time?.trim();
  if (!trimmed) return "12:00 PM";

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return trimmed;

  let hours = Number(match[1]);
  const minutes = match[2]!;
  const meridiemRaw = match[3]?.toLowerCase();
  if (meridiemRaw === "pm" && hours !== 12) hours += 12;
  if (meridiemRaw === "am" && hours === 12) hours = 0;

  const meridiem = hours >= 12 ? "PM" : "AM";
  let displayHours = hours % 12;
  if (displayHours === 0) displayHours = 12;
  return `${displayHours}:${minutes} ${meridiem}`;
}

/**
 * Values to type into the GameChanger web form when Playwright uses timezoneId
 * America/Chicago (gc-writer). GC stores the entered Central wall clock correctly.
 */
export function gcWebFormScheduleFromBracketLabels(
  dateLabel: string,
  time?: string,
  year = new Date().getFullYear(),
): { gcFormDate: string; gcFormTime: string } | null {
  if (!dateLabel?.trim()) return null;
  return {
    gcFormDate: normalizeBracketDateForGcForm(dateLabel, year),
    gcFormTime: normalizeBracketTimeForGcForm(time),
  };
}

/** True UTC instant from a bracket Central time (for scoreboard event matching). */
export function bracketScheduleToUtcInstant(
  dateLabel: string,
  time?: string,
  year = new Date().getFullYear(),
): Date | undefined {
  const wall = parseBracketWallClock(dateLabel, time, year);
  if (!wall) return undefined;
  return wallClockToTrueCentralUtc(wall);
}

/** Form entry for a true UTC instant when the writer browser is America/Chicago. */
export function gcWebFormScheduleFromInstant(instant: Date): { gcFormDate: string; gcFormTime: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BRACKET_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(instant);
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const year = parts.find((part) => part.type === "year")?.value ?? "00";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "12";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value ?? "AM";
  return {
    gcFormDate: `${month}/${day}/${year}`,
    gcFormTime: `${hour}:${minute} ${dayPeriod}`,
  };
}
